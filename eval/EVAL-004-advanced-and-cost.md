# EVAL-004：高级埋雷、成本优化与确定性风险门控

> 日期：2026-10-28 ｜ 全部为真实 dsh headless 运行；模型 `deepseek-account/deepseek-flash`、reasoning high。baseline 禁用 jury；quick/auto 使用本轮最终插件。未读取凭证、未 commit。

## 1. 本轮实现

- `src/prompts.ts`：finder 的共享规则、REVIEW.md、diff 全文位于所有 persona 相同前缀；persona 和档位指令移到末尾。quick 明确检查测试、错误语义、舍入与静默默认回退。
- `src/jury.ts`：quick = 2 finder（correctness/security）+ 1 voter；standard = 4 + 1；deep = 4 + 2 个 fresh-context voter。quick 子代理 `maxTokens=24000`。
- `src/diff.ts`：超过 800 行才按文件/hunk 预处理，过滤纯 import 与纯格式变化。
- `src/risk.ts`：零模型风险评分。低分 none、中分 quick、高分 standard、更高分 deep；显式 quick/standard/deep 覆盖 auto。
- 报告第二行始终包含最终档位、auto/显式覆盖、评分和命中信号；台账追加 riskScore/riskLevel/effectiveTier。
- deep 双 voter 都判 invalid 才过滤；其他分歧保留为 disputed。

## 2. pr-003 高级语料与 A/B

语料：`eval/corpus/pr-003/pr-003.diff`，152 行、3 个 TS 文件；`eval/gt/pr-003.gt.json` 含 7 雷：

- C1 UTC 午夜与本地日历日冲突
- C2 逐 item 与整单舍入不一致
- C3 未 await 的次数预占
- C4 过期/null 合并后静默原价扣款
- C5 reserve 后缓存不失效，且缓存键缺 userId
- C6 `res.total.toBeUndefined()` 空断言
- C7 owner 条件反转，非 owner 可用且被测试数据掩盖

### 质量对照

| 运行 | 召回 | finding | 误报 | file:line |
|---|---:|---:|---:|---:|
| 无插件 baseline | **6/7** | 12 | 0 | 12/12 = 100% |
| 优化前 standard | **7/7** | 14 | 0 | 14/14 = 100% |
| 优化后 quick | **7/7** | 10 | 0 | 10/10 = 100% |
| 优化后 auto → standard | **7/7** | 16 | 0 | 16/16 = 100% |

baseline 漏 C7；jury 的缓存/owner finding 覆盖了“非 owner 被接受、owner 检查方向错误”的语义。pr-003 上评审团相对单审的真实增量为 **+1 个高级雷（6/7→7/7）**，quick 没丢掉这一增量。

事件流：

- `eval/runs/pr-003-baseline.jsonl`
- `eval/runs/pr-003-jury-before.jsonl`
- `eval/runs/pr-003-jury-quick.jsonl`
- `eval/runs/pr-003-jury-auto.jsonl`

## 3. pr-001 复测

| 运行 | 召回 | finding | 误报 | file:line |
|---|---:|---:|---:|---:|
| 无插件 baseline | 8/8 | 15 | 1 | 15/15 = 100% |
| 优化前 standard | 8/8 | 12 | 0 | 12/12 = 100% |
| 优化后 quick | **7/8** | 9 | 0 | 9/9 = 100% |
| 优化后 auto → standard | 8/8 | 14 | 0 | 14/14 = 100% |

quick 漏 B6（audit 吞异常）；B4 最终保留为 disputed，没有被 voter 误杀。auto 高风险 standard 保持 8/8。

## 4. token 成本

所有用量由父会话 `assistant/message.usage` 与父日志 `subagent/catalog` 指向的子会话分别求和。`totalTokens` 包含 cacheRead，不是同价计费 token。

| PR / 运行 | 父会话 | 子会话 | 总计 | 相对 baseline | 相对优化前 standard |
|---|---:|---:|---:|---:|---:|
| pr-001 baseline | 59,303 | 0 | 59,303 | 1.00× | — |
| pr-001 优化前 standard | 22,666 | 799,339 | 822,005 | 13.86× | 1.00× |
| pr-001 quick | 20,611 | 51,853 | **72,464** | **1.22×** | **-91.2%** |
| pr-001 auto/standard | 23,003 | 1,328,727 | 1,351,730 | 22.79× | +64.4% |
| pr-003 baseline | 27,456 | 0 | 27,456 | 1.00× | — |
| pr-003 优化前 standard | 23,524 | 407,269 | 430,793 | 15.69× | 1.00× |
| pr-003 quick | 20,815 | 68,982 | **89,797** | **3.27×** | **-79.2%** |
| pr-003 auto/standard | 24,208 | 988,971 | 1,013,179 | 36.90× | +135.2% |

### quick 目标判定

目标为“≤ baseline 3 倍且召回不掉”。

