---
title: Cherry Studio 本地语音架构：让听写与朗读共用一条可靠链路
summary: 从产品入口、Renderer 控制层、跨进程会话、音频文件边界到本地 ASR/TTS 引擎，梳理 Cherry Studio 语音能力的完整设计与平台边界。
pubDate: 2026-10-04
tags:
  - Cherry Studio
  - Electron
  - ASR/TTS
  - 架构设计
featured: false
draft: false
---

语音功能看起来只有两个方向：把语音变成文字，以及把文字读出来。但在桌面应用里，麦克风和音频播放属于 Renderer，系统语音框架和本地推理运行在主进程一侧；多个窗口还可能同时发起操作。如果每个页面各自管理录音、模型、播放和取消，最终会出现相互竞争的会话与不一致的清理路径。

本文把 Cherry Studio 的本地语音实现视为**一套完整架构**：产品入口只提供当前文本或接收识别结果，共享 Renderer 层编排交互，Main 进程统一管理会话和临时文件，本地引擎执行一次性识别或合成。设计以 [2026 年 10 月 1 日的实现树](https://github.com/CherryHQ/cherry-studio/tree/d05d3c52e9e32983cbdbfa106de6f55f54f3885a) 为快照；当时相关改动仍在 Draft PR 中，本文不表示功能已经合入 `main` 或随正式版本发布。

<figure>
  <a href="/media/blog/cherry-studio-voice/architecture.svg" aria-label="查看 Cherry Studio 本地 ASR 与 TTS 功能架构原图">
    <img src="/media/blog/cherry-studio-voice/architecture.svg" width="950" height="690" loading="lazy" decoding="async" alt="本地语音架构：听写和朗读从产品入口进入共享 Renderer 语音服务，经类型化 IPC 到 Main 进程的单会话服务，再分别调用 Apple 或 FunASR 识别、Apple 或 Windows 系统语音合成；识别文本回到原输入目标，WAV 临时文件回到 Renderer 播放。" />
  </a>
  <figcaption>图 1　本地 ASR/TTS 的职责与数据流。图中的 PR 编号只标明模块最初的实现来源，不是运行时模块边界；下文按系统本身组织，点击图片可放大查看，再次点击图片关闭。</figcaption>
</figure>

## 设计目标与边界

这套设计解决四个问题：让不同页面复用相同的听写与朗读行为；让多个窗口共享一个可取消的语音会话；让原始音频、识别文本和合成结果只经过受控的本地边界；让用户明确选择模型与声音，并在资源缺失时得到可解释的结果。

语音识别和合成都走本地引擎。FunASR 模型可以由用户显式下载，但识别时不把音频送往远端语音服务。默认模型只是一项推荐，不会触发资源安装；显式选择的模型或 voice ID 不可用时，系统报错，不悄悄换用另一种引擎或声音。这条链路也不建立录音历史、转写历史或新的 SQLite 业务表。[本地模型定义][local-model]、[会话实现][session]

## 职责如何分配

| 层次 | 拥有的状态和工作 | 对外边界 |
| --- | --- | --- |
| 产品入口 | 当前编辑目标、选区、待朗读文本，以及用户触发的听写或朗读动作。 | 绑定共享控制器，不自行调用原生语音引擎。 |
| 共享 Renderer 控制层 | 麦克风流、`MediaRecorder`、输入目标绑定、朗读文本规划、`HTMLAudioElement`、播放条和一次性的转写恢复内容。 | `VoiceService` 统一读取语音偏好并调用 Voice IPC。 |
| Shared IPC 契约 | 请求与返回 schema、模型 ID、会话阶段、错误类别、跨窗口事件。 | 校验请求，不持有运行时资源。 |
| Main 会话层 | 窗口 owner、全局租约、操作取消、状态发布、临时 `FileEntry` 的引用与清理。 | 向 `AiService` 发起一次识别或合成。 |
| aiCore 与本地适配器 | 一次性的 `transcribe` / `generateSpeech` 调用；Apple、Windows 系统语音和 FunASR 的平台实现。 | 返回识别文本或 WAV，不决定哪个页面接收结果。 |

这里最关键的分工是：**Renderer 知道用户正在编辑或播放什么，Main 知道谁有权持有会话与临时文件**。`VoiceService` 是 Renderer 侧直接访问 Voice IPC 的集中入口；Main 侧的 `VoiceSessionService` 是全局准入和资源归属的唯一权威。偏好通过 Preference 保存，录音与 WAV 使用会话拥有的临时 `FileEntry`，两者用途不同。[Renderer 客户端][voice-service]、[IPC 契约][ipc-schema]、[Main 会话][session]

## ASR：从麦克风回到原输入框

1. 页面在可编辑控件上注册一个语音目标。开始听写时，`VoiceTargetManager` 捕获目标身份；之后即使用户切换焦点，也不会把迟到的转写直接插入另一个输入框。
2. `DictationService` 获取麦克风权限与音频流，用 `MediaRecorder` 生成 WebM/Opus。Main 先为录音取得会话租约，再将录音作为会话拥有的 `FileEntry` 暂存；请求校验 MIME、文件头、大小和录制时长。
3. 识别请求经类型化 IPC、`VoiceSessionService`、`AiService` 与 aiCore 到达本地适配器。独立的 `voice.audio` Utility Process 把受限的 WebM/Opus 输入转换为 16 kHz PCM WAV，然后交给 Apple Speech 或 FunASR。FunASR 通过 CPU 推理进程运行，并使用 VAD 处理语音片段。
4. 识别结果返回后，控制层只向仍有效的原目标写入文本。若目标已经卸载，文本留在 Renderer 内存中的恢复状态，由用户选择插入当前目标或复制；识别失败时，仍可在同一会话内重试暂存的录音。成功后会话删除录音引用并结束。[目标绑定][voice-target]、[听写控制][dictation]、[音频解码边界][audio-adapter]

这是一条**一次性识别**链路，不是逐字流式转写。输入也不是通用音频导入器：解码器只接受受控的 MediaRecorder WebM/Opus 子集，限制 32 MiB 编码输入和五分钟音频，并在取消或超时后等待旧 Utility Process 退出，再释放租约。[音频解码边界][audio-adapter]

## TTS：从当前文本到可控制的本地播放

1. 消费端交出当前可朗读的文本及来源标识。共享文本规划器把 Markdown/富文本变为适合朗读的内容，避开代码、推理和工具结果等不应念出的部分；长文本按段处理。手动朗读过长时要求确认，自动朗读则跳过过长或当前忙碌的请求。
2. `VoiceService` 解析语音模型、精确 voice ID、语言与语速。Main 取得会话租约，调用 aiCore 和本地系统语音适配器；Apple 或 Windows 的已安装声音生成 WAV。声音不存在、模型不受支持或语速越界时，不换用替代声音。
3. Main 校验 WAV 并存为临时 `FileEntry`。Renderer 读取每段输出，用 `HTMLAudioElement` 播放，通过会话事件同步播放、暂停、恢复和停止；一段播放完后释放其输出，再推进下一段。结束、取消或失败时，负责该段的对象释放音频 URL、文件引用和会话。[文本规划][readable-text]、[播放控制][playback]、[Main 会话][session]

自动朗读只响应符合条件的助手回复完成事件，并按消息与尝试次数去重；它不会为了播放而打断已有会话。手动朗读可以替换已有的手动朗读；开始录音的优先级更高，会停止正在播放的内容。这个顺序由共享会话规则决定，而不是各页面自行抢占音频设备。[自动朗读协调][auto-read]、[Main 会话][session]

## 会话、跨窗口和临时文件

`VoiceSessionService` 以受管理的 `WebContents` 推导窗口 owner，不信任请求里自填的窗口身份。它用一个全局租约覆盖 `recording → recorded → recognizing` 和 `generating → ready → playing ↔ paused`；失败状态允许受控的重试或丢弃。`sessionId`、`requestId` 和状态修订号用于识别操作与同步跨窗口状态，`session_event` 同时传递状态变化与停止、暂停、恢复命令。[会话状态 schema][ipc-schema]、[Main 会话][session]

录音和合成 WAV 都是短期资源：会话持有 `FileEntry` 引用，Renderer 不能凭任意 ID 读取其他窗口的输出；播放后显式释放，窗口销毁、取消、应用停止等路径也会清理。主进程收到系统休眠或锁屏事件时另有中断处理。日志与跨窗口事件只传递必要的状态和分类错误，不记录原始音频、转写内容、待朗读文本或物理文件路径。[Main 会话][session]、[原生语音边界][system-speech]

## 模型与平台能力

| 引擎 | 适用范围与资源前提 | 运行特性 |
| --- | --- | --- |
| Apple ASR | macOS 13–15 使用支持设备端识别的 `SFSpeechRecognizer`；macOS 26+ 使用 `SpeechTranscriber`，缺少资源时只能由用户明确发起安装。 | 仅设备端识别，不回退到 Apple 网络识别。 |
| FunASR Nano | 静态支持 macOS arm64/x64、Linux arm64/x64、Windows x64；模型和对应原生包必须显式下载并校验。 | CPU、一次性识别、自动语言检测；模型文件的版本、大小、摘要和来源被固定。 |
| Apple TTS | macOS 13+，要求系统中已安装所选 voice ID。 | 本机 Swift helper 合成 WAV。 |
| Windows 系统 TTS | Windows x64，要求系统中已安装所选 SAPI voice ID。 | 本机 SAPI helper 合成 WAV；不依赖 ASR 模型或麦克风权限。 |

平台“声明支持”与“已经在真实应用验证”需要分开看：这一设计的完整 Electron 离线往返检查发生在 macOS 26.3 arm64；Windows x64 有原生 TTS helper 的实际 CI 合成、取消和超时证据，但没有完整 Windows Electron UI 与签名安装包验收；FunASR 在 Windows/Linux 主要是静态、打包和契约验证。这里也没有 Windows 系统 ASR、Linux 系统 TTS、远端语音提供方或运行时自动回退。[本地模型定义][local-model]、[系统语音说明][system-speech]、[FunASR 实现说明][funasr-pr]

## 产品入口遵守同一套契约

| 场景 | 接入行为 |
| --- | --- |
| Assistant、Agent | 输入侧可听写；消息可手动朗读，符合设置与完成条件的助手回复可自动朗读。 |
| Painting、Quick Assistant | 输入侧复用听写；Quick Assistant 还可复用朗读。 |
| Translate | 在原文输入框听写，结果仍可编辑且不自动触发翻译；完成的译文可手动朗读。 |
| Notes | 只提供手动朗读：优先选区，否则读取当前未保存的草稿；不新增独立听写入口。 |
| Selection Assistant | 手动朗读原始选区或处理完成的结果。 |

这些页面只适配自己拥有的文本和选区。听写目标绑定、长文本确认、播放状态、精确声音校验和失败恢复集中在共享层，因而增加一个消费端不必复制一套录音或播放器。[Translate 输入绑定][translate-input]、[共享听写][dictation]、[共享播放][playback]

这套架构的核心不在某一个语音引擎，而在**谁拥有交互、谁拥有会话、谁拥有文件**。沿这条边界增加本地引擎时，消费端仍面对相同的听写与朗读契约；增加产品入口时，也无需重新定义跨窗口竞争、取消和临时文件清理。

[local-model]: https://github.com/CherryHQ/cherry-studio/blob/d05d3c52e9e32983cbdbfa106de6f55f54f3885a/src/shared/ai/localVoice.ts
[session]: https://github.com/CherryHQ/cherry-studio/blob/d05d3c52e9e32983cbdbfa106de6f55f54f3885a/src/main/ai/voice/VoiceSessionService.ts
[voice-service]: https://github.com/CherryHQ/cherry-studio/blob/d05d3c52e9e32983cbdbfa106de6f55f54f3885a/src/renderer/services/voice/VoiceService.ts
[ipc-schema]: https://github.com/CherryHQ/cherry-studio/blob/d05d3c52e9e32983cbdbfa106de6f55f54f3885a/src/shared/ipc/schemas/voice.ts
[voice-target]: https://github.com/CherryHQ/cherry-studio/blob/d05d3c52e9e32983cbdbfa106de6f55f54f3885a/src/renderer/services/voice/VoiceTargetManager.ts
[dictation]: https://github.com/CherryHQ/cherry-studio/blob/d05d3c52e9e32983cbdbfa106de6f55f54f3885a/src/renderer/services/voice/DictationService.ts
[audio-adapter]: https://github.com/CherryHQ/cherry-studio/blob/d05d3c52e9e32983cbdbfa106de6f55f54f3885a/src/main/ai/voice/localAdapters/README.md
[readable-text]: https://github.com/CherryHQ/cherry-studio/blob/d05d3c52e9e32983cbdbfa106de6f55f54f3885a/src/renderer/services/voice/readableText.ts
[playback]: https://github.com/CherryHQ/cherry-studio/blob/d05d3c52e9e32983cbdbfa106de6f55f54f3885a/src/renderer/services/voice/SpeechPlaybackService.ts
[auto-read]: https://github.com/CherryHQ/cherry-studio/blob/d05d3c52e9e32983cbdbfa106de6f55f54f3885a/src/renderer/services/voice/AutoReadCoordinator.ts
[system-speech]: https://github.com/CherryHQ/cherry-studio/blob/d05d3c52e9e32983cbdbfa106de6f55f54f3885a/packages/system-speech/README.md
[funasr-pr]: https://github.com/CherryHQ/cherry-studio/pull/20902
[translate-input]: https://github.com/CherryHQ/cherry-studio/blob/d05d3c52e9e32983cbdbfa106de6f55f54f3885a/src/renderer/pages/translate/components/TranslateInputPane.tsx
