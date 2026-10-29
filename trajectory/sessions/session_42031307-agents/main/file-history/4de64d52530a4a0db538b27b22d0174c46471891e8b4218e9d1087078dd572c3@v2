# EVAL-006：发现与验收分离后的 gate 收敛验证

> 日期：2026-10-28 ｜ 全部真实 dsh headless 运行；仅使用本地 git/bare remote。未读取凭证、未对项目仓库 commit。上一轮对照：3 次 deny 后 quick 失控，24 子代理、6,806,310 tokens、未 push 也未升级人工。

## 1. 四个改动

### 发现与验收分离

- `src/gate.ts`：每个 `baseSha` 对应一个 episode。首轮 auto 评审后冻结 F，后续不再运行 finder/voter，只启动一个轻量 acceptance 子代理。
- acceptance 输入只有 F 和新 diff，只允许返回 F 内 id 的 fixed/open 映射；插件侧也过滤所有 F 之外的输出，从机制和 prompt 两层禁止新增 finding。
- `src/gate-episode.ts`：`gate-episodes.jsonl` append-only 快照，持久化 episodeId、baseSha、round、子代理调用数、finding id/file:line/severity/fix/status，而不是进程内存计数。
- round 或 `maxSubagentsPerEpisode` 到顶后直接确定性“请人工裁决”；评审/验收异常也 fail closed，不再把 max-tokens 原样交给 agent 循环。
- `agentMaxTokens` 默认 24000 且应用于每个子代理；quick 每 finder 最多 5 条非 nit finding；episode 默认最多 10 个子代理。
- gate 反馈区分 `discovery` 与 `verification`，台账保留 open→fixed 状态迁移和 remaining 数。

### 确定性去重

- finding schema 新增 `symbol` 和 `category`；intent 偏离统一归为 `intent`。
- 近重复键改为规范化 `file + symbol + category`，symbol 去掉类名前缀和括号；同键合并 finders，保留 file:line/line_quote/detail 更完整的一条，ID 稳定。
- 不再使用不同 `line_quote` 作为拆分 finding 的依据。

### low/none 与报告

- auto 判 none 时输出“未启动评审（低风险）”，不再混用“无需修改”。
- gate 验收反馈只列 F 中未清零项；成功验收的 episode 快照明确显示所有 finding 为 fixed。

## 2. gate 首次完整闭环

场景：`eval/gate-fixture/convergence/work`，新 base `4a327bd`，工作区仍只有 SQL 注入和浮点分两雷。事件流：`eval/runs/gate-convergence.jsonl`；台账：`work/.dsh/jury/gate-episodes.jsonl`。

| 轮次 | 模式与子代理 | 结果 |
|---|---|---|
| 1 discovery | quick，2 finder + 1 voter = 3 | 冻结 F，push deny；agent 仅修改 SQL 参数化与金额取整 |
| 2 verification | 1 个 acceptance | F 中 4/4 全部 fixed；无新增 finding；push 放行 |

- bare `origin/main` 已从 `4a327bd` 推进到 `b9284f3`，与本地 HEAD 一致；这是此前未实现的**真实 push 成功**。
- 原始两雷均修对：`WHERE code = $1` + 参数数组；`Math.round` 后得到整数分。
- episode 总子代理 **4 次**，没有第三轮。
- 首轮 F 为 4 条（两类问题各重复 2 条），原因是 `CheckoutService.checkout` 与 `checkout` 当时未归一；随后已补 symbol 归一并由 standard 复测。验收阶段没有范围扩张，所有状态只在 F 内迁移。
- 总 token **280,986**（父 230,238 + 子 50,748），低于 100 万目标；较上轮 6,806,310 降低 **95.87%**，子代理从 24 降至 4。

结论：**gate 首次实现完整闭环：发现→冻结→修复→纯验收→放行。**

## 3. 确定性人工升级

使用独立 `eval/gate-fixture/human/work` 和 `maxRounds: 1`，避免依赖 agent 修不好这一随机行为。

- 首轮 quick 仍只调用 3 个发现子代理，得到 2 个冻结 finding。
- round=1 达到上限后立即返回 `jury_gate_human_required` 和“请人工裁决”，附两条未清零 finding。
- 没有 acceptance 或其他后续子代理；episode `status=human`。
- agent 按要求停止，未修复、未重试；bare remote 未推进。
- 总 token **141,596**（父 96,734 + 子 44,862）。

事件流：`eval/runs/gate-human.jsonl`。这证明到顶升级是确定性控制流，不依赖下一次模型评审成功。

## 4. quick 三次稳定性

同一 pr-001、同一 deepseek-flash/high、quick=2 finder+1 voter，三次均成功出报告，**没有 max-tokens 截断**。

| 次数 | 召回 | finding | 总 tokens |
|---|---:|---:|---:|
| 1 | 4/8 | 5 | 73,876 |
| 2 | 6/8 | 6 | 99,877 |
| 3 | 7/8 | 7 | 71,509 |
| 均值 | **5.67/8** | 6 | **81,754** |

24k 与最多 5 条输出解决了“无法完成”的稳定性问题，但没有解决召回波动；不能把 quick 描述为稳定满召回。事件流为 `pr-001-quick-stability-{1,2,3}.jsonl`。

## 5. 去重与 none 复测

### pr-001 standard

`eval/runs/pr-001-standard-dedup.jsonl`：13 findings，B5“支付前扣次数”只保留 **1 条**，不再出现上轮的两条不同 line_quote 重复。总 token 631,324。

### pr-005 带 intent

`eval/runs/pr-005-intent-dedup.jsonl`：3 findings，IP 合规遗漏只保留 **1 条主 finding**，finders 列表合并 correctness/security/design/test-integrity，不再 4 连发。总 token 216,786。

### pr-004 auto none

`eval/runs/pr-004-auto-none-eval006.jsonl` 实际输出：

```text
评审档位：none（自动门控；风险评分 3；...）
未启动评审（低风险）
```

## 6. 成本对照与最终判断

| 场景 | 上轮 | 本轮 | 变化 |
|---|---:|---:|---|
| gate 子代理 | 24 | **4** | -83.3% |
| gate totalTokens | 6,806,310 | **280,986** | **-95.87%** |
| gate 结果 | 无 push、无人工 | **第 2 轮 push 成功** | 完整闭环 |
| 人工路径 | 未到达 | maxRounds=1 确定性到达，3 子代理 | 已验证 |
| quick 截断 | 反复 max-tokens | 3/3 均完成 | 已消除 |

本轮证明“发现与验收分离”是 gate 收敛的关键，而不是继续调 prompt。冻结 finding 集消除了范围扩张，持久化轮次/预算消除了无限循环，轻量验收把成本降了一个数量级以上。

## 7. 遗留问题

- quick 召回仍有 4/8、6/8、7/8 的显著波动；输出上限稳定不等于质量稳定。
- 近重复键仍可能漏掉跨 category 或跨 symbol 的同一语义问题；standard 中其他测试建议仍有重叠。
- gate 本轮首轮也暴露了 symbol 归一前的重复；后续复测证明修复有效，但更多复杂命名形式仍需覆盖。
- report 模式、resume 后读取既有 episode、maxSubagentsPerEpisode 独立熔断尚未分别实跑；maxRounds 路径已验证。
- 验收只有 fixed/open，dismissed 状态已建模但未使用；人工如何 dismissed 及后续产品流程仍待设计。
