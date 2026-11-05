---
title: 从 Cherry Studio 回收站 PR 看状态机、事务与不变量
summary: 以回收站 PR 为例，把状态建模、合法转换、守卫条件、原子边界、恢复策略和契约测试串起来，理解 SQLite 事务、并发锁与提交后恢复分别保证什么。
pubDate: 2026-09-17T08:54:00Z
tags:
  - Cherry Studio
  - SQLite
  - 状态机
  - 数据一致性
featured: false
draft: false
---

一个对话已经被窗口 B 从回收站恢复，窗口 A 却还停留在旧列表上。此时 A 点击“永久删除”，后台应该相信页面，还是重新检查数据库？另一个场景是：Agent 已经归档，但停用定时任务时发生异常，系统能不能留下“实体已归档、任务仍启用”的结果？

这两类问题把回收站从一个列表页面，变成了关于状态、并发与数据一致性的设计问题。

本文以 Cherry Studio 的[回收站 PR #16746](https://github.com/CherryHQ/cherry-studio/pull/16746)为案例。它于 **2026 年 9 月 17 日**合入 `main`；本站按 PR 合并时间归档，本文于 **2026 年 10 月 3 日**整理。源码和测试链接固定到[合并提交 `2ef123931a`](https://github.com/CherryHQ/cherry-studio/commit/2ef123931a3e82ad1cd6713abccc9d4962fb85bb)，以最终代码为依据，不将 PR 讨论期间的中间方案或后续改动混入复盘。

文章用 Topic 对话解释基础流转，用 Agent 与定时任务解释跨表事务和恢复。配图是对该版本的抽象；标有“源码摘录”的代码来自固定提交，SQL 和伪代码示例用于解释原理。文中的测试说明已有验证覆盖，不代表本文重新执行了 Cherry Studio 的测试，也不等同于对所有崩溃和并发情况的形式化证明。

## 1. 状态建模：一个时间戳表达了什么

在这个实现中，“归档”对应进入回收站的可恢复软删除。核心实体不需要再存一列 `status = archived`，而是根据记录是否存在、`deletedAt` 是否为空推导状态。

| 状态 | 持久化事实 | 允许的后续操作 |
| --- | --- | --- |
| `active` | 行存在，`deletedAt` 为空 | 正常使用、归档、专用入口永久删除 |
| `trashed` | 行存在，`deletedAt` 为时间戳 | 恢复、回收站永久删除、到期清理 |
| `missing` | 行不存在 | 无法通过恢复命令找回 |

Agent 的状态读取直接体现了这一点：

```typescript
getLifecycleState(id: string): AgentLifecycleState {
  const row = this.findAgentRow(id, { includeDeleted: true })
  if (!row) return 'missing'
  return row.deletedAt == null ? 'active' : 'trashed'
}
```

[源码摘录：AgentService 的状态推导](https://github.com/CherryHQ/cherry-studio/blob/2ef123931a3e82ad1cd6713abccc9d4962fb85bb/src/main/data/services/AgentService.ts#L989-L993)。这里的 `missing` 只说明记录不存在，不能区分“从未存在”和“已被永久删除”。这套设计没有为删除历史额外保留一行墓碑记录。

<figure>
  <a href="/media/blog/cherry-studio-trash/states.svg" aria-label="查看回收站状态流转原图">
    <img src="/media/blog/cherry-studio-trash/states.svg" width="752" height="984" loading="lazy" decoding="async" alt="以 Topic 对话为例的回收站状态流转：正常对话可以归档或通过专用入口永久删除，操作前需要满足空闲条件；已归档对话可以恢复或永久删除；记录不存在后无法通过恢复命令找回。" />
  </a>
  <figcaption>图 1　以 Topic 对话为例的实体状态与合法转换。归档时间同时参与保留期限计算；missing 不保存删除历史。点击图片可放大查看，再次点击图片关闭。</figcaption>
</figure>

`deletedAt` 比单纯的 `isDeleted` 多保存了一个重要事实：对象何时进入回收站。自动清理可以使用 `deletedAt < cutoff` 选择过期记录，不必再维护一份可能与状态不同步的归档时间。

这种编码适合当前有限的持久化状态，但不能表达所有运行过程。“正在生成”“等待审批”“终态落盘尚未完成”由运行时另行维护，作为能否转换的条件。把它们都拼进一个巨大枚举，会让实体状态与执行状态互相纠缠。

### 软删除没有触发物理删除的外键动作

从关系数据库的角度看，设置 `deleted_at` 是一次普通 `UPDATE`。父记录仍然存在，因此外键仍然能够引用它；`ON DELETE CASCADE` 或 `ON DELETE SET NULL` 不会因为设置了软删除字段而触发。[SQLite 外键动作说明](https://www.sqlite.org/foreignkeys.html#fk_actions)

在这个 PR 中，Topic 归档保留消息，只修改容器状态并清除标签关联、置顶；恢复后消息仍在，标签和置顶不会自动重建。物理删除则通过消息服务等明确清理关联数据，再删除 Topic。[归档与永久删除实现](https://github.com/CherryHQ/cherry-studio/blob/2ef123931a3e82ad1cd6713abccc9d4962fb85bb/src/main/data/services/TopicService.ts#L500-L568)

同样，Assistant 和 Topic 的关联采用 `ON DELETE SET NULL`，允许在未选择级联删除时保留对话。可见，外键保证的是引用关系；“归档是否包含子对象”“恢复哪些内容”仍然需要业务规则。[Topic 外键定义](https://github.com/CherryHQ/cherry-studio/blob/2ef123931a3e82ad1cd6713abccc9d4962fb85bb/src/main/data/db/schemas/topic.ts#L18-L20)

## 2. 合法转换：把来源状态写进数据库条件

一个状态机可以抽象成下面的关系：

```text
当前状态 + 命令 + 守卫条件
    → 下一状态 + 数据修改 + 提交后副作用
```

回收站最重要的限制之一，是“永久删除”有不同的命令来源：

| 命令 | 来源状态 | 目标状态 |
| --- | --- | --- |
| 归档 | `active` | `trashed` |
| 恢复 | `trashed` | `active` |
| 回收站永久删除 | `trashed` | `missing` |
| 正常对象专用永久删除 | `active` | `missing` |

正常对话的直接永久删除通过专用 IPC 入口，明确传入 `targetState: 'active'`。回收站删除默认只接受 `trashed`，不会因为客户端记着一个 ID，就删除任何同名对象。[命令入口](https://github.com/CherryHQ/cherry-studio/blob/2ef123931a3e82ad1cd6713abccc9d4962fb85bb/src/main/services/trash/TrashService.ts#L98-L111)

下面的 SQL 用来解释条件更新，省略了永久删除时消息和关联数据的清理，**不是生产删除路径的替代实现**。仓库使用 Drizzle 的 `snake_case` 映射，因此 TypeScript 中的 `deletedAt` 对应 SQL 列 `deleted_at`。

```sql
-- 恢复：只接受当前仍在回收站的记录。
UPDATE topic
SET deleted_at = NULL
WHERE id = :id AND deleted_at IS NOT NULL
RETURNING id;

-- 仅演示回收站删除的来源状态条件。
DELETE FROM topic
WHERE id = :id AND deleted_at IS NOT NULL
RETURNING id;
```

如果窗口 B 已经恢复对象，窗口 A 的旧删除请求就不能匹配第二条语句的条件。生产代码在同一写事务中先按来源状态选出目标，再清理消息及关联记录，最终删除实体；恢复则是一条带来源条件的原子更新。[来源状态过滤与恢复实现](https://github.com/CherryHQ/cherry-studio/blob/2ef123931a3e82ad1cd6713abccc9d4962fb85bb/src/main/data/services/TopicService.ts#L535-L584)

这与“先在页面判断，再无条件修改数据库”的差别，在于条件是在执行操作时检查的。它具有条件写入的思路，但不是完整的版本号乐观锁：`trashed → active → trashed` 后，旧请求仍可能匹配当前状态。当前契约保护的是“已恢复且目前正常的对象”，没有承诺区分每一次归档的世代。

重复请求也要单独定义。Topic 已归档后再次归档、正常状态再次恢复会返回 `NOT_FOUND`；部分 Agent 删除入口返回 `deleted: false`。这些结果都不会强行执行非法转换，却不意味着所有接口都承诺相同的幂等成功响应。

## 3. 守卫条件：数据库事务为什么还不够

数据库知道 `deletedAt`，但不会自动知道某个对话正在等待模型返回、等待用户审批，或者正在写入最后一条消息。归档前需要检查这些运行事实。

`TrashService` 的 Topic 归档入口很短，但调用顺序很重要：

```typescript
async archiveTopics(topicIds: string[]): Promise<DeleteTopicsResult> {
  const ids = [...new Set(topicIds)].sort()
  return this.withTopicLocks(ids, async () => {
    this.assertTopicsSettled(ids)
    return topicService.deleteByIds(ids)
  })
}
```

[源码摘录：先加锁，再检查，再变更](https://github.com/CherryHQ/cherry-studio/blob/2ef123931a3e82ad1cd6713abccc9d4962fb85bb/src/main/services/trash/TrashService.ts#L98-L103)。外层回调可以是异步的，但 `deleteByIds` 内部的数据库事务仍然同步执行。

如果把检查移到锁外，就会出现典型的检查与使用之间的竞争：刚检查完“没有生成”，另一请求就启动了生成，而归档仍依据刚才的检查继续执行。

<figure>
  <a href="/media/blog/cherry-studio-trash/admission.svg" aria-label="查看归档与新生成竞争的原图">
    <img src="/media/blog/cherry-studio-trash/admission.svg" width="752" height="1104" loading="lazy" decoding="async" alt="并发竞争对比：没有共享锁时，新生成可插入空闲检查与归档之间；取得同一把 dispatch lock 后，在锁内检查未完成工作并同步提交数据库事务，新生成准入不能插入这段过程。" />
  </a>
  <figcaption>图 2　dispatch lock 保护“检查运行条件到提交转换”的窗口。锁释放后，新请求仍需遵守实体当前状态；等待取得锁不代表一定允许生成。点击图片可放大查看，再次点击图片关闭。</figcaption>
</figure>

这里有两种保护，负责不同的事情：

| 保护机制 | 保护范围 |
| --- | --- |
| SQLite 事务与写锁 | 多条数据库语句的原子提交，以及数据库写入之间的协调 |
| 按实体 ID 的操作锁、dispatch lock | 生命周期命令与运行时准入之间的顺序 |

前者不能锁住网络请求或内存中的运行状态，后者也不能在数据库写到一半失败时替代回滚。两者需要组合使用。

聚合操作还面临成员集合变化：读取某个 Agent 的 Session 列表后，等待加锁期间可能出现新的关联 Session。实现因此会按排序后的 ID 取得锁，再重新读取成员集合；变化时重试。归档在锁内拒绝未结束的工作，回收站中对象的某些永久清理路径则先中止并排空运行工作。[Agent 的成员重读与锁](https://github.com/CherryHQ/cherry-studio/blob/2ef123931a3e82ad1cd6713abccc9d4962fb85bb/src/main/ai/agents/AgentLifecycleService.ts#L450-L490)

这些锁是进程内协调工具，不是持久化状态。设计判断依赖于相关入口共同遵守这些锁；如果另开一条绕过它们的写路径，就不能沿用同样的并发安全结论。

## 4. 原子边界：把 ACID 落到具体操作上

“这个操作是原子的”必须附带一个范围。对回收站来说，至少要区分单次数据库转换、跨资源命令和整次批量清理。

### 一个业务转换对应一组原子写入

Agent 归档会变更实体、按选项归档关联 Session，并停用相应调度。它们要在同一个同步事务中提交，否则可能留下实体与调度不一致的结果。

恢复 Agent 的实现清楚地展示了事务和后续工作的分界：

```typescript
restoreAgent(agentId: string) {
  return this.runOperation('restore-agent:' + agentId, () =>
    this.agentLocks.runExclusive(agentId, () => {
      const { agent, scheduleIds } = application.get('DbService').withWriteTx((tx) => ({
        agent: agentService.restoreAgentTx(tx, agentId),
        scheduleIds: agentTaskService.setOwnerStateTx(tx, agentId, 'active', Date.now())
      }))
      this.syncSchedules(scheduleIds)
      application.get('ChannelManager').reconcileAgent(agentId)
      agentService.notifyReadModelChange([agentId], 'membership')
      return agent
    })
  )
}
```

[源码摘录：实体和调度一起恢复，提交后同步定时器](https://github.com/CherryHQ/cherry-studio/blob/2ef123931a3e82ad1cd6713abccc9d4962fb85bb/src/main/ai/agents/AgentLifecycleService.ts#L75-L87)。归档也把相关数据库修改组合到同一事务中，然后执行通知、调度同步、连接协调与运行时清理。[归档事务](https://github.com/CherryHQ/cherry-studio/blob/2ef123931a3e82ad1cd6713abccc9d4962fb85bb/src/main/ai/agents/AgentLifecycleService.ts#L349-L389)

`withWriteTx` 底层调用 Drizzle 的同步事务，并指定 `behavior: 'immediate'`。在当前单连接、同步执行模型下，事务中的语句不会跨 `await` 与其他 JavaScript 工作交错。`BEGIN IMMEDIATE` 提前取得写事务资格；如果存在其他连接的写事务，仍然可能遇到锁竞争，它不是消除所有并发错误的开关。[仓库事务封装](https://github.com/CherryHQ/cherry-studio/blob/2ef123931a3e82ad1cd6713abccc9d4962fb85bb/src/main/data/db/DbService.ts#L195-L249)、[SQLite 事务模式](https://www.sqlite.org/lang_transaction.html#deferred_immediate_and_exclusive_transactions)

单条 `UPDATE` 自身也在事务中执行，不需要为了“看起来原子”再包一层；多条写入或依赖读取结果的写入，才需要确定共同的事务边界。事务回调保持同步且只做数据库操作；网络、文件和运行时关闭放在外层。better-sqlite3 的事务 API 不支持把异步函数当成这种事务回调。[better-sqlite3 事务限制](https://github.com/WiseLibs/better-sqlite3/blob/master/docs/api.md#transactionfunction---function)

<figure>
  <a href="/media/blog/cherry-studio-trash/atomicity.svg" aria-label="查看数据库事务与提交后恢复边界原图">
    <img src="/media/blog/cherry-studio-trash/atomicity.svg" width="752" height="1056" loading="lazy" decoding="async" alt="生命周期命令先取得锁并检查条件，在同步数据库事务中修改实体、选中的关联对象和调度；提交前异常回滚，提交后再按命令执行资源同步或清理，失败时保留已提交状态并通过重试或对账修复。" />
  </a>
  <figcaption>图 3　数据库提交是边界。图中归纳了不同命令的后续工作，不表示每个命令都会执行所有资源操作，也不表示它们共享一个跨资源事务。点击图片可放大查看，再次点击图片关闭。</figcaption>
</figure>

### 原子性、隔离性和持久性回答不同问题

把 ACID 放回这个案例，可以避免用“有事务”概括所有保证：

| 属性 | 在回收站里要回答的问题 |
| --- | --- |
| 原子性 A | Agent、选中 Session、调度能否同成同败？ |
| 一致性 C | 提交后是否仍满足来源状态、关联数据和调度策略等约束？ |
| 隔离性 I | 其他操作会不会依据未提交的中间结果执行？运行时准入如何协调？ |
| 持久性 D | 成功提交后，面对哪类故障还能保留结果？ |

事务不会自动推导“用户暂停的任务不能恢复启动”这种业务一致性要求，必须由业务代码维护。数据库隔离也不会自动刷新前端列表，因此隔离性不能替代旧请求的来源状态检查。

这个版本配置了 `journal_mode=WAL`、`synchronous=NORMAL` 和 `foreign_keys=ON`。[数据库配置](https://github.com/CherryHQ/cherry-studio/blob/2ef123931a3e82ad1cd6713abccc9d4962fb85bb/src/main/data/db/DbService.ts#L145-L169)

在 WAL 模式下，不同连接的读写可以并行，读事务读取自己的快照，但同一时刻仍只有一个写事务。它提供的数据库隔离不等于对应用内存和 UI 状态的一致快照。[SQLite 隔离说明](https://www.sqlite.org/isolation.html)

`WAL + synchronous=NORMAL` 还存在明确的持久性边界：应用进程崩溃与系统崩溃、断电不能混为一谈。该配置保持事务原子性，但断电或系统崩溃后，最近已提交的事务可能丢失。因此，“多表不会只提交一半”不能进一步推导成“每次成功提交都保证扛住突然断电”。[SQLite synchronous 说明](https://www.sqlite.org/pragma.html#pragma_synchronous)

### 清空回收站为什么允许部分完成

自动清理按领域分页，每次最多选择 500 个候选。事务边界由各领域定义：Topic 的一批删除在同一个事务内，Session 在排空运行工作后提交该批删除；Agent 则逐个加锁、重新检查过期条件，并分别提交。因此，同一页 Agent 候选也可能部分成功。[清理入口与分页](https://github.com/CherryHQ/cherry-studio/blob/2ef123931a3e82ad1cd6713abccc9d4962fb85bb/src/main/services/trash/trashPurgeJobHandler.ts#L20-L69)、[Agent 按实体清理](https://github.com/CherryHQ/cherry-studio/blob/2ef123931a3e82ad1cd6713abccc9d4962fb85bb/src/main/ai/agents/AgentLifecycleService.ts#L132-L144)、[Session 批次事务](https://github.com/CherryHQ/cherry-studio/blob/2ef123931a3e82ad1cd6713abccc9d4962fb85bb/src/main/ai/agents/AgentLifecycleService.ts#L264-L300)

已提交的删除会发布对应通知；后面的批次失败，不会回滚前面的结果。分页让同步事务保持较短，也让任务能够在批次之间响应取消，代价是整次清理可能部分完成。“500”描述处理规模，不能据此认定整个候选集合是原子单元。[批次循环与通知](https://github.com/CherryHQ/cherry-studio/blob/2ef123931a3e82ad1cd6713abccc9d4962fb85bb/src/main/services/trash/trashPurgeJobHandler.ts#L133-L150)

| 操作范围 | 原子性承诺 |
| --- | --- |
| 一次选定 Topic 的批量归档 | 本次选定集合的数据库变更同成同败 |
| 一次 Agent 归档或恢复 | 本次事务覆盖的实体与调度同成同败 |
| 一批 Topic、Session 数据库清理 | 各自该批事务内同成同败 |
| 一页 Agent 到期清理候选 | 按 Agent 分别提交，页内允许部分完成 |
| 清空所有领域的回收站 | 允许前面批次成功、后面批次失败 |
| 数据库加文件、定时器、运行时 | 不具有整体事务原子性 |

对于最后两行，调用方不能仅凭“请求返回错误”推断所有数据都没有改变。失败发生在哪个阶段，决定了哪些结果已经成为事实。

## 5. 恢复策略：记住停用原因，重新判断当前条件

如果所有任务在 Agent 归档后都显示 `enabled = false`，恢复时应该启用哪几个？只看这个布尔值无法回答，因为它混合了两种原因：用户主动暂停，以及系统因归档而停用。

PR 为第二种情况保存了一个小的因果标记：

```typescript
if (state === 'trashed') {
  if (!schedule.enabled) return false
  jobScheduleService.updateTx(tx, schedule.id, {
    enabled: false,
    metadata: { ...schedule.metadata, agentTrash: { resumeOnRestore: true } }
  })
  return true
}
```

[源码摘录：仅为原先启用的任务记录恢复资格](https://github.com/CherryHQ/cherry-studio/blob/2ef123931a3e82ad1cd6713abccc9d4962fb85bb/src/main/data/services/AgentTaskService.ts#L239-L246)。原先就暂停的任务不写这个标记，其他 metadata 通过合并保留。

恢复时先检查标记，再根据当前时间与执行记录决定结果：

| 归档前状态与恢复时条件 | 恢复结果 |
| --- | --- |
| 用户原先已暂停 | 保持暂停 |
| 因归档停用的 cron 或 interval | 重新安排未来触发，不补跑归档期间的次数 |
| 因归档停用，once 尚未到期 | 重新调度 |
| once 已过期且未消费 | 标记 `missed`，保持停用 |
| once 已消费 | 保持完成语义，不重复执行 |

其中“已消费”需要结合 `lastRun` 与 once 的触发时间判断。它的完成语义由状态推导与调度器共同维护，不能简单理解为 `enabled` 一定保持 false；JobManager 会阻止已消费的 once 再次安排触发。[完成状态推导](https://github.com/CherryHQ/cherry-studio/blob/2ef123931a3e82ad1cd6713abccc9d4962fb85bb/src/main/data/services/AgentTaskService.ts#L143-L152)、[一次性调度防重跑](https://github.com/CherryHQ/cherry-studio/blob/2ef123931a3e82ad1cd6713abccc9d4962fb85bb/src/main/core/job/JobManager.ts#L2105-L2126)

`missed` 任务仍可编辑、删除或手动运行，但不能不改时间就当作普通未来任务重新启用。[恢复判断](https://github.com/CherryHQ/cherry-studio/blob/2ef123931a3e82ad1cd6713abccc9d4962fb85bb/src/main/data/services/AgentTaskService.ts#L247-L259)、[调度生命周期设计](https://github.com/CherryHQ/cherry-studio/blob/2ef123931a3e82ad1cd6713abccc9d4962fb85bb/docs/references/ai/agent-lifecycle.md#scheduled-tasks)

从数据库建模看，这个标记补足了下一次决策需要的信息。它不保存完整的历史快照，也不是事件溯源；只凭实体和调度当前字段就能完成这次恢复决策。恢复 Agent 也不会隐式恢复所有 Session，撤销操作需要给出明确的实体 ID，归档清除的置顶不会重建。[恢复范围](https://github.com/CherryHQ/cherry-studio/blob/2ef123931a3e82ad1cd6713abccc9d4962fb85bb/docs/references/ai/agent-lifecycle.md#commands-and-transactions)

### 数据提交后，用事实重建资源

数据库提交与定时器移除之间，程序可能退出；数据库已经删掉记录后，磁盘文件清理也可能失败。此时需要知道：哪些资源状态能够从数据库重新计算？

调度 reconciliation 会区分三种 owner：已归档的 Agent 保留任务但停用；已不存在的 Agent 允许清理任务；正常 Agent 遗留的归档标记则按恢复规则处理。文件与 Agent 目录清理在数据库提交后运行，残留可以由后续扫描重试。[恢复与清理设计](https://github.com/CherryHQ/cherry-studio/blob/2ef123931a3e82ad1cd6713abccc9d4962fb85bb/docs/references/ai/agent-lifecycle.md#purge-and-artifact-ownership)

因此，清理结果分别报告数据库删除数量、仍被引用而保留的文件数量，以及资源是否完全回收的 `reclaimed`。归档记录仍然拥有其相关资源，不能仅仅因为对象不在正常列表里，就把资源判断为孤儿。保留天数设为 0 会关闭自动删除记录，但不会关闭残留资源清理。[清理任务结果与失败处理](https://github.com/CherryHQ/cherry-studio/blob/2ef123931a3e82ad1cd6713abccc9d4962fb85bb/src/main/services/trash/trashPurgeJobHandler.ts#L117-L206)

这种方案适用于能够从持久化事实重建的资源状态。不能据此宣称任意提交后副作用都能恢复：例如一次不可重复的外部消息发送，需要另外设计持久化投递意图与去重契约。本文描述的协调路径没有因此获得跨资源的 exactly-once 保证。

## 6. 不变量与可验证性：把设计写成可失败的断言

不变量不是“状态不能改变”，而是合法转换前后必须保持的约束。把状态记作 `s`，命令记作 `c`，守卫记作 `G`，转换记作 `T`，可以用下面的形式检查设计：

```text
初始状态满足 I
I(s) 且 G(s, c) 成立  ⇒  I(T(s, c)) 仍成立
G(s, c) 不成立       ⇒  不执行该次受保护的数据转换
```

这只是推理框架。最后一行针对转换前的拒绝，不表示提交后出错也能让整个命令回到原状。

对回收站，约束可以分成三类：

| 类别 | 本案例中的要求 |
| --- | --- |
| 状态不变量 | 一个存在的实体只由 `deletedAt` 决定正常或归档；归档与消息保留策略一致 |
| 转换安全性 | 回收站删除不能移除当前正常的对象；忙碌检查拒绝后不执行归档；关联写入同成同败 |
| 恢复活性 | 数据提交后留下的可重建资源差异，在持续有重试机会且故障最终消失时能够收敛 |

“已归档 Agent 的调度在业务事务提交后应停用”可以检查数据库；“数据库中的调度与内存定时器在每一个瞬间都完全相同”则不是这里的保证。后者允许提交后的短暂差异，需要通过同步和恢复消除。

另一个容易写错的不变量是 `restore(archive(x)) == x`。归档会清除置顶、标签关联等内容，恢复还会重新评估时间，因此完整对象不保证回到原值。更准确的契约是：Topic 内容可以恢复可见，消息保留；用户暂停意图保留；未明确选择的关联实体不被隐式恢复。

### 用真实事务验证回滚

如果测试把 `withWriteTx(fn)` mock 成直接执行 `fn(db)`，根本没有建立数据库事务，就无法证明回滚。PR 的 AgentJobsService 测试专门将它接到真实数据库事务。[测试事务配置](https://github.com/CherryHQ/cherry-studio/blob/2ef123931a3e82ad1cd6713abccc9d4962fb85bb/src/main/ai/agents/__tests__/AgentJobsService.test.ts#L117-L120)

下面摘录归档失败的部分。测试先创建 Agent 关联任务和 Session，再让事务中较后的调度变更抛错：

```typescript
const fail = vi.spyOn(agentTaskService, 'setOwnerStateTx').mockImplementationOnce(() => {
  throw new Error('write failed')
})
await expect(lifecycle.archiveAgent(AGENT_ID, { archiveSessions: true })).rejects.toThrow('write failed')
expect(dbh.db.select().from(agentTable).get()?.deletedAt).toBeNull()
expect(agentSessionService.getById(session.id).id).toBe(session.id)
expect(jobScheduleService.getById(task.id)?.enabled).toBe(true)
expect(scheduler.has(`schedule:${task.id}`)).toBe(true)
fail.mockRestore()
```

[源码摘录：归档故障注入与结果断言](https://github.com/CherryHQ/cherry-studio/blob/2ef123931a3e82ad1cd6713abccc9d4962fb85bb/src/main/ai/agents/__tests__/AgentJobsService.test.ts#L183-L205)。这组断言能捕获真实错误：如果 Agent 已归档但调度没停用，或者事务未提交就撤销了定时器，测试都会失败。它验证的是结果契约，不只是某个 mock 被调用过。

### 用命令序列、时间和故障检查不同边界

| 场景 | 应观察到的结果 | 固定版本测试 |
| --- | --- | --- |
| 归档、恢复、旧页面永久删除 | 拒绝删除，实体仍正常 | [旧请求](https://github.com/CherryHQ/cherry-studio/blob/2ef123931a3e82ad1cd6713abccc9d4962fb85bb/src/main/data/services/__tests__/TopicService.test.ts#L740-L757) |
| 批量归档包含不存在的 ID | 已有对话和消息保留 | [批量原子性](https://github.com/CherryHQ/cherry-studio/blob/2ef123931a3e82ad1cd6713abccc9d4962fb85bb/src/main/data/services/__tests__/TopicService.test.ts#L620-L660) |
| 调度写入中途失败 | Agent、Session、调度回滚，定时器不误变更 | [事务回滚](https://github.com/CherryHQ/cherry-studio/blob/2ef123931a3e82ad1cd6713abccc9d4962fb85bb/src/main/ai/agents/__tests__/AgentJobsService.test.ts#L183-L205) |
| 归档期间推进时间，再恢复 | 只安排未来触发，不补跑 | [时间边界](https://github.com/CherryHQ/cherry-studio/blob/2ef123931a3e82ad1cd6713abccc9d4962fb85bb/src/main/ai/agents/__tests__/AgentJobsService.test.ts#L207-L230) |
| once 在归档期间过期 | 保持 missed，不自动执行 | [过期任务](https://github.com/CherryHQ/cherry-studio/blob/2ef123931a3e82ad1cd6713abccc9d4962fb85bb/src/main/ai/agents/__tests__/AgentJobsService.test.ts#L232) |
| 同时有启用与用户暂停的任务 | 只恢复具备资格的任务 | [暂停意图](https://github.com/CherryHQ/cherry-studio/blob/2ef123931a3e82ad1cd6713abccc9d4962fb85bb/src/main/ai/agents/__tests__/AgentJobsService.test.ts#L767) |
| 清理第二批失败 | 第一批仍已提交并通知 | [部分完成](https://github.com/CherryHQ/cherry-studio/blob/2ef123931a3e82ad1cd6713abccc9d4962fb85bb/src/main/services/trash/__tests__/trashPurgeJobHandler.test.ts#L423-L455) |
| 数据删除后磁盘清理失败 | 数据保持已删除，残留等待重试 | [提交后失败](https://github.com/CherryHQ/cherry-studio/blob/2ef123931a3e82ad1cd6713abccc9d4962fb85bb/src/main/services/trash/__tests__/trashPurgeJobHandler.test.ts#L534-L551) |

这些案例说明设计具有可验证性，但“能够验证”和“已经证明所有执行路径正确”是不同结论。进一步的验证可以在提交前后设置中断点、重新启动服务，或者生成多种归档、恢复、删除命令序列，每一步都检查不变量。此类扩展是验证建议，不应写成这个 PR 已经完成的覆盖。

## 把六个问题用作下一次设计的检查表

当我再遇到带有恢复、暂停、删除或清理行为的功能时，会先把下面六项写清楚，再决定是否需要更复杂的状态机框架。

| 设计问题 | 回收站案例给出的具体答案 |
| --- | --- |
| 哪些事实唯一决定状态？ | 行是否存在与 `deletedAt`；运行忙碌状态另行维护 |
| 命令接受哪些来源状态？ | 归档、恢复、两类永久删除各有来源条件，并定义重复请求结果 |
| 转换前必须满足什么？ | 锁内检查未完成工作，重读关联集合，检查过期时间 |
| 哪些修改必须一起提交？ | 实体、选中关联对象和调度；运行时与磁盘在提交后处理 |
| 恢复依赖什么信息？ | 保留的内容、停用原因标记、当前时间和已消费记录 |
| 如何发现违反契约？ | 真实事务回滚、过期请求、时间推进、分批失败和恢复对账测试 |

它们也与[生命周期资源归属](/blog/cherry-studio-lifecycle-skill/)形成连接：业务服务决定什么状态转换合法，数据服务维护持久化事实，运行时 owner 管理资源，协调器负责把这些工作放在正确的顺序与失败边界上。评估设计时，逐一指出每项保证由哪一层承担，比笼统地说“用了状态机和事务，所以安全”更容易复查。
