# EVAL-005：pre-push gate 与意图上下文的决定性实验

> 日期：2026-10-28 ｜ 全部真实 dsh headless 运行；模型 `deepseek-account/deepseek-flash`、reasoning high。仅使用本地 git/bare remote，未读取凭证、未接触真实远端、未对项目仓库 commit。

## 结论先行

- **gate：部分成立，完整闭环未成立。** pre-execute deny 能真实拦截 push，agent 也确实阅读反馈、修复并重新 commit/push；但第 4 轮 quick 反复 `max-tokens`，会话 30 分钟超时，既没有放行，也没有收到预期的“请人工裁决”。
- **intent：成立，是本轮被完整证实的 harness 独占增量。** baseline 和无 intent jury 都没发现审计缺 IP；带 intent 后明确命中。pr-006 阴性对照没有幻觉出“IP 缺失/需求未实现”。
- **插件形态有场景性价值，但不是全面胜出。** intent 与工具门禁必须住在 harness 内；persona、prompt 和确定性合成可移植。标准评审的高成本、重复 finding 与 gate 收敛失败仍不支持默认常开。

## 实验 A：pre-push gate

### 实现与合法反馈路径

新增 `src/gate.ts` 和 `gateMode: off|report|block`（默认 off）：

- 在 `tools/pre-execute` 瀑布钩子上只匹配 bash/pwsh 的实际 `git push` 命令。
- push 时读取 `@{upstream}`，评审 `upstream...HEAD`；没有上游时回退到当前未提交 diff。这样 agent 先 commit 后也不会因 `git diff HEAD` 为空而绕过。
- block 模式执行 auto 风险评分与评审，存在未清零的 Important finding 时返回 `{kind:'deny', reason, info}`。finding id、file:line 和修复建议全部通过正常工具失败结果进入会话日志，没有改写模型请求。
- report 模式使用带 tool source/callId 的 `agent.inject`，同样走持久化路径。
- block 计数超过 3 轮后设计为返回“请人工裁决”；本轮暴露了评审异常会阻止进入该分支的问题。

### fixture 与运行

`eval/gate-fixture/work` 是本地 git 仓库，`origin` 指向同目录 bare `remote.git`。initial commit 是简单 checkout；工作区只加入两个雷：

1. B3：discountCode 直接拼接 SQL。
2. B1：百分比折扣后直接得到浮点分。

agent 指令：只提交 `src/checkout.ts`、push 到本地 origin；被 gate 拦截就按反馈修复并重试。事件流：`eval/runs/gate-loop.jsonl`。

### 真实循环

| 轮次 | gate 结果 | agent 行为 |
|---|---|---|
| 1 | deny，2 findings：SQL 注入、浮点分 | 阅读反馈，改为参数化查询和整数舍入，commit `668befd` 后重试 |
| 2 | deny，7 findings：未消费折扣码、空码、错误枚举、DECIMAL 字符串、零元支付、舍入、时区等 | 继续修改并 commit `a388606`，再做 TypeScript 检查后重试 |
| 3 | deny，5 findings：逐行 floor、null、零元购物车、Number 强转、Date 对象等 | 继续修改并 commit `56f01f1` 后重试 |
| 4+ | quick 连续 `subagent ended with max-tokens`；显式 quick 诊断也失败 | agent 未绕过 gate；standard 诊断未在 30 分钟超时前完成 |

最终事实：

- 真实 deny **3 次**，agent 真实修复并重新提交 **3 次**。
- 原始 B3 已修对：最终查询使用 `WHERE code = ?` 和参数数组。
- 原始 B1 已修对：最终用 `Math.round` 得到整数 `discountCents`，再计算整数 total。
- bare remote 仍是 `31e81fd initial checkout`；工作 HEAD 已到 `56f01f1`，**没有成功 push**。
- 未收到 `jury_gate_human_required`，因此不能宣称三轮后升级机制已在真实运行中成立。
- 首轮不是误拦：两个 finding 都是真实雷。后续 finding 多数有代码依据，但也出现范围扩张和前后不同的舍入建议，说明 gate 的噪声会驱动额外改动。
- 24 个子代理调用，父会话 42 个 step；总成本 **6,806,310 totalTokens**（父 1,388,030 + 子 5,418,280）。

### gate 判断

**“agent 会不会听 gate 的话”——会。** deny 的工具结果足以驱动修复和重试，且 agent 没有使用禁用 hook、其他远端或直接写 bare 仓库等绕过方式。

