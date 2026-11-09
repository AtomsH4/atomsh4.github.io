---
title: GPU 共享到底在共享什么：从 NVIDIA API 到 Kubernetes 与 HAMi
summary: 用白话分清计算时间、显存容量与硬件分区，再沿着 NVML、CUDA、Device Plugin 和 HAMi-Core 的调用链，理解一张 GPU 如何交给多个任务使用。
pubDate: "2026-11-10T00:00:00+08:00"
tags:
  - GPU
  - NVIDIA
  - Kubernetes
  - HAMi
  - AI Infra
featured: false
draft: false
---

假设服务器有一张 24 GiB 显存的 GPU，一个推理服务只用了其中 4 GiB，平时计算也不繁忙。但在默认的 Kubernetes GPU 分配方式下，另一个服务仍可能一直排队：前一个服务已经申请了整张卡，调度器的账本上没有剩余设备了。

我最初把这件事理解成“GPU 不能同时给两个程序用”。沿着 NVIDIA 的接口和 HAMi 的源码看下去，才发现这里有几种不同的问题：硬件怎样执行多个程序，显存怎样被占用，Kubernetes 怎样登记资源，以及共享后谁负责检查每个程序的额度。

这篇文章按这个顺序展开。讨论以 NVIDIA GPU 为主，HAMi 部分依据 [主仓库 `f5961582`][hami-tree] 和 [HAMi-Core `17212525`][core-tree] 两份源码快照。这里记录的是文档与源码阅读，没有进行实卡隔离效果或性能测试。

## 先把“共享”拆成三个问题

把 GPU 想成一台加工机器：计算单元负责干活，显存负责存放正在加工的数据。多个任务使用同一张卡，至少要回答三个问题。

| 问题 | 白话理解 | 对应的资源或机制 |
| --- | --- | --- |
| 谁先干活，能干多久？ | 多个订单怎样轮流或同时加工 | 计算调度、时间片、并行执行 |
| 每个订单能摆多少材料？ | 一个任务最多能占多少空间 | 显存容量、显存配额 |
| 机器内部要不要划成独立工位？ | 每个任务是否拥有专用的一部分硬件 | SM（GPU 内部的计算单元组）等资源与显存系统的硬件分区 |

所以，“共享 GPU”不直接等于“把计算核心平均分成几份”，也不直接等于“大家各占一块固定的显存”。不同方案选择的控制位置不同。

下文还会用到三个词：**进程**是正在运行的程序；**容器**是程序的运行环境；**Pod**是 Kubernetes 安排运行位置的基本单位，一个 Pod 可以包含多个容器。例子里先按一个容器运行一个 GPU 程序理解，讲到记账时再考虑多个进程。

## NVIDIA API：NVML 负责观察和管理，CUDA 负责发起计算

API 可以先理解成软件调用硬件能力的入口。程序调用一个函数，就像给底层提交一张有明确参数的申请单。

NVIDIA 这里有两组经常出现、但职责不同的接口。

**NVML，全称 NVIDIA Management Library，是管理库。** 它可以查询设备、显存、利用率、温度、功耗等信息，也提供受硬件、驱动和权限限制的管理操作。`nvidia-smi` 底层就使用了它。[NVML 官方介绍][nvml-intro]

**CUDA 是程序发起 GPU 计算的接口体系。** 常见应用会经过 CUDA Runtime；更底层的 CUDA Driver API 提供显存、上下文和 kernel 启动等操作。Runtime 负责处理更多初始化和上下文细节，Driver API 则让调用方拥有更直接的控制。[Runtime 与 Driver API 的区别][cuda-layers]

