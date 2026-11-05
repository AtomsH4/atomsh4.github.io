---
title: Cherry Studio System Doctor 的前后端状态边界
summary: 复盘 System Doctor 前端接入，区分后端检查事实、前端会话状态与派生视图，记录取消、过期报告、AI 诊断和问题上报之间的边界。
pubDate: "2026-09-18T16:58:43+08:00"
tags:
  - Cherry Studio
  - React
  - 状态管理
  - 开源实践
featured: false
draft: false
---

系统诊断界面不只是把检查结果排成列表。用户还会取消检查、展开证据、尝试修复、保存诊断信息，或者带着错误描述去上报问题。如果这些行为都各自维护一份“当前结果”，界面很容易同时出现几种互相矛盾的答案。

这篇文章复盘我参与的 [System Doctor 前端 PR](https://github.com/CherryHQ/cherry-studio/pull/20006)，它于 2026 年 9 月 18 日合入 `main`。本站按 PR 合并时间归档，本文于 2026 年 10 月 3 日整理；以[合并提交](https://github.com/CherryHQ/cherry-studio/commit/b59f007d93e11f35f2f0cd00c1ead27f06a213b4)为依据，讨论的是当时的前端接入，而不是重新设计后端诊断引擎，也不据此判断正式版本的发布范围。

这次实践中最重要的边界是：后端拥有检查事实，前端拥有交互过程，展示数据从已有事实派生。把三者分开，才能在增加交互时不制造另一套诊断结果。

## 后端结果与前端会话不是同一种状态

Doctor 前端通过共享缓存读取 `doctor.state`，它是后端诊断状态在渲染进程中的入口。报告里的检查结果与修复动作不能因为用户点了按钮，就在页面里被提前改成成功。[状态读取与操作入口](https://github.com/CherryHQ/cherry-studio/blob/b59f007d93e11f35f2f0cd00c1ead27f06a213b4/src/renderer/hooks/doctor/useDoctorController.ts#L58-L87)

但“以后端为准”并不意味着前端不能持有状态。当前打开哪个面板、问题描述写到哪里、正在确认哪条证据，都属于本次界面会话。把这些细节塞进后端报告，只会让诊断数据依赖某个页面的组织方式。

| 状态 | 归属和用途 |
| --- | --- |
| Doctor 检查状态与报告 | 后端事实，通过共享状态供前端消费。 |
| 面板、描述草稿、证据授权和交互阶段 | 前端会话，由 session reducer 管理。 |
| 分组、问题数量、过期标记和可取消状态 | 由状态构建视图模型，不作为另一份独立报告保存。 |

`DoctorSessionState` 没有再复制一组检查结果，而是保存 `activePanel`、`descriptionDraft`、`evidenceGrant`、`relaunchRequired` 和 `interaction`。证据授权还带有 `runId`，避免把上一轮的授权直接套到新一轮结果上。[会话状态定义与 reducer](https://github.com/CherryHQ/cherry-studio/blob/b59f007d93e11f35f2f0cd00c1ead27f06a213b4/src/renderer/hooks/doctor/doctorSessionReducer.ts#L18-L80)

我理解这一区分的价值，不在于减少几个 `useState`，而在于让每个值都能回答“谁有权改变它”。页面可以切换面板，但不能自行宣布系统检查已经通过。

## 分开管理交互转换和结果投影

这个实现用 reducer 描述会话转换，用 controller 调用既有 IPC 并处理交互结果，再用派生 view model 组织列表与汇总。三者的职责不同，不是把同一份状态换三个地方保存。

下面是状态读取与投影的源码删节，省略了共享缓存就绪监听、会话初始化和过期计时 effect，保留三者之间的数据依赖：

```tsx
const cachedDoctorState = useSharedCacheValue('doctor.state')
const doctorState = cachedDoctorState ?? IDLE_DOCTOR_STATE

const viewModel = useMemo(
  () => buildDoctorViewModel(doctorState, now),
  [doctorState, now]
)
```

[源码摘录来源：useDoctorController.ts 状态投影](https://github.com/CherryHQ/cherry-studio/blob/b59f007d93e11f35f2f0cd00c1ead27f06a213b4/src/renderer/hooks/doctor/useDoctorController.ts#L59-L87)。`now` 是控制器维护的时间值，用来重新计算报告是否过期；`viewModel` 随后端状态与时间派生，并没有独立维护一份检查报告。缓存就绪前的 `idle` 回退也不代表可以立即运行检查，后文的自动运行逻辑另有就绪判断。

<figure>
  <a href="/media/blog/cherry-studio-doctor/state-ownership.svg" aria-label="查看 Doctor 状态归属原图">
    <img src="/media/blog/cherry-studio-doctor/state-ownership.svg" width="848" height="1168" loading="lazy" decoding="async" alt="Doctor 状态归属示意：前端 Controller 经 IPC 发出命令，后端通过 doctor.state 发布检查事实，再派生为 ViewModel；前端 Session 单独管理面板、草稿、授权和交互状态，两类数据共同驱动界面。修复返回成功不会由前端直接改写报告，AI 诊断不计入 Doctor 报告统计。" />
  </a>
  <figcaption>图 1　Doctor 的主要状态依赖，而非完整调用时序。控制器读取共享状态并构建视图模型，同时管理会话交互；操作提示与后端检查事实分开更新。依据本文固定的合并版本绘制，点击图片可放大查看，再次点击图片关闭。</figcaption>
</figure>

例如，完成状态下的列表按照后端 catalog 匹配实际返回的结果；运行状态下可以展示等待中的检查项，但不会为尚未返回的结果编造修复动作。动作来自结果本身，并且过期报告的动作会被禁用。[结果投影与动作来源](https://github.com/CherryHQ/cherry-studio/blob/b59f007d93e11f35f2f0cd00c1ead27f06a213b4/src/renderer/utils/doctor/doctorViewModel.ts#L57-L107)

这也划清了“派生展示”和“合成事实”的区别。根据已有结果计算问题数量是展示逻辑；根据一个检查 ID 猜出它应该有什么修复动作，则越过了后端契约。前者可以集中到纯函数中，后者不应该由界面补齐。

## 请求结束不等于检查状态已经改变

点击运行或取消之后，controller 会记录正在进行的界面交互并调用 IPC，随后结束这次交互。检查本身是否运行、取消或完成，仍然由 `doctor.state` 决定。前端没有因为 IPC 调用返回，就把报告乐观改写成自己预期的状态。[运行与取消实现](https://github.com/CherryHQ/cherry-studio/blob/b59f007d93e11f35f2f0cd00c1ead27f06a213b4/src/renderer/hooks/doctor/useDoctorController.ts#L103-L143)

```tsx
const run = useCallback(
  async (tier: DoctorRunTier) => {
    dispatch({
      type: 'start-interaction',
      interaction: { kind: 'run', tier }
    })
    try {
      await ipcApi.request('diagnostics.doctor.run', { tier })
    } catch (error) {
      logger.error('Failed to run system diagnostics', error as Error)
      toast.error(t('settings.doctor.messages.run_failed'))
    } finally {
      dispatch({ type: 'finish-interaction', kind: 'run' })
    }
  },
  [t]
)
```

[源码摘录来源：useDoctorController.ts 运行请求](https://github.com/CherryHQ/cherry-studio/blob/b59f007d93e11f35f2f0cd00c1ead27f06a213b4/src/renderer/hooks/doctor/useDoctorController.ts#L103-L119)。这里的 `dispatch` 作用于前端会话 reducer；`finish-interaction` 只结束这次界面交互，没有设置 `doctorState.status`，也没有把检查项改成成功。

是否允许取消由同一个 `canCancelDoctorRun` 判断，它要求当前状态是 `running`，并不把快速检查排除在外。视图模型使用这个判断，controller 也用它保护取消入口，让按钮展示与操作条件保持一致。[统一的取消条件](https://github.com/CherryHQ/cherry-studio/blob/b59f007d93e11f35f2f0cd00c1ead27f06a213b4/src/renderer/utils/doctor/doctorViewModel.ts#L51-L53)

修复操作也遵循同样的边界：controller 根据返回值显示成功、失败、结果已变或需要重启的提示；需要重启时记录前端提示状态，但不会直接篡改报告中的检查项。[修复结果处理](https://github.com/CherryHQ/cherry-studio/blob/b59f007d93e11f35f2f0cd00c1ead27f06a213b4/src/renderer/hooks/doctor/useDoctorController.ts#L164-L189)

这对诊断界面尤其重要。“用户要求修复”“修复命令已经返回”和“新的检查证明问题消失”是不同事件，不能用一个成功提示把它们合并。

## 过期报告仍然有阅读价值

重新打开界面时，自动跑一遍检查看起来很自然，却可能替换掉用户正在调查的那份结果。这个版本等待共享缓存就绪后，仅在 Doctor 处于 `idle` 时自动发起快速检查；已有运行和报告不会因为重新打开就被自动覆盖。[初始化与自动运行条件](https://github.com/CherryHQ/cherry-studio/blob/b59f007d93e11f35f2f0cd00c1ead27f06a213b4/src/renderer/hooks/doctor/useDoctorController.ts#L121-L130)

报告到期后仍然保留展示，同时标记过期、禁用其动作，并提供显式的基础检查入口。用户可以先阅读旧结果，再决定是否更新。[过期提示与手动重跑入口](https://github.com/CherryHQ/cherry-studio/blob/b59f007d93e11f35f2f0cd00c1ead27f06a213b4/src/renderer/components/doctor/DoctorCheckNotices.tsx#L18-L33)

这里的取舍是保留上下文，而不是追求每次打开都得到最新数据。它也有成本：界面必须清楚提示数据已经过期，并让重跑操作容易找到。保留旧报告不等于继续允许用户基于旧结果执行修复。

## 同屏展示不意味着共享同一份报告

错误总览同时呈现 AI 诊断和 Doctor 系统检查，但二者保留各自的执行路径。AI 诊断调用原有的诊断能力，在这个合并版本中由按钮触发；不能把它描述成“打开错误详情就自动与 Doctor 并发运行”。[AI 诊断入口](https://github.com/CherryHQ/cherry-studio/blob/b59f007d93e11f35f2f0cd00c1ead27f06a213b4/src/renderer/components/ErrorDetailModal/AiDiagnosisSection.tsx#L42-L65)、[手动触发按钮](https://github.com/CherryHQ/cherry-studio/blob/b59f007d93e11f35f2f0cd00c1ead27f06a213b4/src/renderer/components/ErrorDetailModal/AiDiagnosisSection.tsx#L123-L135)

AI 状态由渲染进程局部管理，Doctor 汇总继续基于 Doctor 的行数据。把两种内容放在同一个总览里，是为了方便阅读，不是把 AI 输出加入后端检查 catalog 或报告统计。[错误总览的状态与汇总](https://github.com/CherryHQ/cherry-studio/blob/b59f007d93e11f35f2f0cd00c1ead27f06a213b4/src/renderer/components/ErrorDetailModal/ErrorDiagnosticsPanel.tsx#L40-L58)

诊断导出与问题上报也复用了已有流程，而不是把 `DoctorReport` 当成可以随意加入的附件或描述字段。错误描述的预填有明确的字段投影，没有把 AI 输出与 Doctor 报告自动拼进去。[上报描述的字段选择](https://github.com/CherryHQ/cherry-studio/blob/b59f007d93e11f35f2f0cd00c1ead27f06a213b4/src/renderer/components/ErrorDetailModal/diagnosticReportDescription.ts#L64-L91)

我从这里得到的经验是：入口可以统一，数据契约不必被强行统一。是否应该让一个结果进入另一条流程，需要接收方的契约和用户预期共同支持，不能只因为它们在视觉上相邻。

## 记录实现边界而不是把未决问题写成成果

PR 还记录了忙碌上报时保留当前表单或结果、显示错误并允许手动重试的行为。它没有用自动重试替用户重复提交，也没有为了这个界面增加新的后端接口或全局事件总线。[实现范围与取舍](https://github.com/CherryHQ/cherry-studio/pull/20006)

同时，弹窗已打开时再次调用 `show()` 应如何处理活动任务、未提交描述和跨窗口归属，是当时明确延后的产品决策。现有 single-flight 行为保持不变；不能把“统一诊断入口”扩大解读成已经完成所有多窗口会话策略。

如果说[用 Skill 梳理 Cherry Studio 的生命周期设计](/blog/cherry-studio-lifecycle-skill/)关注的是谁拥有运行时资源，这篇复盘关注的就是谁拥有事实、谁拥有交互。后端报告、前端会话和派生视图各自清楚，界面才能增加功能而不增加互相竞争的状态来源。
