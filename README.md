# dsh-code-review

让 AI 写的代码在 push 之前过一道质量关卡：**拦截 → 评审 → 修复 → 验收 → 放行**。

一个 DeepSeek Harness（dsh）插件：默认零成本风险门控，高危变更触发评审；agent 的 `git push` 被拦下后，进入"发现冻结 → 修复 → 纯验收 → 放行"的闭环。不是又一份"让 AI 看看代码"的报告，而是把评审变成**可执行的工程契约**。

包名 `dsh-code-review`，命令与工具沿用 `jury` 命名空间（`/jury`、`jury_run`、配置键 `jury`）。

---

## 30 秒看懂：有它 vs 没它（全部来自真实运行记录）

| 场景 | 没它（裸 dsh） | 有它 |
|---|---|---|
| agent 写完带雷代码就 `git push` | SQL 注入、浮点金额直接进入远端 | push 被 deny，agent 收到带 file:line 的 finding 并修复，验收通过才放行 |
| 修复过程 | 每轮评审都冒出新问题，人机互卷（我们实测失控烧掉 **680 万 token**） | 首轮冻结 finding 集，之后**只验收、不新增**（同场景降到 **28.1 万 token，-95.9%**） |
| 需求里写了"审计必须含操作者 IP"，实现漏了 | diff-only 评审看不出来（baseline 实测漏检） | intent 条款逐条核对，`unmet` 即拦截；补上后才放行 |
| 验收通过后 agent 又改了两行 | 没人知道 | exact-HEAD 绑定：新 HEAD 必须重新验收 |
| 修不好 / 反复失败 | 无限循环 | 达到轮次/预算上限 → 确定性输出"请人工裁决"，push 保持阻断 |
| 一个干净的小改动 | 也可能被拉去评审 | 风险门控直接跳过，**零子代理、零模型成本** |

## 实测数据（可复跑，证据在 `eval/`）

**① 质量关卡闭环**
- single 引擎完整闭环：发现 2 个雷 → agent 修对 → 验收 2/2 fixed → **真实 push 成功**，全程 **2 个子代理、$0.0227**（EVAL-009）
- 契约验收套件 **20/20** + 命令绕过断言 **21/21** 通过：**0 次未授权 push**（含语义等价修复保持 fixed、重引入转 open、新 HEAD 强制复验、超轮次确定性升级人工）
- 已认证环境 install → 调用 → gate → push 端到端 **5/5**（EVAL-012）

**② 需求对齐（intent）**
- 自动读取会话中的需求（sessionQuery），无需手工转述：遗漏拦截 / 正确放行 / 阴性不幻觉，**3/3**（EVAL-011）
- 反例修复：曾出现"放行但浮点分未修"——现在 **accepted = 零 open finding AND 零 unmet 需求条款**，复测浮点分被拦截、修复后放行（EVAL-012）

**③ 评审团什么时候值得开（不夸大）**
- 弱 baseline 下：埋雷集单审 5/8 → 四人评审团 **8/8**，且 6/8 的雷只有单一视角发现（EVAL-001）
- 高级雷（跨 hunk/时区/缓存失效）：baseline 6/7 → 评审团 **7/7**，增量发现的边际成本 **$0.061/雷**（EVAL-004）
- 但 R3 物理隔离对照中，**standard 在 0/3 样本上超过 dsh 原生单审**——所以评审团只是显式深度档，**不是默认卖点**（EVAL-010）

**④ 成本（谷时实测美元价）**

| 形态 | 召回 | 成本 |
|---|---|---|
| 无插件单审 baseline | 8 雷 | $0.052 |
| single（默认） | 7 雷 | $0.108 |
| standard 评审团（显式深度档） | 7 雷 + 1 超时 | $0.320 |
| 低危变更（门控跳过） | — | **$0** |

**⑤ Dogfood：用它 Review 它自己**
- 自评审抓到 **5 个真实 bug**（无 upstream 首次 push 漏审、`git -C` 错仓库验收、冻结状态丢失、hunk 解析误判、依赖未声明），全部最小修复并回归后推送（`94a2c17`，EVAL-013）