| 接口 | 典型调用 | 白话含义 |
| --- | --- | --- |
| NVML 设备查询 | `nvmlDeviceGetCount_v2`、`nvmlDeviceGetHandleByIndex_v2` | 有几张卡？取得某张卡的操作句柄 |
| NVML 状态查询 | `nvmlDeviceGetMemoryInfo`、`nvmlDeviceGetUtilizationRates` | 这张卡的显存和利用率是什么情况？ |
| CUDA Runtime | `cudaMalloc`、`cudaFree` | 为程序申请、释放 GPU 内存 |
| CUDA Driver API | `cuMemAlloc`、`cuMemFree` | 在驱动接口层申请、释放 GPU 内存 |
| CUDA Driver API | `cuLaunchKernel` | 提交一段要在 GPU 上执行的计算 |
| NVML MIG 管理 | `nvmlDeviceCreateGpuInstanceWithPlacement`、`nvmlGpuInstanceCreateComputeInstance` | 在支持 MIG 的设备上创建硬件实例 |

其中 **kernel** 是交给 GPU 执行的计算程序；这里的 kernel 指 CUDA 计算内核，不是操作系统内核。**句柄**可以理解成程序取得的一张“操作这张卡的凭证”；**UUID** 则是标识设备的唯一编号。MIG 是 Multi-Instance GPU（多实例 GPU），后文会解释它如何进行硬件分区。接口定义分别见 [NVML 查询][nvml-queries]、[CUDA 显存管理][cuda-memory]、[CUDA 执行控制][cuda-exec] 和 [NVML MIG 管理][nvml-mig]。

<figure>
  <a href="/media/blog/gpu-sharing-nvidia-kubernetes-hami/api-layers.svg" aria-label="查看 NVIDIA 管理与计算 API 调用层次原图">
    <img src="/media/blog/gpu-sharing-nvidia-kubernetes-hami/api-layers.svg" width="960" height="840" loading="lazy" decoding="async" alt="节点侧通过 NVML 查询 NVIDIA 驱动和 GPU；容器侧应用经 CUDA Runtime、HAMi-Core 和 CUDA Driver API 发起计算。HAMi-Core 在驱动接口调用到达真实驱动前检查配额。" />
  </a>
  <figcaption>图 1　管理与计算是不同的调用路径。右侧画的是常见 Runtime 路径，应用也可以直接使用 Driver API；HAMi-Core 还会拦截部分 NVML 查询以返回容器的配额视图。点击图片可放大，再次点击图片关闭。</figcaption>
</figure>

例如，下面是一个简化的 NVML 查询流程，省略了实际程序必须逐项检查的返回值：

```c
nvmlInit_v2();

nvmlDevice_t gpu;
nvmlDeviceGetHandleByIndex_v2(0, &gpu);

nvmlMemory_t memory;
nvmlDeviceGetMemoryInfo(gpu, &memory);
// memory.total / memory.used / memory.free 的单位是字节

nvmlShutdown();
```

这段代码拿到了设备信息，但没有为某个容器设置显存上限。普通 HAMi-Core 共享模式的配额检查，发生在后面要讲的 CUDA 调用拦截过程中。

## “轮流使用 GPU”像并发，但显存不会跟着轮流清空

一个 CUDA 程序会使用 **context（上下文）** 来管理自己的 GPU 执行状态和资源。可以把它理解为这份工作的运行档案：它关联了显存、计算提交等状态。

在常见的非 MPS 多进程路径中，不同 context 的计算通过 GPU 的调度机制交替推进。A 运行一段，换 B，再继续 A；多个任务可以都处于运行状态，不必等 A 的整个程序结束后 B 才开始。这与 CPU 时间片帮助理解的“并发”相似。具体次序和时长由驱动与硬件安排，不保证固定时间或严格交替。[NVIDIA 关于 context 与调度的说明][mps-architecture]

**暂停计算不等于释放显存。** A 的模型和中间数据通常仍在显存里，B 也可能已经把自己的模型加载进来。因此，执行时间可以交替，显存占用却同时存在。

