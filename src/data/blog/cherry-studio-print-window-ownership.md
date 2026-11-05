---
title: Cherry Studio 笔记打印中的窗口归属与跨进程分工
summary: 从一次笔记打印与 PDF 导出实现出发，记录当前编辑内容、类型化 IPC、隐藏打印窗口和快捷键上下文如何分工，以及复用现有窗口契约的取舍。
pubDate: "2026-07-07T16:29:56+08:00"
tags:
  - Cherry Studio
  - Electron
  - 架构设计
  - 开源实践
featured: false
draft: false
---

给笔记增加打印和 PDF 导出，看起来只是多两个菜单项。但真正需要串起来的是一整条链路：拿到用户眼前的内容，把它交给主进程，在独立窗口里生成纸面文档，再在成功、取消或失败后释放窗口。链路中的每一段都有自己的状态和责任。

这篇文章复盘我参与的 [Notes 打印与 PDF 导出 PR](https://github.com/CherryHQ/cherry-studio/pull/16681)，它于 2026 年 7 月 7 日合入 `main`。本站按 PR 合并时间归档，本文于 2026 年 10 月 3 日整理；源码引用固定到当时的[合并提交](https://github.com/CherryHQ/cherry-studio/commit/07af3a266c09397da62f81a41ab759dab1be3b1b)，不代表后续版本始终保持相同实现，也不把合入主分支等同于已随某个正式版本发布。

我的主要收获是：功能可以同时涉及多个进程和公共组件，但不必因此扩展公共基础设施。先确认已有契约能做什么，再让功能层承担具体的编排责任。

## 先确定打印的是哪一份内容

用户看到的编辑器内容，不一定等于最近一次保存的文件内容。打印前如果直接读取持久化记录，尚未保存的修改就可能丢失；如果总从某一种编辑器读取，切换编辑模式后也可能取错来源。

当时的 `getCurrentNoteContent` 先读取源码编辑器引用，取不到时再读取富文本编辑器引用，最后才回退到页面已有的内容。这里最值得留意的是“取不到”的判断：源码编辑器使用 `!== undefined`，富文本编辑器使用 `??`，而不是把所有假值都当成缺失。[当前编辑内容的读取实现](https://github.com/CherryHQ/cherry-studio/blob/07af3a266c09397da62f81a41ab759dab1be3b1b/src/renderer/pages/notes/NotesPage.tsx#L979-L987)

```tsx
const getCurrentNoteContent = useCallback(() => {
  const sourceContent = codeEditorRef.current?.getContent?.()
  if (sourceContent !== undefined) {
    return sourceContent
  }

  const richContent = editorRef.current?.getMarkdown?.()
  return richContent ?? currentContent
}, [currentContent])
```

[源码摘录来源：NotesPage.tsx](https://github.com/CherryHQ/cherry-studio/blob/07af3a266c09397da62f81a41ab759dab1be3b1b/src/renderer/pages/notes/NotesPage.tsx#L979-L987)。这段回调使用页面已有的编辑器引用和 `currentContent`，不是独立的文件读取函数。

例如，用户把笔记全部删空后，编辑器返回的空字符串仍然是有效的当前内容，不能用 `content || oldContent` 悄悄恢复旧文本。不过，这并不意味着功能会导出一份空白 PDF：后续构造打印请求时会检查空内容，提示用户没有可导出的内容，然后结束操作。[请求构造与空内容检查](https://github.com/CherryHQ/cherry-studio/blob/07af3a266c09397da62f81a41ab759dab1be3b1b/src/renderer/pages/notes/HeaderNavbar.tsx#L113-L130)

这让我更愿意把两个问题分开处理：读取阶段忠实保留当前值，操作阶段再判断这个值是否满足导出条件。否则，“回退数据”和“校验输入”混在一起，会掩盖用户真正做过的编辑。

## 用小而明确的请求连接两个进程

这次打印请求只需要 `title`、`markdown` 和可选的 `sourcePath`，由共享 Zod schema 定义，并通过 `z.infer` 推导类型。`print.print` 返回 `void`，`print.export_pdf` 返回布尔值。只有一种实际内容来源时，没有必要先包一层 `source`，或为尚未出现的来源设计一组分支。[打印 IPC 契约](https://github.com/CherryHQ/cherry-studio/blob/07af3a266c09397da62f81a41ab759dab1be3b1b/src/shared/ipc/schemas/print.ts#L5-L16)

这条链路可以按责任分成三部分：

| 参与者 | 负责的事情 |
| --- | --- |
| 笔记页面 | 取得当前编辑内容，校验选择与内容，发出请求并展示结果。 |
| 主进程 PrintService | 生成打印 HTML，组织原生打印或 PDF 保存流程。 |
| WindowManager | 按已注册的窗口类型提供窗口创建、查找和关闭能力。 |

这里的划分不是“所有逻辑都搬到主进程”。编辑器哪一份内容有效，只有页面最清楚；原生打印 API 和保存对话框则由主进程调用。IPC 传递的是一次操作需要的数据，而不是编辑器组件、页面内部状态或一个预先设计好的通用文档框架。

<figure>
  <a href="/media/blog/cherry-studio-print/flow.svg" aria-label="查看打印流程原图">
    <img src="/media/blog/cherry-studio-print/flow.svg" width="848" height="1152" loading="lazy" decoding="async" alt="笔记打印的职责交接：页面读取当前编辑内容，通过类型化 IPC 交给主进程 PrintService；WindowManager 提供隐藏窗口，PrintService 加载 HTML 并编排打印或 PDF 导出，操作结束后关闭窗口。PDF 保存取消发生在创建窗口之前。" />
  </a>
  <figcaption>图 1　从当前编辑内容到打印输出的主要职责交接。主进程编排操作，隐藏窗口承载排版；PDF 保存取消时尚未创建窗口，窗口准备失败也需要清理。依据本文固定的合并版本绘制，点击图片可放大查看，再次点击图片关闭。</figcaption>
</figure>

## 隐藏窗口复用已有的加载契约

打印没有直接使用用户正在编辑的可见窗口，而是注册了一个独立的 `WindowType.Print`。它采用手动显示策略，使用空的 `htmlPath` 和 `preload`，由消费者加载内容。这让打印排版不必修改当前编辑页面。[打印窗口配置](https://github.com/CherryHQ/cherry-studio/blob/07af3a266c09397da62f81a41ab759dab1be3b1b/src/main/core/window/windowRegistry.ts#L104-L131)

容易被误读的一点是：`htmlPath: ''` 对应的消费者加载契约在这个 PR 之前已经由主分支提供。这个功能使用它，最终改动没有重新实现 `WindowManager`，也没有新增一套窗口内容来源抽象。[PR 中的范围说明](https://github.com/CherryHQ/cherry-studio/pull/16681)

独立窗口也不是没有代价。打印文档使用主进程的 `MarkdownIt({ html: false })` 生成，而不是复用渲染进程的 Shiki、数学公式和 GFM 渲染链。因此，它得到独立的纸面排版，却不保证与编辑器预览完全一致。这里应当把它记录为明确的格式保真限制，而不是宣称隔离窗口同时解决了所有渲染问题。

我在这次复盘中的判断是：既然现有窗口契约已经足够，新增抽象必须有独立需求才能成立。仅仅因为一个功能需要加载 HTML，还不足以证明窗口基础设施应该增加新的配置维度。

## 清理责任必须覆盖失败和取消

`PrintService` 通过 `WindowManager` 打开窗口，再加载打印 HTML 并等待页面就绪。如果找不到窗口，或加载、就绪检查失败，打开流程会关闭对应窗口并抛出错误；只有准备成功，才把窗口交给后续打印操作。[窗口准备与失败清理](https://github.com/CherryHQ/cherry-studio/blob/07af3a266c09397da62f81a41ab759dab1be3b1b/src/main/services/PrintService.ts#L270-L291)

PDF 导出先询问保存位置。取消保存时返回 `false`，不会创建打印窗口；完成 PDF 生成并写入文件后才返回 `true`。窗口创建之后，无论生成、写入是否成功，都在 `finally` 中关闭。页面也只在收到 `true` 后显示导出成功提示。[PDF 导出流程](https://github.com/CherryHQ/cherry-studio/blob/07af3a266c09397da62f81a41ab759dab1be3b1b/src/main/services/PrintService.ts#L293-L321)

原生打印还有一个异步边界：调用打印 API 并不等于打印回调已经结束。实现把回调包装成 Promise，等待成功、用户取消或失败的结果，再执行 `finally`。用户取消不被当成打印错误，真正的失败则继续抛出。[原生打印与回调清理](https://github.com/CherryHQ/cherry-studio/blob/07af3a266c09397da62f81a41ab759dab1be3b1b/src/main/services/PrintService.ts#L324-L343)

```ts
async print(payload: PrintableDocumentPayload): Promise<void> {
  const { windowId, window } = await this.openPrintWindow(payload)
  const windowManager = application.get('WindowManager')

  try {
    await new Promise<void>((resolve, reject) => {
      window.webContents.print({}, (success, failureReason) => {
        if (success || failureReason === 'Print job canceled') {
          resolve()
          return
        }
        reject(new Error(failureReason || 'Print job failed'))
      })
    })
  } catch (error) {
    logger.error('Failed to print printable document', error as Error)
    throw error
  } finally {
    windowManager.close(windowId)
  }
}
```

[源码摘录来源：PrintService.ts](https://github.com/CherryHQ/cherry-studio/blob/07af3a266c09397da62f81a41ab759dab1be3b1b/src/main/services/PrintService.ts#L324-L344)。这是类中的方法：`openPrintWindow` 负责准备失败时的清理；准备成功以后，由这里的 `finally` 结束窗口生命周期。`await` 等待的是打印 API 的回调，不是纸张实际打印完成。

窗口由 WindowManager 管理，并不意味着调用方可以忘记结束这次操作；PrintService 编排关闭，也不意味着它需要接管通用窗口管理。这是我在[用 Skill 梳理 Cherry Studio 的生命周期设计](/blog/cherry-studio-lifecycle-skill/)中讨论的“资源归属”和“命令编排”在一个具体功能里的分工，这里不再重复展开生命周期类型。

## 快捷键响应还需要活动页面上下文

打印快捷键沿用统一的 `app.print` 命令，默认绑定为 `CommandOrControl+P`，并接入用户的快捷键偏好。菜单显示的也是解析后的快捷键，而不是写死的提示文本。[命令与快捷键设计说明](https://github.com/CherryHQ/cherry-studio/pull/16681)

笔记页可能在后台标签中保持挂载，所以“组件还在”不能直接等于“它应该处理打印命令”。处理器只在标签激活且选中项是文件时启用，也就是 `isActiveTab && activeNode?.type === 'file'`。[命令处理器的启用条件](https://github.com/CherryHQ/cherry-studio/blob/07af3a266c09397da62f81a41ab759dab1be3b1b/src/renderer/pages/notes/HeaderNavbar.tsx#L157)

这条约束把快捷键定义和当前消费者分开了：统一命令系统负责按键与配置，页面负责说明自己什么时候可以响应。它也提醒我，支持保活标签的界面不能只用挂载与卸载来推断交互状态。

## 测试要验证边界而不只是成功路径

合并版本的测试覆盖了 PDF 成功、取消、加载失败和生成失败，也检查打印回调结束前不应关闭窗口；页面测试则覆盖当前编辑器内容、空字符串不回退、活动标签条件和快捷键显示。[主进程测试](https://github.com/CherryHQ/cherry-studio/blob/07af3a266c09397da62f81a41ab759dab1be3b1b/src/main/services/__tests__/PrintService.test.ts#L106-L218)、[笔记页面测试](https://github.com/CherryHQ/cherry-studio/blob/07af3a266c09397da62f81a41ab759dab1be3b1b/src/renderer/pages/notes/__tests__/NotesPage.test.tsx#L295-L421)

这些自动化检查能说明流程和资源释放的预期，但不能证明真实打印机、系统对话框和最终 PDF 的视觉效果。PR 明确记录了当时没有完成手动 Electron 打印与 PDF 视觉冒烟检查；复盘也应保留这个验证边界。

这次功能给我的经验是：先保证内容来源、请求契约、窗口释放和命令上下文各自准确，再讨论抽象是否足够通用。把这些边界做清楚，往往比增加一层统一接口更直接地改善可靠性。
