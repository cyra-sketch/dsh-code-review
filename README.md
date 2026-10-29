# dsh-code-review

让 AI 写的代码在 push 之前过一道质量关卡：**拦截 → 评审 → 修复 → 验收 → 放行**。

包名 `dsh-code-review`，命令与工具沿用 `jury` 命名空间（`/jury`、`jury_run`、配置键 `jury`）。

## 为什么做这个

AI 写码越来越快，code review 成了新的瓶颈。Anthropic 在 2026 年 10 月公开的 Claude Code 团队经验帖中提到，Claude 写了 Claude Code 约 90% 的代码；Manus 也把内部 AI 审核机器人称为“最划算的一笔支出”。问题已经不只是怎么生成代码，而是谁在合入前检查它。

方法论来自同一篇经验帖：finder/voter 分工、收敛控制和按风险决定评审投入。我们不把这些名词当卖点，而把它们变成可执行的约束。

做成 dsh 插件，是因为 dsh 用户的代码本来就由 agent 生成。只有嵌进 agent 的执行回路，才能直接拦住它的 push，并把当前会话的需求原话带进评审；外部 CLI 可以补一部分能力，但没有这么低摩擦。

实测后也要说清楚：R3 对照没有证明我们比你的 agent 审得更准。真正提供的是无插件 baseline 没有的工程契约——冻结 findings、修完后验收、绑定确切 HEAD、超限升级人工，让“检查过”不止是一句口头结论。

**standard/deep 仅作显式深度档**，不再是默认卖点。R3 物理隔离对照中，baseline 在三个样本上全部命中，standard 没有超过 baseline；single 保持默认，避免为无稳定增量的多 persona 团支付多倍成本。quick 仅作轻审，不作为高危主力。

报告与风险评分使用确定性合成，finding 写入台账；未显式传入 intent 时，插件会通过 sessionQuery 自动读取当前会话的首条用户消息。

## 安装

要求 dsh `>=0.2.1-rc.2 <0.3.0`，且 PATH 中可用 `pnpm`（DSH 插件管理器的前置条件；首次安装实测会因缺少它失败）。本包是标准 dsh bundle，本地目录、tarball、npm 包和 GitHub spec 均走 `dsh plugin add`。

```sh
# 建议为插件派生独立 profile；也可直接使用已有的交互式 profile
npx @deepseek-ai/dsh --profile jury --from-default-profile headless
npx @deepseek-ai/dsh plugin --profile jury add /absolute/path/to/dsh-jury

# 校验组合结果
npx @deepseek-ai/dsh --profile jury --dump-config
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
npx @deepseek-ai/dsh --profile jury --json \
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

报告以计数开头，包含 `consensus / disputed / solo` 和 `Important / Nit / Pre-existing`，并逐条列出 intent 条款的 met/unmet/unknown 与理由。voter 判为 invalid 的候选被过滤；uncertain 保留为 disputed；评审后无发现时输出“无需修改”，低风险 none 则明确输出“未启动评审（低风险）”。finding 按 `file + symbol + category` 确定性近重复合并。有效 finding 以 `open` 状态追加到 `<repo>/.dsh/jury/findings.jsonl`，包含稳定 finding id、runId 和时间戳。报告与 accepted 都不构成对代码全部正确性的保证。

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
- `gateMode`：`off | report | block`，默认 `off`。首轮发现冻结 F 后，后续不新增 finding，但会独立复核所有 intent 条款。**accepted = 冻结 findings 清零 AND intent 条款无 unmet**，并绑定验收时的确切 HEAD；unknown 明示保留，accepted 不等于对代码全部正确性的保证。新 HEAD 必须重新验收，达到轮次或子代理预算时确定性升级人工。block 通过工具 deny 拦截，report 仅注入告警。覆盖常见 git push 选项与链式命令，但无法阻止直接操作远端 API、其他执行路径或绕过 bash/pwsh 工具的方式。**如果同一 bash/pwsh 命令通过 `&&`、`;`、`|`、`&` 或换行把 push 与 commit、merge、rebase、amend、reset、cherry-pick、revert、checkout、switch、pull 等 HEAD 变更命令串联，gate 会在任何评审前确定性拒绝并提示“请分步执行：先提交，再单独 push”**；block 返回 deny，report 注入告警。原因是前置钩子无法验收同一命令中尚未产生的 HEAD。`cd repo && git push` 不改变 HEAD，允许执行，且 gate 会在解析后的 repo 中读取 diff、episode 和 HEAD。
- `agentMaxTokens`：quick 子代理的输出与推理总上限，默认 24000。
- `standardMaxTokens`：standard/deep 子代理的输出与推理总上限，默认 32768。finder 每 persona 最多 5 条且 detail≤200 字符；voter 每批最多 8 条且理由≤80 字符。
- `maxSubagentsPerEpisode`：每个 base SHA episode 的子代理总预算，默认 10；episode 持久化在 `<repo>/.dsh/jury/gate-episodes.jsonl`。
- `gateTier`：可选 `single | quick | standard | deep`，强制 gate 发现档；缺省与 auto 一样使用 single。

## 开发与验证

```sh
npm install
npm run typecheck
npm run build
```

当前不包含 git commit 拦截或模型请求改写。push gate 默认关闭，需显式配置启用；启用后的多轮验收冻结 findings 并逐条复核 intent 条款。