<figure>
  <a href="/media/blog/gpu-sharing-nvidia-kubernetes-hami/time-and-memory.svg" aria-label="查看计算时间片与显存驻留的区别原图">
    <img src="/media/blog/gpu-sharing-nvidia-kubernetes-hami/time-and-memory.svg" width="960" height="580" loading="lazy" decoding="async" alt="上半部分展示 A 与 B 的计算交替推进；下半部分展示同一时刻 A 占 4 GiB、B 占 8 GiB、剩余 12 GiB 显存。A 暂停计算时仍可能保留自己的显存数据。" />
  </a>
  <figcaption>图 2　计算时间与显存容量是两个维度。时间段只是概念示意，显存色块表示用量，不表示连续的物理地址分区。点击图片可放大，再次点击图片关闭。</figcaption>
</figure>

这也解释了一个常见现象：GPU 利用率看起来不高，但显存已经装不下另一个模型。理解共享方案时，需要分别看计算调度和容量限制。

CUDA **stream（流）** 则是一个上下文内提交操作的有序队列；同一 context 中不同 stream 的工作可能并行。不能把“不同程序轮流计算”推广成“GPU 内部所有计算永远只能串行”。[CUDA 调度背景][mps-architecture]

## Kubernetes 默认为什么会按整卡分配

Kubernetes 可以先理解成管理员：接收任务的资源申请，再选择合适的服务器。它通过 **Device Plugin（设备插件）** 认识 GPU 等专用设备。插件向节点上的 kubelet 登记设备列表，由 kubelet 上报可调度资源；kubelet 是每台节点上负责运行 Pod 的代理。[Device Plugin 官方说明][k8s-device-plugin]

传统默认的整卡模式通常把一张物理卡上报成一个设备：

```text
节点有一张物理 GPU
→ 上报 nvidia.com/gpu = 1
→ 容器 A 申请 1，分配成功
→ 账面剩余数量为 0
→ 容器 B 再申请 1，需要等待
```

即使 A 实际只用了一点显存，这个设备单位也已经分配出去了。调度器依据申请和预留的数量做判断，利用率降低不会自动归还设备。

传统 Device Plugin 的扩展资源按整数计数，不能直接申请 `nvidia.com/gpu: 0.25`；同一个上报设备也不能直接重复分给不同容器。要共享，就需要插件和调度机制定义新的分配方式。[扩展资源的规则][k8s-device-plugin]

这属于**调度层的设备分配方式**。NVIDIA 驱动还有名为 `EXCLUSIVE_PROCESS` 的计算模式，那是另一层设置，不能把两种“独占”混成一件事。[NVIDIA 计算模式说明][mps-limits]

## Time-Slicing、HAMi 和 MIG 分别在控制什么

NVIDIA 的 Kubernetes Time-Slicing 扩展允许插件为同一张物理 GPU 登记多个 **replica（共享名额）**。Kubernetes 分别分配这些名额，任务最终访问同一张卡，计算由底层分时推进。名额数不等于物理计算核心被平均切开；多申请几个名额也不保证获得成比例的算力。[NVIDIA Time-Slicing][nvidia-time-slicing]

| 方案 | 分配给任务的东西 | 计算怎样受控 | 显存怎样受控 |
| --- | --- | --- | --- |
| 默认整卡模式 | 一张物理卡对应的设备 | 任务获得整卡访问资格 | 以整卡容量为边界 |
| NVIDIA Time-Slicing | 同一张卡上的共享名额 | 底层执行调度让任务交替推进 | 不为各 replica 提供独立的显存配额与故障隔离 |
| HAMi-Core 普通共享 | 共享名额，以及显存、算力配额 | 拦截计算提交并进行限速 | 拦截显存分配并检查累计额度 |
| NVIDIA MIG | 一个受支持的硬件实例 | 实例使用分给它的计算资源 | 按硬件 profile 划分显存及相关资源 |

“时间上的切分”和“硬件空间上的切分”，有助于理解 Time-Slicing 与 MIG。HAMi-Core 普通模式则结合了容量配额与计算提交限速：给 A 最多 4 GiB、给 B 最多 8 GiB，同时控制它们提交计算的速度。