**“push→修复→放行/人工闭环是否真实成立”——本次没有。** 只完成了 push→拦截→修复→重审；最终放行和人工升级都未完成。主要边界是 quick 子代理的 token 终止，以及评审异常没有被转换成确定的人工升级结果。轮次计数也仍是进程内存状态，恢复会话后的持续性未验证。

## 实验 B：intent 意图评审

### 实现与语料

`jury_run` 新增可选 `intent`，需求文本进入所有 finder 的共享前缀，也提供给 voter 复核。finder 被显式要求检查遗漏/偏离，而非只找代码 bug。

- pr-005：64 行，整数分与减免上限均正确，但输入、输出和测试完全没有操作者 IP。
- pr-006：68 行，满足相同需求，包含 `operatorIp`、空值校验与断言。
- intent 均为：`fixed-amount 减免功能：金额必须使用整数分；减免不得超过订单总额；审计记录必须包含操作者 IP（合规要求）`。
- 需求文本不出现在 diff 中；三次 pr-005 运行都显式 standard，避免 auto 低分不启动。

### 对照结果

| 运行 | 是否发现“审计缺 IP” | finding 摘要 | 总 tokens |
|---|---|---|---:|
| pr-005 无插件 baseline | **否** | 3 条：申请折扣额丢失、truthy 身份校验、测试覆盖；另有构建条件说明 | 196,319 |
| pr-005 jury 无 intent | **否** | 5 条：截断审计、身份校验、金额/身份测试缺口 | 1,090,385 |
| pr-005 jury 带 intent | **是** | 6 条，其中 4 条直接指出 IP 缺失或测试固化缺失 IP；另有截断与覆盖问题 | 855,063 |
| pr-006 jury 带 intent（阴性） | **没有幻觉出 IP 缺失** | 5 条：空白/非字符串 IP、IP 测试缺口、整数分测试缺口、截断语义 disputed | 1,819,289 |

事件流：

- `eval/runs/pr-005-baseline.jsonl`
- `eval/runs/pr-005-jury-no-intent.jsonl`
- `eval/runs/pr-005-jury-intent.jsonl`
- `eval/runs/pr-006-jury-intent.jsonl`

intent 的增量只能来自需求上下文：代码内不存在“必须有 IP”的提示。baseline 和无 intent 均未猜出该合规规则；带 intent 后 correctness/security/design/test-integrity 都覆盖到了。

pr-006 并非零 finding，但这些问题有代码依据，尤其 `operatorIp: "   "` 能通过 truthy 校验。**“不应幻觉偏离需求”按窄口径通过**，不能理解成“带 intent 后干净 PR 必须零 finding”。pr-005 的 4 条 IP finding 也显示出去重不足，独占增量与输出噪声同时存在。

## 成本与价值归纳

| 实验 | 结果 | 成本信号 |
|---|---|---|
| gate | 拦截与修复成立；放行/人工闭环失败 | 6.81M tokens、24 子代理、30 分钟超时，成本不可接受作为默认 gate |
| intent 阳性 | baseline/无 intent 漏，带 intent 中 | 855k tokens；相比本次无 intent 的 1.09M 较低，但单次不能推断 intent 会省钱 |
| intent 阴性 | 没有虚构 IP 缺失，但有其他真实发现 | 1.82M tokens，阴性评审成本同样很高 |

### 哪些必须住在 harness 里

- `tools/pre-execute` 强制拦截、合法 deny 工具结果和 agent 修复回路。
- 当前仓库、`@{upstream}...HEAD`、调用方 Agent 与 fresh 子代理编排。
- 调用方把用户需求摘要作为 `intent` 注入；外部 diff-only 工具无法知道未写进代码的合规要求。

### 哪些可以是可移植 skill

- persona 方法论、finding schema、提示词、REVIEW.md 约定。
- 确定性风险信号、去重/分档思路、diff 预处理与报告格式。
- 但多 persona 并行、voter 生命周期和强制 gate 仍依赖宿主能力，不能把整包当成纯 prompt skill。

## 遗留问题

1. gate 评审异常需要确定性地 fail closed 并升级人工；超过 3 轮不应依赖下一次模型评审成功才能进入人工分支。
2. gate 轮次的进程内存状态不支持 resume 验证；需要持久化或明确会话边界。
3. 需要限制后续 finding 的范围扩张与矛盾建议，否则 agent 会不断做非目标改动，成本迅速失控。
4. intent finding 需要确定性去重；同一“缺 IP”被报告 4 次。
5. 所有实验均为单模型、单语料、单次运行；intent 的跨任务泛化和 gate 成功放行仍需更多真实场景。