## 什么时候不要用（诚实边界）

- **只想要"审得更准"**：R3 对照没有证明 single/standard 比 dsh 原生单审更强。本插件的价值在契约与闭环，不在召回优势
- 大型真实 diff（>400 行）上 standard 出现过超时，深度档需要分块与预算策略
- gate 只覆盖 bash/pwsh 工具回路里的 git 操作：直接操作远端 API、GUI、其他执行路径**不在防护边界内**
- 干净 DSH_HOME 登录流程未测；外部真实用户采用未验证（安装验证为本机模拟）

## 验证与复现

前提：Node.js 22+、npm、Git、zstd、dsh `0.2.1-rc.2`、PATH 中可用的 pnpm。完整契约复现还需要**已认证的 dsh 账户**；所有 push 只进入本地 bare remote。

**免费验证（无需模型）**：构建、TypeScript 检查与 21 条命令断言。

```sh
npm install
npm run typecheck && npm run build
node eval/acceptance/gate-command-assert.mjs  # 期望：21 passed / 0 failed
```

**完整契约复现（真实 dsh 调用）**：约 15–30 分钟，R4 实测模型费用约 **$0.21**，随模型、缓存和修复轮次波动。

```sh
git clone https://github.com/cyra-sketch/dsh-code-review.git
cd dsh-code-review
npm install && npm run build

# 三步：物化 fixture → 安装到隔离 profile 并运行全部场景 → 机器断言
bash eval/acceptance/prepare.sh
node eval/acceptance/run.mjs
node eval/acceptance/assert.mjs                # 期望：20 passed / 0 failed
node eval/acceptance/gate-command-assert.mjs   # 期望：21 passed / 0 failed
```

`prepare.sh` 默认不覆盖已有工作区；只有显式 `bash eval/acceptance/prepare.sh --reset` 才重置。新断言输出写入被 gitignore 的 `eval/acceptance/.results/`，不会重写历史证据 `assert-results.json`。原始事件流在 `eval/runs/`、验收场景在 `eval/acceptance/`、预算账在 `eval/budget-*.md`——所有结论都可对照原始证据复核。

## 安装

要求 Node.js 22+、npm、Git、zstd、dsh `>=0.2.1-rc.2 <0.3.0`（示例固定 `0.2.1-rc.2`）、PATH 中可用的 `pnpm`，以及用于模型评审的**已认证 dsh 账户**。pnpm 是 DSH 插件管理器的前置条件，首次安装实测会因缺少它失败。本包是标准 dsh bundle，本地目录、tarball、npm 包和 GitHub spec 均走 `dsh plugin add`。

```sh
# 建议为插件派生独立 profile；也可直接使用已有的交互式 profile
npx @deepseek-ai/dsh@0.2.1-rc.2 --profile jury --from-default-profile headless
npx @deepseek-ai/dsh@0.2.1-rc.2 plugin --profile jury add /absolute/path/to/dsh-code-review

# 校验组合结果
npx @deepseek-ai/dsh@0.2.1-rc.2 --profile jury --dump-config
```

从 GitHub 源码安装时，包内 `prepare` 会构建 TypeScript；pnpm 若要求 `allowBuilds`，只应对可信源码授权。本地 checkout 可先运行 `npm install && npm run build`。

R4 已在默认已认证 home 下新建独立 `jury-r4-e2e` profile，完成 tarball 安装 → headless `jury_run` → block gate → 本地 bare push，见 `eval/e2e-auth/` 与 EVAL-012。这验证的是**已认证环境下安装到闭环**；独立干净 DSH_HOME 的登录流程因不读取/复制 credentials 的边界而未测。

## 使用

在支持用户命令的交互式 profile 中：

```text
/jury
/jury path/to/change.diff
/jury path/to/change.diff single
/jury deep
/jury --base main --tier standard
```

在 headless 中通过等价工具调用：