**容量配额不意味着显存已被预先切成独立、连续的物理区域。** 程序真正申请内存时，仍由 NVIDIA 驱动完成分配。HAMi-Core 检查这个申请是否超过容器额度。

MIG 在支持的 GPU 上划分计算资源和显存系统，使用硬件支持的 profile，不能随意把任何大小都拼成一个实例。具体设备和配置应查 [MIG 官方文档][mig-intro]。

另外，NVIDIA **MPS（Multi-Process Service）** 也提供多进程共享能力，可以改善合作型 CUDA 任务的并行执行，并有相应的显存与计算资源控制。其能力随 GPU 和版本变化。本文的 HAMi-Core 普通共享流程没有把 MPS 当作必需条件，MPS 也不能简单归类成“只有轮流执行”。[MPS 的适用范围与限制][mps-limits]

## HAMi 的第一步：给同一张卡登记多个名额

HAMi 普通共享模式默认可以将一张物理卡登记为多个逻辑设备，源码通过给 UUID 加后缀生成不同 ID：

```text
GPU-abc-0 → 容器 A ┐
GPU-abc-1 → 容器 B ├→ 同一张物理卡 GPU-abc
GPU-abc-2 → 容器 C ┘
```

对 kubelet 来说，它分配的是不同设备 ID；对 HAMi 来说，它们映射到同一张卡。因此仍可遵守整数设备的分配方式。[逻辑设备生成源码][hami-replicas]

但多个名额只解决“允许几个任务进入”。HAMi 还要维护每张卡的显存、算力和占用名额，才能判断新的申请是否放得下。

例如，容器可以声明以下资源片段：

```yaml
resources:
  limits:
    nvidia.com/gpu: 1
    nvidia.com/gpumem: 4096
    nvidia.com/gpucores: 30
```

在默认单位设置下，这表示申请一张卡上的一个名额，每张所申请的卡分配 4096 MiB 显存额度、30% 算力预算。`4096 MiB = 4 GiB`。如果 `gpu` 改成 2，显存和算力要求分别应用到两张卡，不是两张卡合计只有 4 GiB。[请求解析源码][hami-request]

在本文快照的默认配置中，只写 `gpu: 1` 会采用整卡显存，Webhook 还会在相应条件下补入 100% 算力；不能把它理解为自动获得“十分之一张卡”。共享名额是准入数量，显存和算力则由具体申请及默认值决定。[默认值与配置][hami-values]

假设一张卡有 24 GiB 显存、10 个共享名额，算力记为 100，且没有开启超卖。仅考虑配额，下面两份申请可以放在同一张卡：

| 账本项目 | 容器 A | 容器 B | 剩余可分配 |
| --- | --- | --- | --- |
| 名额 | 1 | 1 | 8 |
| 显存 | 4 GiB | 8 GiB | 12 GiB |
| 算力预算 | 30 | 40 | 30 |

这些数字是调度账本中的预留量，不代表此刻显卡上实际已经分配了同样多的显存，也不代表当前实测利用率。实际执行仍受驱动、程序、其他资源和运行时限制影响。

## 从提交 Pod 到真正用上 GPU

HAMi 沿用 Kubernetes 的扩展入口，将分配过程接起来。

<figure>
  <a href="/media/blog/gpu-sharing-nvidia-kubernetes-hami/pod-allocation.svg" aria-label="查看 HAMi Pod 调度与运行时限制流程原图">
    <img src="/media/blog/gpu-sharing-nvidia-kubernetes-hami/pod-allocation.svg" width="960" height="870" loading="lazy" decoding="async" alt="HAMi 流程依次为 Webhook 识别申请、Filter 选卡并预占资源、写入 Pod 注解、Bind 获取节点锁并绑定、Allocate 注入设备与限制、HAMi-Core 拦截 CUDA 调用。调度账本与容器实际限制分别工作。" />
  </a>
  <figcaption>图 3　这里依据所阅读版本的实现：具体选卡、预占和分配记录写入发生在 Filter，Bind 负责节点锁与绑定。点击图片可放大，再次点击图片关闭。</figcaption>
