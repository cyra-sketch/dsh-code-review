# EVAL-002：真实 dsh 插件端到端验证

> 日期：2026-10-28 ｜ 状态：**真实运行成功**（不是 mock / 不是仅编译）

## 1. 环境与运行方式

- dsh：`0.2.1-rc.2`（通过项目内独立 npm cache 执行 `npx @deepseek-ai/dsh`，未全局安装）
- profile：`jury-eval`，由随附 `headless` profile 派生
- 插件安装：`dsh plugin --profile jury-eval add /Users/cyra/Documents/Codex/Projects/dsh-jury`，本地 linked bundle
- 模型：`deepseek-account/deepseek-flash`，reasoning effort `high`；4 个 finder 与 voter 均继承同一宿主模型
- 凭证：由 dsh 现有 credentials/account 服务读取；评测过程未读取或打印凭证文件
- 评审入口：headless 中真实调用 `jury_run`，`path=eval/corpus/pr-001/pr-001.diff`，`tier=standard`

核心运行命令：

```sh
npm_config_cache=$PWD/.npm-cache DSH_TELEMETRY_DISABLED=1 \
  npx --yes @deepseek-ai/dsh --profile jury-eval \
  --patch eval/headless.patch.yml --json \
  "调用 jury_run 工具一次，参数 path=$PWD/eval/corpus/pr-001/pr-001.diff，tier=standard。工具完成后，请原样输出 report，不要自行增删评审结论。"
```

权威证据：

- `eval/runs/pr-001.jsonl`：headless JSON 事件流，`jury_run` 的 `tool_result.status=completed`，最终 `reason.kind=completed`
- `eval/runs/pr-001-usage.txt`：父会话及 5 个子会话的真实 usage 汇总
- `.dsh/jury/findings.jsonl`：插件写入的 12 条 append-only open findings，含 id、runId、时间戳和 voter 证据
- 成功运行 runId：`a025e4e5-d089-4eb9-9771-348f14ac61cf`

## 2. 编译与打包

以下命令均通过：

```sh
npm run typecheck   # tsc --strict，含 noUncheckedIndexedAccess / exactOptionalPropertyTypes
npm run build
npm pack --dry-run --json
```

bundle 干跑包含 `lib/`、`cordis.patch.yml`、README 与 package manifest，共 11 个文件。

## 3. 实际输出摘要

报告首行：

```text
评审结果：12 项（consensus 7 / disputed 1 / solo 4；Important 12 / Nit 0 / Pre-existing 0；已过滤 0）
```

| # | finding 摘要 | GT 映射 | voter / 分档 |
|---|---|---|---|
| 1 | discount code 拼接 SQL，存在注入 | B3 | valid / consensus |
| 2 | 浮点折扣产生非整数分 | B1 | valid / consensus |
| 3 | 支付成功前扣使用次数；同条还指出并发超用 | B5 | valid / consensus |
| 4 | `usedCount > maxUses` off-by-one | B2 | valid / consensus |
| 5 | audit 记录了实际未应用的 code | 雷外有效 | valid / consensus |
| 6 | 可选 `txId` 被非空断言，可能丢 audit | 雷外有效 | valid / solo |
| 7 | 过期测试被 `it.skip` 禁用且 mock 不一致 | B8 | valid / consensus |
| 8 | 未校验 `ownerId` / tenant scope | B4 | uncertain / disputed |
| 9 | 支付前扣使用次数 | B5，**重复** | valid / solo |
| 10 | audit 异常仅 log 后吞掉 | B6 | valid / consensus |
| 11 | 测试断言固化 `2697.3` 浮点分 | B7 | valid / solo |
| 12 | DB mock 不区分请求的 code | 雷外有效 | valid / solo |

## 4. 计分