```sh
npx @deepseek-ai/dsh@0.2.1-rc.2 --profile jury --json \
  "调用 jury_run 一次，path 为 /absolute/path/to/change.diff，tier 为 auto；原样返回报告。"
```

`jury_run` 参数：

- `path`：统一 diff 文件。省略时执行当前仓库的 `git diff HEAD`。
- `base`：可选基线分支；仅在省略 `path` 时使用，评审 `base...HEAD`。
- `tier`：`single | quick | standard | deep | auto`，默认 `auto`。single 为 1 个通用 fresh-context reviewer、无独立 voter；quick 为 2 finder + 1 voter；standard 为 4 finder + 1 voter；deep 为 4 finder + 2 个独立 voter。显式档位覆盖风险门控。
- `intent`：可选需求摘要；finder 和 voter 会检查实现是否遗漏或偏离需求，而不仅是代码缺陷。gate 按 `gateIntent`、同一 agent 最近一次 jury_run intent、全局 `intent`、sessionQuery 读取的当前会话首条用户消息、`intentFile` 的顺序获取需求。显式 intent 始终优先；session 读取失败时回退到 `intentFile`。插件先确定性地拆出代码需求条款与稳定 ID，过滤 jury_run/git/报告交付等工作流指令；discovery 和验收均逐条记录 met/unmet/unknown。未提及的可选功能不视为需求偏离。

auto 使用确定性风险评分：低分不启动，中/高分默认 single；standard/deep 只在用户显式指定或 `gateTier` 强制时启用。信号包括高危路径、变更规模、文件数、外部调用、测试断言、并发事务和权限/加密标识。报告第二行始终说明评分、命中信号和最终档位。**只有低风险变更的评审模型成本接近零（none 时为 0）；中高危 single、显式深度档和修复循环仍有模型费用。**

默认 single 的依据是 R3 物理隔离对照（EVAL-010）：三个样本上 baseline 全部命中，standard 没有超过 baseline，默认不为未显示增量的评审团支付多倍成本。single 是健康默认单审；quick 仅作较低成本轻审，standard/deep 定位为用户明确要求的深度审查。本机小 PR 实验中 single 常见约 $0.01–0.03，评审团通常数倍至十余倍，实际随 diff、推理和缓存波动，不能当作报价承诺。

运行命令时应以目标仓库为当前目录。若仓库根存在 `REVIEW.md`，其内容会加入每个 finder 和 voter 的 prompt。finder 的共享 diff/规则位于相同 prompt 前缀；超过 800 行的 diff 按文件处理并过滤纯 import/格式 hunk。

报告以计数开头，包含 `consensus / disputed / solo` 和 `Important / Nit / Pre-existing`，并逐条列出 intent 条款的 met/unmet/unknown 与理由。voter 判为 invalid 的候选被过滤；uncertain 保留为 disputed；评审后无发现时输出"无需修改"，低风险 none 则明确输出"未启动评审（低风险）"。finding 按 `file + symbol + category` 确定性近重复合并。有效 finding 以 `open` 状态追加到 `<repo>/.dsh/jury/findings.jsonl`，包含稳定 finding id、runId 和时间戳。报告与 accepted 都不构成对代码全部正确性的保证。

## 配置

在 profile 的 `cordis.patch.yml` 中覆盖 `jury` 条目。patch 会替换整个 `config`，因此应写出完整配置：

```yaml
- id: jury
  config:
    finderModels:
      - provider: deepseek-account
        model: deepseek-flash
    voterModel:
      provider: deepseek-account
      model: deepseek-flash
    maxRounds: 3
    severityThreshold: minor
    gateMode: off
    agentMaxTokens: 24000
    standardMaxTokens: 32768
    maxSubagentsPerEpisode: 10
```