</figure>

1. **Webhook 处理入口。** 可以把它理解成提交时的检查站：识别 GPU 资源、校验参数，为需要 HAMi 的 Pod 设置对应的 `schedulerName`。
2. **Filter 选节点和具体卡。** 调度器读取每张 GPU 的属性，检查名额、显存、算力、型号和其他约束，选择具体 UUID，并预占资源。
3. **Pod 注解保存结果。** `hami.io/vgpu-devices-allocated` 保留分配记录；`hami.io/vgpu-devices-to-allocate` 保存节点插件要消费的待分配记录。
4. **Bind 完成绑定。** 调度器获取所需节点锁，并将 Pod 绑定到目标节点。
5. **Allocate 准备容器。** 节点插件找到对应 Pod，读取记录，把 GPU 访问配置、库文件和限制参数交给容器运行时。
6. **HAMi-Core 执行检查。** 容器中的 CUDA 调用进入拦截库，按额度检查显存分配、控制计算提交。

对应源码入口是 [Webhook][hami-webhook]、[Filter 与 Bind][hami-scheduler]、[Allocate][hami-allocate]。Node 注解和 Pod 注解在这里充当组件之间的记录与通信载体。

## 显存限额：在申请发生时检查，多个进程一起记账

节点插件会为上面的资源申请生成类似参数：

```text
CUDA_DEVICE_MEMORY_LIMIT_0=4096m
CUDA_DEVICE_SM_LIMIT=30
```

它还挂载 `libvgpu.so` 和 `/etc/ld.so.preload`。Linux 的动态加载器读取 preload 配置，使容器进程加载 HAMi-Core。后者实现 CUDA/NVML 函数拦截，还处理 `dlsym`、`cuGetProcAddress` 等取得函数地址的路径。文档中的 `cuMemAlloc`，在动态符号层面会出现 `cuMemAlloc_v2` 等版本名，源码需要处理这些接口。[分配与注入][hami-allocate]、[符号拦截][core-hook]

可以用以下伪代码理解常见分配路径，具体分支以源码为准：

```text
收到显存申请
  → 锁住容器的共享账本
  → 检查：已记账用量 + 新申请量 是否超过额度
  → 超过：返回 CUDA_ERROR_OUT_OF_MEMORY
  → 未超过：先预占额度，再释放账本锁
  → 调用真实 NVIDIA 驱动分配内存
  → 驱动分配失败：退回预占额度
```

这里检查的是容器额度，不能让同一容器里的每个进程各自拿到完整的 4 GiB。HAMi-Core 使用共享区域累计多个进程的用量，锁住检查与预占过程，避免两个进程同时看到“还有额度”后都成功放行。[显存记账与预占源码][core-memory]

当前版本默认还把限制参数写入只读的 `/overrideEnv` 文件，以便 SSH、`su -`、`sudo` 等丢失原环境变量的进程读取。`limitDelivery: env` 则只使用环境变量。[限制传递配置][hami-values]

## 算力额度：控制提交速度，不等于固定划走几个核心

`gpucores: 30` 容易被理解成“有 30% 的物理核心只属于我”。普通 HAMi-Core 路径实际采用的是计算提交限速。

`cuLaunchKernel` 可以看作向 GPU 提交一份加工任务。HAMi-Core 在这类入口消耗令牌，令牌不足时等待；后台线程依据利用率反馈调整补充速度。所阅读版本会结合 kernel 的 grid 和 block 规模计算消耗。这是一种控制提交节奏的机制，最终的硬件执行仍由 NVIDIA 驱动安排。[kernel 拦截][core-cuda-memory]、[令牌与利用率反馈][core-rate]

