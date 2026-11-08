---
title: Slurm 入门学习（一）
summary: 从资源申请、脚本结构和状态排查入手，通过六个本地作业实验理解 Job、Step、Task，以及 Slurm 与程序之间的能力边界。
pubDate: "2026-11-08T00:00:00+08:00"
tags:
  - Slurm
  - Linux
  - 高性能计算
  - 学习笔记
featured: false
draft: false
---

第一次接触 Slurm 时，我最容易把“申请了资源”和“程序会使用这些资源”混在一起：申请两个 CPU，程序就会自动并行吗？提交脚本后，代码和数据会一起传到计算节点吗？作业显示完成，就说明计算结果正确吗？

这次我在本地运行了六个小任务，从输出节点名称开始，依次观察 Python 计算、程序失败、超时、作业数组和多个进程的启动。它们把学习路线串成了一个完整过程：

**了解集群 → 申请资源 → 提交作业 → 查看状态和日志 → 根据结果调整资源与程序。**

Slurm 负责安排计算资源、启动和管理作业，并在资源不足时组织排队。程序的计算方法、软件依赖和结果校验，需要由使用者准备。[官方用户入门指南](https://slurm.schedmd.com/quickstart.html)

## 用工厂接订单理解 Slurm

可以把集群想成一家有多个车间的工厂，Slurm 是调度员，使用者是来下订单的人。

你交上一张加工单，说明需要几个工位、多少加工空间、最多使用多久，以及按什么方法完成工作。调度员检查是否有空位，安排开工，记录过程，并在约定时间结束时收回资源。

| Slurm 中的概念 | 工厂里的类比 | 实际含义 |
| --- | --- | --- |
| Node | 车间 | 一台计算服务器，包含 CPU、内存，也可能有 GPU |
| Partition | 按设备和规则组织的车间组 | 一组节点及其使用规则，例如 GPU 分区或短时调试分区 |
| Job | 一张订单 | 一次作业，包含资源申请、时间限制和作业编号 |
| Job Step | 一道工序 | 作业内的一次执行步骤，通常通过 `srun` 启动 |
| Task | 执行工序的一位工人 | 通常对应一个进程 |
| CPU | 工位 | 分配给任务使用的 CPU 资源 |
| 内存 | 加工时摆放材料的空间 | 程序运行时使用的主机内存 |

一张订单可以包含多道工序，一道工序也可以安排多位工人。例如：

```text
Job：做一张大桌子
├── Step：切割
└── Step：打磨
    ├── Task 0：处理左半边
    └── Task 1：处理右半边
```

类比中的“怎样分左右两边”由加工方法决定。对应到程序，Slurm 可以把进程启动起来，但进程之间怎样分工、通信和合并结果，需要代码实现。

还有几个与使用集群有关的概念：

- **登录节点和计算节点**：通常在登录节点准备文件、编写脚本和提交作业，由计算节点执行计算。使用规则以所在集群的说明为准。
- **Account**：作业所属的项目账户，用于归属和资源记账。
- **QoS**：作业采用的服务等级，可关联优先级、资源数量和运行时限等规则。

开始使用实际集群时，我会先确认登录方式、可用分区、Account、QoS、软件环境和数据存储位置。这些信息比照搬另一台集群上的脚本更有用。

## 准备路径环境与资源申请

Slurm 建立在 Linux 的文件、进程和 Shell 使用方式之上。入门时需要能够通过 SSH 登录，使用 `scp` 或 `rsync` 传输文件，理解路径、权限、环境变量和 Shell 脚本，并会用 `less`、`tail` 查看日志。

软件环境也需要单独准备。集群可能通过 `module` 提供软件，通过 Conda 或 venv 管理 Python 依赖，或者提供容器运行方式。程序在登录终端能运行，只能说明当前环境满足要求；批处理环境和计算节点的数据路径仍需要检查。

资源参数中，最值得先分清的是下面几个：

| 参数 | 含义 | 本地实验中的例子 |
| --- | --- | --- |
| `--nodes` | 节点数量 | `--nodes=1` |
| `--ntasks` | 任务数量，常用于指定进程数量 | `--ntasks=2` |
| `--cpus-per-task` | 每个任务申请的 CPU 数量 | `--cpus-per-task=1` |
| `--mem` | 每个节点申请的主机内存 | `--mem=128M` |
| `--time` | 作业运行时限 | `--time=00:01:00` |

例如，`--ntasks=4 --cpus-per-task=8` 通常表示为四个任务申请总共 32 个 CPU；`--mem=16G` 则表示每个节点申请 16G 主机内存。CPU 在具体集群中可能按物理核或硬件线程计数，需要结合集群配置理解。[CPU 资源管理说明](https://slurm.schedmd.com/cpu_management.html)

这个 32 CPU 的组合只是参数含义示例。下文的本地实验只有两个可调度 CPU，实际脚本使用更小的申请量。申请多个 CPU 之后，程序还需要具备相应的多线程或多进程执行方式，才能利用它们。

## 本地实验环境

这次实验在 macOS ARM64 上通过 Docker 和 Colima 运行，容器内使用 Slurm 24.11.5。一个 Linux 容器同时运行认证、调度、计算和记账组件，方便集中练习普通用户的作业流程。

| 项目 | 配置 |
| --- | --- |
| 普通用户 | `student` |
| Account | `lab` |
| Partition | `debug` |
| 计算节点 | `slurm-lab` |
| 可调度 CPU | 2 |
| 可调度内存 | 1536 MiB |
| Docker 容器内存上限 | 2 GiB |
| GPU | 未配置 |

为适配无特权容器，这个环境关闭了作业级 cgroup 限制。CPU 和内存申请参与调度，但没有在这里验证每个作业的 CPU、内存硬性隔离。容器整体仍受 Docker 的资源限制。这套环境用于理解运行流程和调度行为，性能测试与内存耗尽实验需要更合适的环境。

可以下载[本文配套的实验源码](/downloads/slurm-introduction-01-lab.zip)。压缩包包含启动脚本、集群配置、六个作业脚本、Python 示例和使用说明。

解压后，在宿主机终端进入实验目录并启动：

```bash
cd 02-slurm
./lab.sh up
./lab.sh status
./lab.sh shell
```

首次启动会构建镜像，需要可用的 Docker 和镜像、软件包下载网络。测试使用的 Colima 虚拟机有两个 CPU 和约 3 GiB 内存。

`lab.sh` 是配套实验的管理脚本，属于本地封装。进入 Shell 后，当前目录为容器内的 `/workspace`，身份为 `student`；后文的 Slurm 命令都在这个容器终端执行。输入 `exit` 可以返回宿主机终端。

目录结构如下：

```text
02-slurm/
├── lab.sh
├── config/
├── container/
├── examples/worker.py
├── jobs/
│   ├── 01-hello.slurm
│   ├── 02-python.slurm
│   ├── 03-fail.slurm
│   ├── 04-timeout.slurm
│   ├── 05-array.slurm
│   └── 06-tasks.slurm
├── logs/
└── results/
```

## 先看懂脚本和常用命令

我把批处理脚本从上到下分成六部分。简单任务可以省去不需要的准备和整理步骤：

| 部分 | 常见内容 |
| --- | --- |
| 解释器 | 例如 `#!/bin/bash`，指定执行脚本正文的解释器 |
| 作业与资源配置 | 名称、分区、节点、任务、CPU、内存、GPU、时限，以及按需指定的 Account 和 QoS |
| 日志配置 | 标准输出和标准错误的保存位置 |
| 环境初始化 | 切换工作目录、加载 Module、激活 Conda 或 venv、设置环境变量 |
| 准备与执行 | 检查输入、准备临时目录、通过 `srun` 等方式启动程序 |
| 结果处理 | 保存或复制结果、清理临时文件，以及按需处理失败 |

第一份脚本就可以作为阅读入口：

```bash
#!/bin/bash
#SBATCH --job-name=hello
#SBATCH --partition=debug
#SBATCH --nodes=1
#SBATCH --ntasks=1
#SBATCH --cpus-per-task=1
#SBATCH --mem=128M
#SBATCH --time=00:01:00
#SBATCH --output=logs/%x-%j.out
#SBATCH --error=logs/%x-%j.err

set -euo pipefail
cd "$SLURM_SUBMIT_DIR"
echo "job=$SLURM_JOB_ID user=$(whoami) working_directory=$PWD"
date
srun hostname
srun sleep 3
date
```

前面的 `#SBATCH` 由 Slurm 读取，指定资源、时限和日志；后面的内容由 Bash 执行。`%x` 会替换为作业名称，`%j` 会替换为作业编号。`SLURM_SUBMIT_DIR` 表示提交时所在的目录，`SLURM_JOB_ID` 是本次作业编号。

这里有几条会直接影响运行结果的规则：

- 使用 `sbatch` 提交，Slurm 才会处理 `#SBATCH`；直接运行 `bash jobs/01-hello.slurm` 时，这些行只是 Shell 注释。
- `#SBATCH` 应放在第一条实际执行的命令之前，其中的 Shell 变量不会展开。
- 日志目录必须在提交前存在，不能等脚本正文开始执行后再创建。本地启动脚本会提前准备 `logs` 和 `results`。
- 环境加载、输入检查和结果复制都可以写进正文，按程序实际需要添加。

这些规则来自 [sbatch 脚本说明](https://slurm.schedmd.com/sbatch.html)。`set -euo pipefail` 则属于 Bash：`-e` 让这里的失败命令触发退出，`-u` 检查未定义变量，`pipefail` 让管道中的失败能够影响管道退出状态。更复杂的条件和错误处理仍需要显式编写。

实际使用中，先熟悉下面这些命令就足够完成一轮练习：

| 命令 | 用途 |
| --- | --- |
| `sinfo` | 查看分区和节点 |
| `sbatch jobs/01-hello.slurm` | 提交批处理脚本 |
| `squeue -u "$USER"` | 查看自己的排队和运行作业 |
| `scontrol show job 16` | 查看控制器中仍保留的作业详情 |
| `sacct -j 16` | 查询作业及步骤的历史记录 |
| `scancel 16` | 取消自己指定的作业 |

其中，`sbatch`、`salloc` 和 `srun` 的分工也需要分清。`sbatch` 提交脚本后返回作业编号，作业可能继续排队；`salloc` 用于申请资源分配，获得分配后通常再用 `srun` 启动程序；`srun` 可以在已有分配内创建执行步骤，在没有现有分配时也可以先申请资源。[命令概览](https://slurm.schedmd.com/quickstart.html)

下面使用我手动运行时的作业编号记录结果。读者重新提交后会得到自己的编号，查询命令中的数字应相应替换。后续实验主要展示关键参数和正文，完整的作业头部见配套源码，所有 `#SBATCH` 指令都应放在正文之前。

## 六个实验

### 实验一 Hello 跑通作业流程

先提交前面展示的完整脚本：

```bash
sbatch jobs/01-hello.slurm
squeue -u student
```

这次返回的作业编号是 16。输出日志中的主要内容为：

```text
job=16 user=student working_directory=/workspace
slurm-lab
```

日志还记录了开始和结束时间，前后相隔三秒。通过 `sacct` 查询，可以看到：

```text
JobID       JobName     State       ExitCode  Elapsed
16          hello       COMPLETED   0:0       00:00:03
16.batch    batch       COMPLETED   0:0       00:00:03
16.0        hostname    COMPLETED   0:0       00:00:00
16.1        sleep       COMPLETED   0:0       00:00:03
```

`16` 是整个作业，`16.batch` 是批处理脚本，`16.0` 和 `16.1` 分别对应两次 `srun`。脚本中的 `echo`、`date` 则直接在批处理 Shell 中执行。

这个实验确认了资源申请、程序启动和日志保存的流程。申请一分钟只是运行上限，脚本完成后就会释放资源。作业只有三秒，检查队列时可能已经结束，此时应查日志和历史记录。

放到实际业务中，它对应运行前的环境检查：确认程序版本、依赖、输入文件和输出路径都符合要求，再开始耗时计算。

### 实验二 Python 计算并保存结果

第二个脚本保留单节点、单任务、一个 CPU 的申请，将内存改为 256M，并执行：

```bash
set -euo pipefail
cd "$SLURM_SUBMIT_DIR"
srun python3 -u examples/worker.py --n 200000 \
  --output "results/python-$SLURM_JOB_ID.json"
```

上面是脚本正文，完整头部包含在配套源码的 `jobs/02-python.slurm` 中。这里的 `-u` 是 Python 的无缓冲输出选项，方便及时查看日志。

Python 程序接受 `--n`、`--sleep`、`--output` 三个参数。它的计算与校验部分为：

```python
result = sum(i * i for i in range(args.n))
time.sleep(args.sleep)
expected = args.n * (args.n - 1) * (2 * args.n - 1) // 6

if result != expected:
    raise RuntimeError("calculation validation failed")
```

程序随后创建结果目录、保存 JSON，并把记录打印到标准输出：

```python
args.output.parent.mkdir(parents=True, exist_ok=True)
args.output.write_text(json.dumps(record, indent=2) + "\n")
print(json.dumps(record), flush=True)
```

提交并查看结果：

```bash
sbatch jobs/02-python.slurm
```

本次作业编号为 17，结果文件中的主要字段为：

```json
{
  "job_id": "17",
  "n": 200000,
  "result": 2666646666700000,
  "expected": 2666646666700000
}
```

作业状态为 `COMPLETED`，退出码为 `0:0`。结果中的计算值与公式校验值相同，错误日志为空。

这里有两类输出：`logs/python-17.out` 是 Slurm 收集的标准输出，`results/python-17.json` 是 Python 主动写出的结果文件。前者帮助了解运行过程，后者是程序交付的计算结果。

一次模型训练、一次数据清洗或一组科学模拟，都可以沿用这份脚本的组织方式。程序负责计算和保存结果，Slurm 负责安排资源并管理执行。这次约两秒的耗时主要来自显式的 `sleep(2)`，不用于评价计算性能。

### 实验三 主动失败与退出码

第三个脚本在申请一个 CPU、128M 内存后，执行：

```bash
set -euo pipefail
srun python3 -c 'raise RuntimeError("Intentional failure for the Slurm exercise")'
echo 'ERROR: failure was hidden'
```

提交命令为：

```bash
sbatch jobs/03-fail.slurm
```

本次作业 18 的状态为 `FAILED`，退出码为 `1:0`，错误日志包含：

```text
RuntimeError: Intentional failure for the Slurm exercise
srun: error: slurm-lab: task 0: Exited with exit code 1
```

Python 抛出异常后返回 1，`srun` 也返回失败；在这个脚本中，`set -e` 使 Shell 随之退出，最后的 `echo` 没有执行，因此标准输出日志为空。

`ExitCode` 的格式是“退出码:信号”。`1:0` 表示退出码为 1，没有导致退出的信号。Slurm 会记录批处理脚本的退出状态，也会单独记录 `srun` 步骤的退出状态。[退出码说明](https://slurm.schedmd.com/job_exit_code.html)

这个实验对应缺失输入、非法配置、结果校验失败等业务情况。程序应明确报告问题并传播失败。假如中间命令失败后，脚本仍执行成功的后续命令并最终返回 0，就可能掩盖实际问题。

### 实验四 时间限制如何终止作业

第四个脚本使用一分钟的时限，却让程序等待五分钟：

```bash
#SBATCH --time=00:01:00
```

```bash
set -euo pipefail
echo 'This job intentionally sleeps past its time limit.'
srun sleep 300
```

提交后可以先通过队列观察它运行：

```bash
sbatch jobs/04-timeout.slurm
squeue -u student
```

作业 19 最终记录为：

| 记录 | 状态 | ExitCode |
| --- | --- | --- |
| `19` 整个作业 | `TIMEOUT` | `0:0` |
| `19.batch` 批处理脚本 | `CANCELLED` | `0:15` |
| `19.0` 等待步骤 | `CANCELLED` | `0:15` |

错误日志明确包含 `DUE TO TIME LIMIT`。这里的 `15` 是终止信号 `SIGTERM`，步骤的 `CANCELLED` 是超时终止产生的状态。

这次记录的耗时为一分十一秒。时限触发和终止处理并非精确的秒级倒计时；Slurm 的时间限制以分钟为分辨率，终止过程还涉及信号处理等机制。具体行为也受集群配置影响。[运行时限说明](https://slurm.schedmd.com/sbatch.html#OPT_time)

这个例子也提醒我：判断结果要同时看状态、退出码和日志。本次总作业的退出码虽然显示 `0:0`，但 `TIMEOUT` 和错误日志都说明它没有按原计划执行完。

真实的长时间训练或仿真需要估算时限，并由程序定期保存检查点。重新提交之后能否继续计算，取决于程序能否读取已保存的状态。

### 实验五 作业数组运行多组独立参数

第五个脚本在单任务、一个 CPU、256M 内存的配置上，加入：

```bash
#SBATCH --array=0-5%2
#SBATCH --output=logs/%x-%A_%a.out
#SBATCH --error=logs/%x-%A_%a.err
```

脚本正文根据数组编号选择参数，并使用独立的输出文件：

```bash
set -euo pipefail
cd "$SLURM_SUBMIT_DIR"
n=$((100000 * (SLURM_ARRAY_TASK_ID + 1)))
srun python3 -u examples/worker.py --n "$n" --sleep 3 \
  --output "results/array-$SLURM_ARRAY_JOB_ID-$SLURM_ARRAY_TASK_ID.json"
```

提交和查询时可以展开每个子任务：

```bash
sbatch jobs/05-array.slurm
squeue -r -u student
```

`0-5` 创建六个子任务，`%2` 限制最多同时运行两个。`SLURM_ARRAY_TASK_ID` 是子任务索引；日志名称中的 `%A` 是数组主作业编号，`%a` 是数组索引。[作业数组说明](https://slurm.schedmd.com/job_array.html)

本次数组主编号为 20，结果如下：

| 子任务 | 参数 n | 结果文件 | 状态 |
| --- | ---: | --- | --- |
| `20_0` | 100000 | `array-20-0.json` | `COMPLETED` |
| `20_1` | 200000 | `array-20-1.json` | `COMPLETED` |
| `20_2` | 300000 | `array-20-2.json` | `COMPLETED` |
| `20_3` | 400000 | `array-20-3.json` | `COMPLETED` |
| `20_4` | 500000 | `array-20-4.json` | `COMPLETED` |
| `20_5` | 600000 | `array-20-5.json` | `COMPLETED` |

六份结果均通过数值校验，错误日志为空。起止时间显示它们两两分批运行。每个子任务各自申请一个 CPU 和 256M 内存。

这里还有一个实验边界：节点本身也只有两个 CPU。因此，这次观察与 `%2` 的限制一致，但无法仅凭这次运行区分数组限流和节点资源限制的作用。

作业数组适合多个独立实验，例如三种学习率乘五个随机种子，共十五次训练；也适合让每个子任务处理一个输入文件。它们可以共享脚本，但应根据索引选择输入、参数和输出位置。

### 实验六 一个步骤启动两个 Task

最后一个脚本申请两个任务，每个任务一个 CPU：

```bash
#SBATCH --nodes=1
#SBATCH --ntasks=2
#SBATCH --cpus-per-task=1
#SBATCH --mem=128M
```

脚本只调用一次 `srun`：

```bash
set -euo pipefail
srun --label bash -c 'echo "rank=$SLURM_PROCID host=$(hostname)"; sleep 2'
```

提交命令为：

```bash
sbatch jobs/06-tasks.slurm
```

作业 26 成功完成，申请到两个 CPU，输出为：

```text
0: rank=0 host=slurm-lab
1: rank=1 host=slurm-lab
```

`--label` 给每行输出添加任务编号，`SLURM_PROCID` 则让进程获得自己在该步骤中的任务编号。两个进程都在同一个节点上。`bash -c` 后使用单引号，让这些变量在被启动的任务中展开。

这里的 `--mem=128M` 是本作业每个节点的内存申请，不是每个进程各申请 128M。

这个实验与第一个实验形成了直接对照：

| 作业 | srun 次数 | 普通执行步骤数 | 每个步骤的 Task 数 |
| --- | ---: | ---: | ---: |
| Hello 作业 16 | 2 | 2 | 1 |
| Tasks 作业 26 | 1 | 1 | 2 |

把它放回工厂类比：第一个实验先后发起两道工序，最后一个实验让两位工人执行同一道工序。本次只验证了两个进程各自报出编号，还没有实现任务分工、通信和结果合并。[srun 说明](https://slurm.schedmd.com/srun.html)

多个进程共同完成一次计算，可以用于 MPI 仿真或分布式训练；程序需要相应的并行与通信实现。多个独立模型各自训练，则通常适合组织成作业数组。[MPI 与 Slurm 的配合](https://slurm.schedmd.com/mpi_guide.html)

## 结合状态日志与记账记录排查问题

六个实验中，我反复使用的是三类信息：队列中的当前状态、程序的输出和错误日志、作业结束后的历史记录。

| 状态 | 含义 | 首先查看什么 |
| --- | --- | --- |
| `PENDING / PD` | 等待启动 | 排队原因、资源申请、Account 和 QoS 等限制 |
| `RUNNING / R` | 已分配资源并执行 | 当前日志、运行时间和程序进度 |
| `COMPLETED` | 执行成功结束 | 结果文件和业务指标是否符合预期 |
| `FAILED` | 执行失败 | 错误日志、退出码和失败步骤 |
| `TIMEOUT` | 达到运行时限 | 时限设置、检查点和恢复方式 |
| `OUT_OF_MEMORY` | 发生内存不足 | 错误日志、可用的内存统计和程序内存需求 |
| `CANCELLED` | 被取消 | 取消来源以及作业和步骤的关系 |

状态定义可以查阅[官方状态说明](https://slurm.schedmd.com/job_state_codes.html)。GPU 框架报告的显存不足还需要结合具体程序日志判断，不能把所有“内存不足”都归为同一种 Slurm 状态。

排队时，可以先查原因：

```bash
squeue -u student -o "%.12i %.12j %.12T %.30R"
scontrol show job 16
```

`Resources` 通常表示等待符合要求的资源，`Priority` 表示优先级方面的等待。节点看起来有空闲，也可能不满足作业的资源组合或使用限制，需要结合详情判断。

作业结束后，查询历史记录：

```bash
sacct -j 16 \
  --format=JobID,JobName,State,ExitCode,Elapsed,AllocCPUS,ReqMem,MaxRSS
```

`Elapsed` 是经过的运行时间，`AllocCPUS` 是分配的 CPU 数量，`ReqMem` 是申请的内存，`MaxRSS` 是可用时报告的峰值驻留内存统计。申请量与实际使用量需要分开阅读。不要仅根据“申请了多少”评价程序是否高效。

统计能否显示，取决于记账与采集配置，也与运行环境有关。本次若干短作业的 `MaxRSS` 为空，我没有据此评价内存使用效率。查询使用量时也应保留步骤记录；只显示作业分配记录可能缺少需要的统计。[sacct 说明](https://slurm.schedmd.com/sacct.html)

控制器不会永久保留所有完成作业。在本地配置中，完成记录在控制器里只短暂保留，之后 `scontrol show job` 可能返回无效编号，但仍可通过 `sacct` 查询历史。`squeue` 里没有记录，也不意味着作业没有提交成功。

## Slurm 与程序各自负责什么

做完实验后，我把边界整理成下面这张表：

| 方面 | Slurm 负责的内容 | 使用者和程序负责的内容 |
| --- | --- | --- |
| 资源调度 | 排队、分配节点和 CPU/GPU、执行优先级与额度规则 | 估算需求、选择合适资源、优化性能 |
| 程序并行 | 启动任务和执行步骤，支持跨节点运行 | 实现线程、多进程、通信与同步 |
| 软件环境 | 传递环境变量，与已配置的容器运行方式配合 | 准备依赖、镜像和兼容版本 |
| 数据文件 | 传递批处理脚本，提供显式文件传输工具 | 让代码、数据、环境在执行节点可访问 |
| 批量实验 | 作业数组、并发限制和作业依赖 | 生成参数、管理指标、汇总结果 |
| 故障处理 | 发送信号、终止作业、按配置或操作重新排队 | 保存检查点、恢复应用状态、保证重复运行安全 |
| 状态统计 | 记录状态、退出码和已配置的资源统计 | 校验结果、判断模型是否收敛或数据是否正确 |

### 申请资源后仍需要实现并行

申请八个 CPU，程序仍需要相应的执行方式才能利用它们；申请四张 GPU，模型如何分配到设备也需要由框架和代码实现。

例如，`srun -n 4 python train.py` 会启动四份进程。如果程序没有分布式协作逻辑，它们可能各自重复训练，并争写同一份输出。实际使用时还需要为这些进程申请足够的资源，这条命令只是行为示例。

申请多个节点之后，`sbatch` 仍只在分配中的一个节点执行一份批处理脚本。跨节点任务需要通过 `srun` 或合适的启动器发起，通信方式由应用提供。[批处理执行方式](https://slurm.schedmd.com/sbatch.html)

### 运行环境和数据需要提前可用

提交脚本不会自动同步整个项目、数据集和 Python 环境。默认自动传递的是批处理脚本本身，其他文件需要通过共享存储或显式传输等方式提供。

Slurm 能支持容器作业，但要由集群配置运行时等必要条件。本次实验使用 Docker 承载整个教学环境，没有验证通过 Slurm 的容器接口提交应用容器。[Slurm 容器说明](https://slurm.schedmd.com/containers.html)

### 重新排队之后由程序恢复进度

重新排队时，批处理脚本会从头开始执行。训练能否从上次的 epoch 继续，取决于程序是否保存并加载模型、优化器等需要的状态。重新启动进程与恢复计算进度是两个环节。[重新排队说明](https://slurm.schedmd.com/sbatch.html#OPT_requeue)

### 执行成功后还要验证结果

Slurm 主要根据退出状态和运行事件管理作业。程序可以正常退出，却生成错误数据；脚本也可能掩盖中间步骤的失败。Python 实验中额外进行数值校验，就是把计算正确性落实到程序中。

CPU、内存和设备限制的严格程度也取决于集群配置。本地环境没有启用作业级硬隔离，不能把资源申请值直接当成已验证的硬限制；生产配置需要结合相应的插件与策略理解。`--mem` 申请的是主机内存，GPU 显存需求仍需要另外考虑。[cgroup 配置说明](https://slurm.schedmd.com/cgroup.conf.html)

## 把这些练习用于真实任务

这六个脚本可以组合成实际项目的运行过程：先检查环境与输入文件，再执行一次训练或模拟；有多组独立输入时使用数组，需要多个进程协作时再引入并行框架。每一步都要处理程序错误，并为长任务保存可恢复的状态。

例如，三种学习率乘五个随机种子对应十五次独立训练，可以组织成数组。某一次训练如果还需要多个进程协作，它自身又可以采用多进程训练方式。这两种组织方式可以一起使用。

入门阶段，我更看重能否独立解释一次作业：申请了什么资源，实际启动了几个进程，日志和结果在哪里，为什么排队或终止，以及结束后如何校验结果。六个小实验提供了观察这些问题的起点。

## 参考资料

- [Slurm Quick Start User Guide](https://slurm.schedmd.com/quickstart.html)
- [CPU 资源管理](https://slurm.schedmd.com/cpu_management.html)
- [sbatch](https://slurm.schedmd.com/sbatch.html) 与 [srun](https://slurm.schedmd.com/srun.html)
- [作业数组](https://slurm.schedmd.com/job_array.html)
- [作业状态](https://slurm.schedmd.com/job_state_codes.html) 与 [退出码](https://slurm.schedmd.com/job_exit_code.html)
- [sacct 记账查询](https://slurm.schedmd.com/sacct.html)
- [容器运行说明](https://slurm.schedmd.com/containers.html) 与 [cgroup 配置](https://slurm.schedmd.com/cgroup.conf.html)
- [本文实验源码下载](/downloads/slurm-introduction-01-lab.zip)
