# R4 缺陷台账

## BUG-R4-001：pre-push gate 把“尚未 push”冻结为代码 finding

- 症状：自动 intent 包含交付步骤时，reviewer 报告 `Required push ... never completed` / `提交未 push`，验收无法通过修码清零，最终误升级人工。
- 最小触发：首条用户消息同时包含代码需求和“push 到本地 origin/main”，gate 在实际 push 前评审 `upstream...HEAD`。
- 已复现：`eval/acceptance/reopen/accepted.jsonl` 首轮第三条 finding；`eval/acceptance/intent-missing-pre-fix/run.jsonl` 三轮仅剩该 finding。
- 期望：intent 只约束代码行为；提交、stage、push、remote 和 gate 反馈步骤不得成为 finding。
- 根因：`src/prompts.ts` 把完整会话需求无差别描述为 implementation requirements，没有排除工作流指令或当前中间状态。
- 不得复发：pre-push 评审不得把尚未发生的交付操作报告为代码缺陷，也不得因此阻断干净实现。
- 修复与证据：`src/prompts.ts` 明确忽略工作流指令；`eval/acceptance/intent-missing` 干净重跑自动冻结 SQL 与 operator IP 两项，无 push finding，round 3 accepted；组合机器断言通过。

## BUG-R4-002：acceptance 准备脚本重复执行会改写 low fixture

- 症状：第二次运行 `eval/acceptance/prepare.sh` 时，checkout 场景会跳过，low 场景却重新复制、提交并初始化 bare remote，随后因 origin 已存在而失败。
- 期望：所有 fixture 在 work 目录存在时都保持不变，准备脚本可安全重复运行。
- 现场：误改写保留在 `eval/acceptance/low/work-prepare-accident`；原 bare main 未推进。
- 修复与证据：low 分支增加存在性保护；连续两次运行准备脚本并检查 fixture HEAD 不变。

## BUG-R4-003：未提出需求被误解为禁止对应实现

- 症状：intent-negative 明确“没有附加审计或合规需求”，reviewer 却报告 `Unrequested audit/compliance subsystem added`，把需求未提及虚构为需求偏离。
- 期望：只有与明确需求矛盾或缺少明确要求时才报 intent finding；未提及的可选功能本身不是偏离。
- 边界：同次报告的“支付成功后审计写入失败”有代码依据，不得为通过负面对照而过滤。
- 修复与证据：`src/prompts.ts` 明确未提及不等于禁止；`eval/acceptance/intent-negative` 干净重跑只保留真实审计失败 finding，无虚构偏离，未验收 HEAD 被阻断；组合机器断言通过。

## BUG-R4-004：冻结项清零但整数分需求未满足仍 accepted

- 症状：`eval/acceptance/intent-missing-accepted-unmet/run.jsonl:189-202` 中 gate round 3 accepted、push 成功，但最终 `total = total * (1 - percentOff / 100)` 仍产生小数分；333 分订单九折为 299.7。
- 根因 A：single discovery 收到包含整数分/减免封顶/审计 IP 的完整首条用户消息，却只冻结 SQL 与审计 IP 两项，漏报浮点分，属于 discovery 召回缺口。
- 根因 B：episode 没有独立的需求条款状态，验收只核对冻结 findings，未逐条复核 intent，因此冻结集合外的明确需求违约不影响 accepted。
- 不得复发：discovery 与验收必须逐条报告 intent 条款 met/unmet/unknown；accepted 必须同时满足冻结 findings 清零且无 unmet 条款。
- 回归要求：新 intent-missing fixture 首次必须因浮点分条款被拦截，修复整数分后才可 accepted；若 reviewer 仍漏浮点 finding，条款 unmet 也必须独立阻断。
- 修复与证据：`src/intent-clauses.ts` 确定性拆分并稳定编号；`src/jury.ts` discovery 返回逐条状态，`src/gate.ts` 验收独立复核并以 canAccept 联合判定。全新 `eval/acceptance/intent-missing` 首轮浮点 finding+unmet 阻断，round 2 全 fixed/全 met 后 accepted；20 项机器断言通过。

## BUG-R4-005：自动 intent 诱导 reviewer 递归 jury_run 并产生报告伪条款

- 症状：已认证独立 profile 首次 `jury_run` 调用中，reviewer 遵循首条消息里的“调用 jury_run”而递归执行，触发 `subagent depth 2 exceeds maxDepth 1`；“原样返回报告”“不要修改任何文件”还被拆成 unknown 条款。
- 根因：条款提取只过滤了 git/gate 工作流，未覆盖 jury_run/报告返回/禁止改码指令；finder prompt 的原始 intent 也未声明这些指令不可执行。
- 不得复发：jury_run 与报告交付指令不得成为条款，也不得诱导 reviewer 递归调用；无代码需求时应返回空条款并直接评审 diff。
- 修复与证据：`src/intent-clauses.ts` 与 `src/prompts.ts` 增加 jury_run/报告工作流过滤；重新打包更新 `jury-r4-e2e` 后，`eval/e2e-auth/jury-call.jsonl` 真实返回 single 报告，无递归/伪条款；E2E 5 项断言通过。

## BUG-R4-006：同一 Bash 串联 commit+push 时 gate 验收旧 HEAD

- 症状：`eval/e2e-auth/gate-push-chained.jsonl` 使用 `git commit && git push`，pre-execute 在整条命令开始前取 HEAD，episode accepted 的 headSha 是前序提交而非最终 push 的提交。
- 根因：工具前置钩子无法看到同一 Bash 调用中尚未执行的 commit；当前命令匹配虽覆盖串联 push，但不能保证 exact-HEAD 语义。
- 修复：`src/gate.ts` 按 shell 操作符分段并识别真实 git 子命令；push 与 commit/merge/rebase/amend/reset/cherry-pick/revert/checkout/switch/pull 等 HEAD 变更命令串联时，在任何评审前返回 `HEAD_MUTATION_CHAIN`，提示“请分步执行：先提交，再单独 push”。block deny，report 注入同一告警，runner 不执行。
- cd 处理：`cd repo && git push` 允许，gate 的 diff、episode、HEAD 与 runner 统一使用解析后的 repo。
- 状态：**已修复（零模型）**。`node eval/acceptance/gate-command-assert.mjs` 为 **21 passed / 0 failed**，覆盖 block/report、普通 push、cd、换行与多种变更命令；`node eval/acceptance/assert.mjs` 20/20，typecheck/build 通过。结果见 `eval/acceptance/gate-command-assert-results.json`。