它也不等于“每 100 毫秒保证恰好运行 30 毫秒”，更不能推出“这个程序的吞吐一定等于整卡的 30%”。不同计算、访存、长 kernel 和调度行为都会影响实际结果。

当前默认 `gpuCorePolicy: default` 允许在没有相关竞争任务时借用空闲算力；`force` 持续启用限速，`disable` 关闭限速。0 和 100 不走这套百分比限速。节点侧 vGPUmonitor 通过共享状态参与开关与优先级反馈，实际的等待发生在容器内。[策略配置][hami-values]、[monitor 反馈][hami-feedback]

## 共享调度真正难在哪里

把卡登记成 10 个名额只是起点。更复杂的工作在于让每个环节面对同一份分配事实。

**首先，资源必须落到某一张卡。** 假设两张卡各剩 3 GiB，节点合计剩 6 GiB，一个单卡需要 4 GiB 的任务仍然放不下。HAMi 的 `Fit()` 同时检查具体卡的剩余名额、显存和算力，也处理健康、型号、UUID、NUMA 与配额等约束。[每卡匹配逻辑][hami-fit]

**其次，多个任务不能重复预订同一份资源。** 如果只剩 6 GiB，两个 4 GiB 任务同时读取旧账本，就可能都认为能放下。调度阶段需要加锁和预占，让后一个申请看到前一个已经占用的额度。[Filter 中的预占][hami-scheduler]

**再次，节点实际交付的卡和额度必须与调度结果一致。** 传统 `Allocate` 请求不直接携带完整的 Pod 身份与 HAMi 配额。这个版本通过节点锁定位正在分配的 Pod，再读取它的分配记录；不能随意挑一个写着相似注解的 Pending Pod。[Pod 定位逻辑][hami-pending]

**最后，失败、退出和重启都要正确处理。** 预占后绑定失败，需要撤回记录；Pod 完成或删除后要释放记账；仍持有设备的 Terminating Pod 不能提前视为空闲；调度器重启后，需要根据已有 Pod 注解恢复账本。初始化容器和长期运行的 sidecar 还会带来不同的生命周期占用。[Pod 生命周期与恢复][hami-lifecycle]

这些问题决定了 GPU 共享方案是否能在集群里持续正确地工作，不能只看一段“把设备数量乘以十”的代码。

## 哪些来自 NVIDIA，哪些由 HAMi 实现

HAMi 使用 NVIDIA 和 Kubernetes 的基础能力，并维护自己的调度及运行时控制代码。[主仓库依赖][hami-deps]、[HAMi-Core 构建入口][core-build]

| 能力 | 实现来源 |
| --- | --- |
| 真正执行计算、分配显存 | NVIDIA 驱动与 CUDA |
| 查询、管理 NVIDIA GPU | NVML，以及 `go-nvml`、`go-nvlib` 等库 |
| Kubernetes 设备插件基础 | 基于 NVIDIA Device Plugin 代码适配扩展 |
| 选择具体卡、配额匹配、分配记录与恢复 | HAMi 调度器 |
| CUDA/NVML 拦截、多进程显存记账、计算提交限速 | HAMi-Core |
| MIG 硬件实例 | NVIDIA 硬件与 NVML 提供能力，HAMi 负责规划和生命周期 |

在 MIG 分支中，可以直接看到创建 GPU Instance、Compute Instance 的 NVML 调用。这里的“切硬件”由 NVIDIA 提供，HAMi 将其与 Pod 申请、可用位置和回收过程接起来。[MIG 实例创建][hami-mig]

HAMi 的特点在于把**集群调度、具体设备选择、容器配额和运行时执行**结合起来，并通过统一设备接口接入不同厂商。它的 `libvgpu.so` 并不是一个能控制所有品牌 GPU 的通用驱动。[设备抽象接口][hami-interface]

## 系统与隔离边界需要分别确认

“NVML 在某个平台可用”“CUDA 程序能运行”“HAMi 的完整共享流程可用”，是三个需要分别确认的条件。