| 指标 | 结果 |
|---|---|
| Ground truth 召回 | **8/8**（B1–B8 全部语义命中） |
| 误报 | **0**；3 条独立的雷外 finding 均成立，另有并发竞态附在 B5 finding 中 |
| 重复 finding | **1 条**：B5 出现 #3/#9 两次；不计作误报，但属于合成缺陷 |
| finder 原始候选数 | **24**（按台账各组 finders 数求和）；确定性去重后进入 voter 的候选为 12 条 |
| voter | 11 valid、1 uncertain、0 invalid；B4 未被否决，保留为 disputed |
| file:line 证据 | **12/12 = 100%**；voter evidence 也是 12/12 |
| 子代理调用 | **5 次**：4 finder 并行 + 1 次批量 voter；另有 1 个父 agent 调用工具并返回报告 |

### 实际 token 用量

从本次父会话和 5 个子会话的 `assistant/message.usage` 求和：

| 类型 | tokens |
|---|---:|
| 非缓存输入 | 85,956 |
| 输出（含推理） | 127,409 |
| 缓存读取 | 608,640 |
| 缓存写入 | 0 |
| `totalTokens` 合计 | **822,005** |

`totalTokens` 包含缓存读取，不等于同价计费 token；本次未换算金额。用量高于 EVAL-001 的直觉预期，说明批量 voter 虽然把 19 次子代理调用降为 5 次，但并不自动等于低 token 成本。

## 5. 与 EVAL-001 的差异

- 召回同为 **8/8**，误报同为 **0**；本次证明机制可在真实 dsh 原生 `spawn` 子代理中运行。
- voter 从 14 次独立调用改为 **1 次批量调用**，完整评审为 5 个子代理调用，达到 P0 的调用次数目标。
- EVAL-001 的 B4 为 valid；本次批量 voter 判为 uncertain，因此报告为 disputed。这是更保守的复核结果，不影响埋雷语义召回。
- 本次出现 1 个 B5 重复：两个 finder 对同一问题选择了不同 `line_quote`，严格按 `file + line_quote` 归一化无法合并。报告计数因此高于去重后的语义问题数。
- 本次有完整 token 账单；EVAL-001 只记录调用次数，不能直接比较总 token 增减。

## 6. 实跑暴露并已修复的问题

1. **本机 API 基线低于 master 文档**：`ObjectJsonSchema` 在 rc.2 从 `dsh-tools` 导出，JSON Schema 子集不支持这里使用的 `minimum`；已按真实 rc.2 类型修正并 strict 编译。
2. **可选模型配置物化**：rc.2 会把缺省嵌套 `voterModel` 变成 `{}`，导致 required provider 校验失败；已按可运行模板显式默认 `undefined`。
3. **子代理深度语义**：最初传 `maxDepth: 0`，导致 `subagent depth 1 exceeds maxDepth 0`，finder 全部无法启动；改为绝对上限 `1`，允许本层 finder/voter 且禁止继续派生。
4. **宿主工具链/路由**：共享 npx 缓存曾损坏且 dsh plugin 需要 pnpm，改用项目内干净 cache 与一次性 pnpm；headless 默认 `deepseek-official` 不命中现有账户，评测 patch 改为用户已有的 `deepseek-account` 路由并启用宿主凭证服务。

## 7. 未覆盖与遗留问题

- 本次端到端入口是 `jury_run`；`/jury` 已注册并通过类型检查，但未在交互式 UI 单独点击验证。
- 未端到端覆盖 `quick`、`base`、默认 `git diff HEAD`、REVIEW.md 注入及空 diff 的“无需修改”分支。
- `maxRounds` 按 P0 仅保留配置，固定单轮；未验证多轮收敛。
- 去重键需要后续增强：在保持“无 LLM 合并”的前提下，可加入规范化代码行号/语义指纹，避免 B5 这种同问题不同引用的重复。
- 批量 voter 的降噪仍未被充分考验：本次 0 invalid，需要噪声 finder / clean PR 语料继续测误报过滤。
- 单 PR、单模型、合成埋雷的局限与 EVAL-001 相同；跨模型增量仍未验证。