- `finderModels`：按 persona 顺序轮转分配；默认 `[]`，全部继承调用方当前模型。
- `voterModel`：默认继承调用方当前模型。
- `maxRounds`：1–3，默认 3。普通 jury_run 仍固定单轮；push gate 以此限制发现+验收总轮次。
- `severityThreshold`：`nit | minor | major | critical`，默认 `minor`（nit 被过滤）。
- `gateMode`：`off | report | block`，默认 `off`。首轮发现冻结 F 后，后续不新增 finding，但会独立复核所有 intent 条款。**accepted = 冻结 findings 清零 AND intent 条款无 unmet**，并绑定验收时的确切 HEAD；unknown 明示保留，accepted 不等于对代码全部正确性的保证。新 HEAD 必须重新验收，达到轮次或子代理预算时确定性升级人工。block 通过工具 deny 拦截，report 仅注入告警。覆盖常见 git push 选项与链式命令，但无法阻止直接操作远端 API、其他执行路径或绕过 bash/pwsh 工具的方式。**如果同一 bash/pwsh 命令通过 `&&`、`;`、`|`、`&` 或换行把 push 与 commit、merge、rebase、amend、reset、cherry-pick、revert、checkout、switch、pull 等 HEAD 变更命令串联，gate 会在任何评审前确定性拒绝并提示"请分步执行：先提交，再单独 push"**；block 返回 deny，report 注入告警。原因是前置钩子无法验收同一命令中尚未产生的 HEAD。`cd repo && git push` 与 `git -C repo push` 不改变 HEAD，允许执行，且 gate 会在解析后的 repo 中读取 diff、episode 和 HEAD；组合使用时 `-C` 相对 cd 目录解析。无 upstream 的首次 push 会从 Git empty tree 评审 HEAD 的完整已提交树，不再用空 `git diff HEAD` 跳过。
- `agentMaxTokens`：quick 子代理的输出与推理总上限，默认 24000。
- `standardMaxTokens`：standard/deep 子代理的输出与推理总上限，默认 32768。finder 每 persona 最多 5 条且 detail≤200 字符；voter 每批最多 8 条且理由≤80 字符。
- `maxSubagentsPerEpisode`：每个 base SHA episode 的子代理总预算，默认 10；episode 持久化在 `<repo>/.dsh/jury/gate-episodes.jsonl`。
- `gateTier`：可选 `single | quick | standard | deep`，强制 gate 发现档；缺省与 auto 一样使用 single。

## 为什么做这个

AI 写码越来越快，code review 成了新的瓶颈。Anthropic 在 2026 年 10 月公开的 Claude Code 团队经验帖中提到，Claude 写了 Claude Code 约 90% 的代码；Manus 也把内部 AI 审核机器人称为"最划算的一笔支出"。问题已经不只是怎么生成代码，而是谁在合入前检查它。

方法论来自同一篇经验帖：finder/voter 分工、收敛控制和按风险决定评审投入。我们不把这些名词当卖点，而把它们变成可执行的约束。

做成 dsh 插件，是因为 dsh 用户的代码本来就由 agent 生成。只有嵌进 agent 的执行回路，才能直接拦住它的 push，并把当前会话的需求原话带进评审；外部 CLI 可以补一部分能力，但没有这么低摩擦。

实测后也要说清楚：R3 对照没有证明我们比你的 agent 审得更准。真正提供的是无插件 baseline 没有的工程契约——冻结 findings、修完后验收、绑定确切 HEAD、超限升级人工，让"检查过"不止是一句口头结论。

## 证据与轨迹

- `eval/`：EVAL-001 ~ EVAL-013 全部实验报告、原始运行事件流（`runs/`）、预注册协议（`PROTOCOL-R*.md`）、勘误（`ERRATA-001.md`）、美元预算账（`budget-*.md`）、机器断言与验收套件（`acceptance/`）
- `trajectory/`：构建本插件的 AI agent **完整会话事件流**（49 个 `wire.jsonl`，未删节）——方向调研、机制实验、实现迭代、五轮独立面试官盲评（5/10 → 6/10 → 5/10 → 7/10 → 7/10 → 8/10）全过程

## 开发与验证

```sh
npm install
npm run typecheck
npm run build
```

当前不包含 git commit 拦截或模型请求改写。push gate 默认关闭，需显式配置启用；启用后的多轮验收冻结 findings 并逐条复核 intent 条款。