| 环境 | 可以怎样理解 |
| --- | --- |
| Linux + NVIDIA GPU | NVML/CUDA 有相应支持；完整能力仍取决于设备、驱动、运行库与部署配置 |
| Windows + NVIDIA GPU | NVML 有 Windows 库，但不能直接套用 Linux 的 preload 注入路径 |
| WSL2 + NVIDIA GPU | 有 CUDA 支持，但 NVML 查询与管理功能存在限制，不能直接推断与原生 Linux 等价 |
| macOS / Apple GPU | 不能直接使用本文的 NVIDIA CUDA/HAMi-Core 路径控制 Apple GPU |
| AMD、昇腾等其他设备 | 需要对应厂商的设备插件、运行库和隔离实现 |

NVML 的平台与设备功能范围见 [官方说明][nvml-intro]，WSL 的限制见 [CUDA on WSL][cuda-wsl]。所阅读的 HAMi-Core 版本明确要求 **Linux + glibc，x86_64 或 aarch64**。[HAMi-Core 运行要求][core-readme]

普通 HAMi-Core 是用户态 API 级控制，效果依赖库正确注入、接口被覆盖以及配额配置。它不等同 MIG 的硬件隔离，也不会自动获得独立的显存带宽、缓存或故障域。NVML 的容器内查询值还可能已被拦截成额度视图，排查时需要区分节点侧物理统计与容器看到的信息。[拦截入口][core-hook]、[MIG 的硬件资源边界][mig-intro]

调大 `deviceMemoryScaling`、`deviceCoreScaling` 可以放宽调度账面容量，但不会增加真实显存或计算能力。容量、利用率和性能都需要结合实际工作负载验证。[配置及注释][hami-values]

继续阅读源码时，可以沿着 `GetPluginDevices → Filter → Fit → Allocate → reserve_device_memory / rate_limiter` 这条路径走：前半段回答任务为什么被放到这里，后半段回答它运行时如何遵守额度。

## 文档与源码入口

- [NVIDIA NVML API Reference][nvml-intro]：设备管理库及平台说明。
- [CUDA Driver API：显存管理][cuda-memory]、[执行控制][cuda-exec]：显存分配和 kernel 提交接口。
- [NVIDIA Time-Slicing][nvidia-time-slicing]、[MPS][mps-limits]、[MIG][mig-intro]：三种不同层面的共享能力。
- [Kubernetes Device Plugins][k8s-device-plugin]：传统设备登记与分配契约。
- [HAMi 源码快照][hami-tree]、[HAMi-Core 源码快照][core-tree]：本文实现分析对应的固定版本。