| PR | 成本目标 | 召回目标 | 综合 |
|---|---|---|---|
| pr-001 | **通过**：1.22× ≤ 3× | **失败**：7/8，优化前 8/8 | 未全部达成 |
| pr-003 | **失败**：3.27× > 3× | **通过**：7/7 | 未全部达成 |

因此不能宣称 quick 已满足整体目标。它确实把优化前 standard 成本降低了约 80–91%，但成本/召回约束在两个 PR 上各有一项未达。

### 缓存读取变化

共享前缀使 standard 的 cacheRead 占比提高，但总 token 没有下降：

| PR | 优化前 cacheRead / 占比 | 优化后 auto cacheRead / 占比 | 总 token 变化 |
|---|---:|---:|---:|
| pr-001 | 608,640 / 74.0% | 1,176,576 / 87.0% | +64.4% |
| pr-003 | 263,296 / 61.1% | 823,040 / 81.2% | +135.2% |

这证明前缀缓存命中机会增加，但也证明“更多 cacheRead”不等于“更少总 token”。本轮没有换算金额；实际账单收益取决于缓存价格，而 quick 的总 token 降低来自更少 finder、无工具指令和输出约束。

## 5. 风险门控

评分规则实测（`src/risk.ts` 零模型直接执行）：

| PR | 分数与主要信号 | 自动档位 | 人工预期 | 结果 |
|---|---|---|---|---|
| pr-001 | 9：68 行、2 文件、DB/支付调用、测试断言、owner/token | high / standard | 高危支付 PR | 符合；真实 auto 运行 8/8 |
| pr-002 | 11：114 行、2 文件、DB/支付调用、测试断言、owner/token | high / standard | 高危支付 PR | 符合；直接评分验证 |
| pr-003 | 11：125 行、3 文件、DB/支付调用、测试断言、owner/token | high / standard | 高危支付 PR | 符合；真实 auto 运行 7/7 |
| pr-004 | 3：48 行、2 文件、测试断言；无外部调用/权限信号 | low / **none** | 低危纯函数小 PR | 符合；真实 auto 未启动子代理 |

pr-004 的成本证据：

- 优化前 standard：父 17,746 + 子 306,528 = 324,274 tokens，输出“无需修改”，0 finding、0 误报，voter 过滤 1 条候选。
- 优化后 auto：父 **17,799** + 子 **0** = **17,799 tokens**，3 分 low/none；相对显式 standard 少 **94.5%**。
- pr-004 事件流：`pr-004-jury-before.jsonl`、`pr-004-jury-auto.jsonl`。

auto 不启动意味着没有评审，而不是“评审团确认无 bug”；报告目前使用统一的“无需修改”文案，这是后续需要区分的语义边界。

## 6. diff 预处理与 deep 验证边界

- 合成 821 行 diff 的零模型 smoke：`originalLines=821`、`processedLines=5`、`omittedHunks=2`，纯 import 与格式 hunk 均被移除，实质 hunk 保留。
- 本轮真实 PR 均小于 800 行，因此未做真实长 diff 模型评审；过滤逻辑可能误删只有上下文才能理解的 hunk，后续需要长 PR 回归。
- deep 的 4 finder + 双 voter 已通过 strict 类型检查，但本轮未花成本做 deep 端到端运行；双 voter 合成路径仍缺真实验证。

## 7. 迭代失败与波动（不隐藏）

1. quick 初始 `maxTokens=12000` 时，pr-001/pr-003 都以 `subagent ended with max-tokens` 结束，无报告；保留 `*-quick-12k-error.jsonl`。调整为 24000 后才能运行。
2. 第一次成功 quick：pr-001 6/8、pr-003 6/7；补测试/错误语义检查后分别为 7/8、5/7；最终通用规则补强后为 7/8、7/7。
3. pr-001 第二次 quick 中，B4 被 voter 判 invalid：voter 把“修复建议中的 ownerId===userId 不准确”误当成“授权缺失不存在”。最终 voter 指令要求对可见授权风险用 uncertain 而非 invalid，最终 B4 为 disputed。
4. 多次 quick 结果波动说明单次最终值不是稳定召回率；本报告给的是指定事件流的真实结果，不是 best-of-N 上界或统计均值。

## 8. 结论与遗留问题

- **高级题增量成立但幅度有限**：pr-003 单审 6/7、评审团 7/7；这是本轮最重要的正向证据。pr-001 则仍无召回增量。
- **quick 是有效降本方向，但未达完整目标**：standard 成本下降 79–91%；pr-001 掉 1 雷，pr-003 成本略高于 3×baseline。
- **缓存前缀不是总 token 优化**：cacheRead 占比提升，standard 总 token 反而增加，必须分开报告缓存与总量。
- **门控分类符合四个人工预期**：高危支付 PR 自动 standard，低危纯函数 PR 不启动；pr-004 节省 94.5% 的显式 standard 成本。
- 单 PR 单跑一次的结果不能泛化；需要重复运行估计 quick 的召回方差，并扩充分数处于 quick/deep 边界的真实 PR。
- low/none 的报告措辞、deep 实跑、800+ 行真实语料、去重与重叠 finding 仍是后续工作。
