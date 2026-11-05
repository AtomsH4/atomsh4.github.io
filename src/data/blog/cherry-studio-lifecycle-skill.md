---
title: 用 Skill 梳理 Cherry Studio 的生命周期设计
summary: 我把 Cherry Studio 的生命周期设计判断整理成一个只读分析 skill，从资源归属出发，讨论何时需要 Lifecycle、怎样避免过度设计，以及如何用评估场景约束 AI 的建议。
pubDate: 2026-10-02
tags:
  - Cherry Studio
  - AI Agent
  - Skill
  - 架构设计
featured: false
draft: false
---

> **项目仓库：[AtomsH4 / cherry-studio-skills](https://github.com/AtomsH4/cherry-studio-skills)**
>
> Skill 原文、分析规范和评估场景都在这个公开仓库中。下文两张配图根据仓库规则整理，点击图片可放大查看，再次点击图片关闭。

给一个主进程能力起名为 `SomethingService`，并不能回答它是否需要接入生命周期系统。一次调用结束后，有没有资源继续存在？谁负责关闭它？初始化只成功了一半怎么办？这些问题比类名更能决定设计。

我在 [cherry-studio-skills](https://github.com/AtomsH4/cherry-studio-skills) 中记录了面向 Cherry Studio 开发的 AI agent skill。本文对应的仓库版本公开了一个 skill：`design-cherry-lifecycle`。它关注主进程能力的资源归属、启动时机、运行时切换和退出清理，帮助 agent 在提出设计前先建立判断依据。

它的作用范围也很明确：只读分析和建议，不修改被分析仓库，不生成可直接执行的实现计划。本文围绕这个 skill 的规则和评估场景展开，不把它当作 Cherry Studio 所有架构约定的完整说明。[仓库说明](https://github.com/AtomsH4/cherry-studio-skills/blob/f7dd28db73107dc351ae513907a5a59a81c87a72/README.md)

## 先判断谁拥有资源

在这套规则中，Lifecycle 要解决的是运行时资源与持续性副作用的归属问题。例如，文件监听器、定时器、worker、子进程、连接，以及调用返回后仍然有效的全局处理器，都需要有人对它们的存续负责。

但发现一个长期存在的资源，也不能立即得出“新增一个生命周期服务”的结论。还要检查是否已有组件正确管理了它，以及普通函数、直接导入的单例或现有 Lifecycle owner 能否承担这份责任。

这要求分析时分清四件事：

- **数据归属**：谁维护持久化记录和数据不变量。
- **命令编排**：谁组织一次请求中各个步骤的调用顺序。
- **业务实体状态**：任务、下载、会话等对象如何在业务状态之间转换。
- **运行时资源归属**：谁创建、持有并释放跨调用存续的资源。

这些职责可以协作，却不必集中在一个服务里。任务有“运行中”和“已完成”状态，不代表处理任务的每个对象都需要应用级生命周期；协调器调用了多个服务，也不代表它拥有那些服务的资源。

`design-cherry-lifecycle` 因此要求先阅读目标仓库的说明、代码、调用点和测试。当前仓库的实际契约优先于 skill 中的概括，涉及数据、IPC、窗口或后台任务时，再读取对应边界的文档。[Skill 入口](https://github.com/AtomsH4/cherry-studio-skills/blob/f7dd28db73107dc351ae513907a5a59a81c87a72/skills/design-cherry-lifecycle/SKILL.md)

## 三种结论让不确定性有位置

分析规范只允许返回三种判定：

- **Lifecycle required**：已经找到需要管理的跨调用资源或持续性全局副作用，并且更简单的方案不能正确承担其生命周期责任。
- **Lifecycle not justified**：能力只在请求内工作、没有状态，或者实际资源已经由其他组件正确管理。
- **Insufficient evidence**：资源、归属、存续时间、顺序、清理或恢复等关键事实不足以支持前两种结论。

<figure>
  <a href="/media/blog/cherry-studio-lifecycle/decision.svg" aria-label="查看图一原图：Lifecycle 资源归属判定流程">
    <img src="/media/blog/cherry-studio-lifecycle/decision.svg" width="816" height="1104" loading="lazy" decoding="async" alt="Lifecycle 判定流程：关键事实不足时先补充证据；没有跨调用资源或持续性全局副作用时无需新增服务；存在资源时依次比较函数、单例和现有 owner，只有更小方案均无法正确承担归属时才需要独立生命周期服务。" />
  </a>
  <figcaption>图 1　是否需要新增 Lifecycle 服务，先由证据和资源归属决定。根据仓库分析规范绘制，点击图片可放大查看，再次点击图片关闭。</figcaption>
</figure>

图 1 要从顶部读起：先确认关键事实，再判断是否存在需要持续管理的资源或副作用，最后比较更小的方案。右侧两个蓝色出口说明，“没有跨调用资源”和“已有合适的 owner”都可能支持不新增 Lifecycle 服务，但理由不同。

顶部的“证据不足”出口尤其值得保留。假如需求只说“`ModelClientService` 缓存客户端并调用模型供应商”，我们还不知道客户端是否持有连接、缓存如何淘汰、凭据能否运行时变更、失败后如何清理。这个案例应停在图中的第一个分支；仅凭“缓存”和 `Service` 后缀，无法决定该选哪种生命周期形态。

同样，证据不足也不能自动变成“用单例就好”。只要缺失的信息可能改变结论，就应先列出需要补充的事实。

在证据充分之后，方案比较按以下顺序进行：

1. 普通函数，适用于资源完全属于单次调用的工作。
2. 直接导入的单例，适用于共享的无状态逻辑，或不依赖应用启动和清理顺序的有限内存协调。
3. 现有生命周期 owner，前提是新资源自然属于它，并且不会模糊其职责。
4. 新生命周期服务，用于前三种方式无法正确承接、且具有独立生命周期责任的资源 owner。

这个顺序把论证重点放在“为什么较小的方案不够”。`application.get()` 使用方便、类的形态统一、依赖很多，或者将来可能复用，都不能单独成为新增服务的理由。[判定原则与决策顺序](https://github.com/AtomsH4/cherry-studio-skills/blob/f7dd28db73107dc351ae513907a5a59a81c87a72/skills/design-cherry-lifecycle/references/lifecycle-analysis.md#decision-ladder)

## 需要 Lifecycle 以后再选择具体能力

确定需要 Lifecycle，只完成了第一步。接下来要根据真实的状态转换，选择最小的形态。

| 形态 | 对应的实际需求 |
| --- | --- |
| `BaseService` | 资源或持续性副作用需要随应用启动和停止。 |
| `@Conditional` | 启动前已确定、会话内不变的条件，决定整个服务是否存在。 |
| `Activatable` | 运行中需要反复获取和释放资源，或按需启用较重资源。 |
| `Pausable` | 暂停执行并保留同一服务实例及资源，之后继续运行。 |

<figure>
  <a href="/media/blog/cherry-studio-lifecycle/transitions.svg" aria-label="查看图二原图：条件加载、启停与暂停的区别">
    <img src="/media/blog/cherry-studio-lifecycle/transitions.svg" width="808" height="1136" loading="lazy" decoding="async" alt="三种生命周期能力对比：Conditional 在启动时按固定条件纳入或排除整个服务；Activatable 在服务和控制 IPC 常驻时反复获取或释放资源；Pausable 在保留实例和资源的前提下暂停与恢复工作，备份场景还要求停止接收并排空在途任务。" />
  </a>
  <figcaption>图 2　三种能力分别改变服务的存在、资源的持有和工作的执行。下方的暂停流程采用仓库备份场景的排空约定，点击图片可放大查看，再次点击图片关闭。</figcaption>
</figure>

图 2 的三行回答不同的问题：第一行在应用组成时做一次选择；第二行可以反复获取和释放资源；第三行在资源保留的情况下暂停和恢复工作。它们表达的是不同能力，不能因为都有“开关”的感觉，就互相替换，也不应把它们理解成互斥的服务分类。

如果一个原生 hook 仅支持 macOS，平台在启动前就已确定，会话中不会改变，那么条件控制的是整个服务是否进入应用组成。仓库的评估场景为此选择 `@Conditional(onPlatform('darwin'))`；始终存在的消费者需要通过 `application.getOptional()` 处理服务缺席，也不能无条件依赖一个可能被排除的服务。

如果本地发现功能受用户偏好控制，用户可以反复开关，情况就不同了。此时适合 `Activatable`：启用时创建 mDNS browser，停用时完整释放；轻量的控制和状态 IPC 仍可常驻。规范特别强调，资源轻重并不是唯一标准，反复发生的运行时开关本身就需要获取与释放的语义。

备份前暂停同步则是另一种需求。调度器需要停止接收新任务，等待正在执行的工作按约定排空，同时保留 worker 和配置，备份后继续调度。这对应 `Pausable`。暂停完成应具有可观察的含义：依赖它的备份流程可以据此确认排空已经完成。

接口选择还需要配合启动和退出契约。规范要求结合最早的真实消费者，以及所需输入首次全部有效的时机，确定启动阶段，不能默认越早越好；`@DependsOn` 只表达必要的同阶段顺序，不重复表达阶段之间已有的先后关系。IPC 能否调用与底层资源是否就绪，也需要分别定义。[生命周期形态与顺序规则](https://github.com/AtomsH4/cherry-studio-skills/blob/f7dd28db73107dc351ae513907a5a59a81c87a72/skills/design-cherry-lifecycle/references/lifecycle-analysis.md#smallest-justified-lifecycle-shape)

## 用具体场景检查判断有没有跑偏

仓库的 `evals` 文件包含 9 个独立场景，每个场景给出问题和预期不变量，并要求使用新的 agent 分别评估。它们用于检查判断与证据，不要求回答逐字匹配，也不是一份已经执行通过的测试报告。下面提到的服务名都来自这些评估场景，不代表本文验证过的 Cherry Studio 实际实现。

**项目索引监听器与单次导出编码器**构成了一组直接的对照。前者维护内存索引和文件监听器，退出时还要处理待写入变更；场景已经确认不存在其他合适的 owner，因此需要 Lifecycle，对应图 1 底部的绿色出口。后者在每次导出时创建编码器，并在该次调用的 `finally` 中释放，没有跨调用资源，对应图 1 右侧第一个蓝色出口，不应仅为依赖注入而接入 Lifecycle。

**归档协调器与无状态系统信息处理器**检查的是另一类误判。归档操作可以先要求现有 owner 停止 runtime，再通过事务写数据库，最后要求调度器移除任务。调用顺序重要，但资源仍由各自 owner 管理。返回版本号和平台信息的 IPC handler 也不需要为了“看起来一致”而包装成新生命周期服务；只有注册本身确实产生需要管理和清理的持续性契约时，才进一步讨论对应归属。

**本地发现开关、备份暂停、平台条件 hook**覆盖了前文三种容易混淆的转换：反复启停资源、保留资源暂停工作，以及在启动时排除整个服务。

最后两个场景分别检查证据和架构边界。**描述不充分的模型客户端**应得到 `Insufficient evidence`；**通用生命周期引擎中的实体专用分支**则要求把业务状态、恢复策略和领域顺序放回合适的领域 owner。即便移除了通用引擎中针对某个服务名的特殊分支，真正拥有长期进程的运行时服务仍可能需要 Lifecycle。

我理解这组场景的价值，在于同时检查两类错误：该管理的资源没有管理，以及没有独立资源归属却增加了生命周期抽象。[完整评估场景](https://github.com/AtomsH4/cherry-studio-skills/blob/f7dd28db73107dc351ae513907a5a59a81c87a72/evals/design-cherry-lifecycle.md)

## 让分析结论可以被复查

这套 skill 还规定了回答结构：判定与置信度、证据、过度设计评估、替代方案、推荐设计、不可执行的实现提纲，以及待补充证据。其目的，是让读者能够追踪结论来自哪里、还有哪些信息会改变设计。

其中，**正确性要求**与**设计取舍**需要明确分开。资源泄漏、竞态、数据丢失、不可调用的命令或无法恢复的状态，需要具体契约和行为证据来说明；可维护性、统一性、性能或扩展性方面的偏好，则可能存在多个正确方案。空生命周期 hook 等过度设计信号，也不能直接被写成确定的功能缺陷。

当结论是 `Lifecycle required` 时，建议还必须交代每项资源怎样释放、部分初始化失败怎样回滚、反复启停怎样工作，以及退出时如何停止接收任务并处理在途工作。存在持久化状态时，还要说明中断后的恢复和对账。启动钩子中放出去的后台任务，同样要有失败处理和退出安排。

这也划清了 Lifecycle 与数据事务的边界：生命周期钩子不能替代数据库事务。持久化事实需要原子提交，依赖提交结果的通知或外部副作用放在提交之后；两者之间发生崩溃时，还需要重试或对账机制。[边界规则与输出契约](https://github.com/AtomsH4/cherry-studio-skills/blob/f7dd28db73107dc351ae513907a5a59a81c87a72/skills/design-cherry-lifecycle/references/lifecycle-analysis.md#boundary-rules)

## 把它用在一次设计讨论中

仓库 README 提供了 [skill 的安装目录](https://github.com/AtomsH4/cherry-studio-skills/tree/main/skills/design-cherry-lifecycle)。使用时，最好提供实际目标、已有方案和需要判断的问题，让 agent 能够定位文档、调用点、相似实现与测试。一个请求可以这样写：

> 请使用 design-cherry-lifecycle 分析这个主进程能力。先读取目标仓库的架构说明、相关实现和测试，确认资源归属与清理责任，再判断是否需要 Lifecycle。比较普通函数、直接导入单例、现有 owner 和新服务；证据不足时列出缺失事实。只输出分析，不修改代码。

这段请求只是使用示例。最终判定仍然取决于目标仓库的证据，不能预先指定“必须做成服务”。

对我来说，这个仓库值得记录的是一种 skill 写法：明确它何时介入、要查哪些证据、允许得出什么结论，以及权限到哪里为止。这样，读者能够根据证据复查 AI 的建议，也能在事实变化后重新判断。

本文依据 2026 年 10 月 2 日核对的仓库版本整理，规则与评估场景的引用固定到提交 [`f7dd28d`](https://github.com/AtomsH4/cherry-studio-skills/commit/f7dd28db73107dc351ae513907a5a59a81c87a72)。后续使用时，以目标仓库当前文档和代码为准。