[nvml-intro]: https://docs.nvidia.com/deploy/nvml-api/nvml-api-reference.html
[nvml-queries]: https://docs.nvidia.com/deploy/nvml-api/latest/api/group__nvmlDeviceQueries.html
[nvml-mig]: https://docs.nvidia.com/deploy/nvml-api/latest/api/group__nvmlMultiInstanceGPU.html
[cuda-layers]: https://docs.nvidia.com/cuda/cuda-driver-api/driver-vs-runtime-api.html
[cuda-memory]: https://docs.nvidia.com/cuda/cuda-driver-api/cuda_driver_api/group__CUDA__MEM.html
[cuda-exec]: https://docs.nvidia.com/cuda/cuda-driver-api/cuda_driver_api/group__CUDA__EXEC.html
[cuda-wsl]: https://docs.nvidia.com/cuda/wsl-user-guide/
[mps-architecture]: https://docs.nvidia.com/deploy/mps/architecture.html
[mps-limits]: https://docs.nvidia.com/deploy/mps/when-to-use-mps.html
[nvidia-time-slicing]: https://docs.nvidia.com/datacenter/cloud-native/gpu-operator/latest/gpu-sharing.html
[mig-intro]: https://docs.nvidia.com/datacenter/tesla/mig-user-guide/introduction.html
[k8s-device-plugin]: https://kubernetes.io/docs/concepts/extend-kubernetes/compute-storage-net/device-plugins/
[hami-tree]: https://github.com/Project-HAMi/HAMi/tree/f5961582200a9832a1e364017528a652629e006f
[core-tree]: https://github.com/Project-HAMi/HAMi-core/tree/17212525d27ac156955ab940c5d51df33d9e0d09
[hami-replicas]: https://github.com/Project-HAMi/HAMi/blob/f5961582200a9832a1e364017528a652629e006f/pkg/device-plugin/nvidiadevice/nvinternal/rm/devices.go#L195
[hami-request]: https://github.com/Project-HAMi/HAMi/blob/f5961582200a9832a1e364017528a652629e006f/pkg/device/nvidia/device.go#L648
[hami-webhook]: https://github.com/Project-HAMi/HAMi/blob/f5961582200a9832a1e364017528a652629e006f/pkg/scheduler/webhook.go#L60
[hami-scheduler]: https://github.com/Project-HAMi/HAMi/blob/f5961582200a9832a1e364017528a652629e006f/pkg/scheduler/scheduler.go#L1234
[hami-allocate]: https://github.com/Project-HAMi/HAMi/blob/f5961582200a9832a1e364017528a652629e006f/pkg/device-plugin/nvidiadevice/nvinternal/plugin/server.go#L1372
[hami-values]: https://github.com/Project-HAMi/HAMi/blob/f5961582200a9832a1e364017528a652629e006f/charts/hami/values.yaml#L715
[hami-feedback]: https://github.com/Project-HAMi/HAMi/blob/f5961582200a9832a1e364017528a652629e006f/cmd/vGPUmonitor/feedback.go#L81
[hami-fit]: https://github.com/Project-HAMi/HAMi/blob/f5961582200a9832a1e364017528a652629e006f/pkg/device/nvidia/device.go#L1024
[hami-pending]: https://github.com/Project-HAMi/HAMi/blob/f5961582200a9832a1e364017528a652629e006f/pkg/util/util.go#L81
[hami-lifecycle]: https://github.com/Project-HAMi/HAMi/blob/f5961582200a9832a1e364017528a652629e006f/pkg/scheduler/scheduler.go#L244
[hami-deps]: https://github.com/Project-HAMi/HAMi/blob/f5961582200a9832a1e364017528a652629e006f/go.mod
[hami-mig]: https://github.com/Project-HAMi/HAMi/blob/f5961582200a9832a1e364017528a652629e006f/pkg/device-plugin/nvidiadevice/nvinternal/plugin/migmgr.go#L623
[hami-interface]: https://github.com/Project-HAMi/HAMi/blob/f5961582200a9832a1e364017528a652629e006f/pkg/device/devices.go#L34
[core-hook]: https://github.com/Project-HAMi/HAMi-core/blob/17212525d27ac156955ab940c5d51df33d9e0d09/src/libvgpu.c#L97
[core-memory]: https://github.com/Project-HAMi/HAMi-core/blob/17212525d27ac156955ab940c5d51df33d9e0d09/src/allocator/allocator.c#L16
[core-cuda-memory]: https://github.com/Project-HAMi/HAMi-core/blob/17212525d27ac156955ab940c5d51df33d9e0d09/src/cuda/memory.c#L478
[core-rate]: https://github.com/Project-HAMi/HAMi-core/blob/17212525d27ac156955ab940c5d51df33d9e0d09/src/multiprocess/multiprocess_utilization_watcher.c#L37
[core-build]: https://github.com/Project-HAMi/HAMi-core/blob/17212525d27ac156955ab940c5d51df33d9e0d09/src/CMakeLists.txt
[core-readme]: https://github.com/Project-HAMi/HAMi-core/blob/17212525d27ac156955ab940c5d51df33d9e0d09/README.md#L46
