# EVAL-008：R2 预算约束版决胜实验

> **勘误：先读 `eval/ERRATA-001.md`。** pr-008/009 baseline 存在 fix.patch/GT 答案泄漏，≥15% 通过线在 baseline 96.43% 时数学不可达，且旧数据混用破坏严格对照。R2 的“召回线失败/证伪”降级为“未证明评审团增量”。以下原文仅作历史记录。

> 日期：2026-10-29 ｜ 协议：`eval/PROTOCOL-R2.md`（运行前冻结）。预算账：`eval/budget-R2.md`。未读取凭证、未对项目仓库 commit。除既有 pr-003/pr-007 数据外，全部为本轮真实 headless 运行。

## 1. 总结论

**预注册整体通过线：失败。** 默认 jury standard 的召回与产品价值主张未获证明，不能移动球门柱。

- 召回线失败：平均相对提升只有 **3.71%**，要求 ≥15%；只有 **1/4** PR 严格多于 baseline，要求至少 2/4。
- 完成率、误报、经济边际成本和 gate 行为回归通过。
- 另有一项独立协议约束失败：总运行次数 **11 次 > 预注册 10 次**。原因是 exact-HEAD 首次放行失败后进行了修复复测；成本未超支，但次数上限确实被违反。
- 本轮实际模型成本 **$0.411649434**，低于 $1.00，剩余 $0.588350566。

价值判断：默认 standard 降级为可选引擎；gate+intent 和 exact-HEAD 的机制价值保留，但不能借 gate 的成功反推 diff-only 评审团有普遍召回或经济优势。

## 2. standard 截断修复

静态根因：pr-007 的 `jury-security` finder 第二次请求恰好输出 24,000 tokens 后以 `max-tokens` 终止，voter 当时尚未启动，不是批量 voter 截断。

实现并已通过 strict/build：

- quick 默认 `agentMaxTokens=24000`；standard/deep 新增 `standardMaxTokens=32768`。
- 所有 finder 每 persona 最多 5 条非 nit finding，detail≤200 字符。
- voter 超过 8 条自动分批并行，reason≤80 字符；分批后的所有 votes 都参与合成，不再只取前两批。
- `JuryResult.subagentCalls` 记录真实 finder+voter 数，gate 的 episode 预算不再按固定档位数估算。

pr-007 standard 复跑成功出报告：12 findings，4 finder + 2 个分批 voter，共 6 子代理，未截断。

## 3. 召回与误报（协调者人工盲裁）

当前工具环境没有独立 explore 子代理可用，因此本节是**协调者人工盲裁**，不冒充独立子代理。GT 在评审结束后才用于计分。

| PR | baseline 召回 | standard 召回 | 增量 | standard finding/误报/file:line |
|---|---:|---:|---:|---:|
| pr-003（既有） | 6/7 | 7/7 | **+1** | 14 / 0 / 14 |
| pr-007 | 6/6 | 6/6 | 0 | 12 / 0 / 12 |
| pr-008 | 1/1 | 1/1 | 0 | 6 / 0 / 6 |
| pr-009 | 1/1 | 1/1 | 0 | 2 / 0 / 2 |
| 平均召回率 | 96.43% | 100% | +3.71% 相对 | 34 / 0 / 34 |

- pr-007：standard 覆盖全部 6 雷，新增 finding 包括重试预算、4xx、租约、退避、幂等键和 jitter；无代码外误报。
- pr-008：双臂都命中真实负数进位/丢符号 bug；standard 的 locale、signDisplay、公开 API 和测试发现也有代码依据。
- pr-009：双臂都命中数组隐式字符串/字典序比较错误；standard 另指出测试缺少数量级反例。
- 证据率：**34/34 = 100%**；误报率：**0/34 = 0%**。
- A/A 噪声带：pr-007 baseline 两次均为 **6/6**，没有召回波动；第二次成本 $0.016822908。

## 4. 美元成本收益

谷时价格：input $0.15/M、cacheRead $0.003/M、output $0.60/M。pr-003 使用既有 usage，其余为本轮真实父子会话 usage。

| PR | baseline 美元 | standard 美元 | standard 增量召回 | 增量边际成本 |
|---|---:|---:|---:|---:|
| pr-003 | $0.005825856 | $0.067201038 | +1 | **$0.061375182/雷** |
| pr-007 | $0.015630828 | $0.065318478 | 0 | 不计算 |
| pr-008 | $0.017301762 | $0.147829092 | 0 | 不计算 |
| pr-009 | $0.012262686 | $0.059691414 | 0 | 不计算 |

只有 pr-003 有正增量，因此边际成本中位数就是 **$0.061375182**，通过 ≤$0.15/雷的预注册线。可是其他三个 PR 都没有增量，且 pr-008 standard 单次成本约为 baseline 的 8.5 倍，不能据此宣称普遍经济优势。

### gate 与回归成本

| 场景 | 美元 |
|---|---:|
| gate+intent | $0.026193276 |
| exact-HEAD 首次 accepted | $0.017230590 |
| exact-HEAD 改 HEAD，首次放行失败 | $0.023516202 |
| exact-HEAD 修复后首次 accepted | $0.011620482 |
| exact-HEAD 修复后重新验收 | $0.013862544 |

合计回归成本 $0.092422596，已包含在总成本 $0.411649434 内。

## 5. 预注册通过线逐条判定

| 通过线 | 结果 | 证据 |
|---|---|---|
| 平均召回相对 baseline ≥15% | **失败** | 96.43%→100%，相对 +3.71% |
| 至少 2/4 PR 严格多于 baseline | **失败** | 只有 pr-003，1/4 |
| standard 完成率 ≥90% | **通过** | 本轮 pr-007/008/009 全部 3/3 出报告，100% |
| 误报率 ≤10% | **通过** | 0/34 = 0% |
| 增量边际成本中位数 ≤$0.15/雷 | **通过** | 唯一正增量 pr-003 为 $0.061375182 |
| gate+intent 与 exact-HEAD 回归 | **通过（修复后）** | intent 冻结项含 operatorIp；新 HEAD 复用原 F 并拦截，最终修复 push 成功 |
| 总成本 ≤$1.00 | **通过** | $0.411649434 |
| 总运行次数 ≤10 | **失败** | 实际 11 次 |

## 6. gate 回归细节

### gate+intent

`eval/runs/r2-gate-intent.jsonl`：首轮冻结 SQL 注入、浮点分和 **No audit record/operator IP** 三项，证明 `gateIntent` 已进入 finder。agent 增加 operatorId/operatorIp 校验及审计写入后，第二轮全部 fixed，`origin/main` 推进到 `502260d`。

### exact-HEAD

首次回归失败暴露真实 bug：upstream 前进后，旧实现按新 baseSha 新建 episode，单行 SQL 注入在 none 档被直接放行。修复为：当当前 base 没有 episode 时，查找最近 accepted，并要求其 HEAD 是当前 HEAD 的祖先，从而复用原 F 重新验收。

复测 `r2-head-fixed-changed.jsonl`：新 HEAD 复用原 episode 并返回 `jury_gate_human_required`，没有直接放行；agent 修复后最终 push 到 `404f7ed`。

另记录一个未完全解决的边界：验收代理把已修复的金额 finding 也重新判 open，造成不必要的人工升级；随后新 episode 又接受修复。exact-HEAD 防直接放行已成立，但验收状态迁移仍需后续收敛。

## 7. 价值主张判定

- **默认 standard 召回优势：证伪（本协议下）。** 只有 pr-003 有增量，平均提升与严格胜出数均远未达线。
- **standard 基本可靠性：有限证明。** 截断修复后 3/3 完成，但样本小且只跑一次，不能宣称长期稳定。
- **voter 低误报与证据质量：本包内成立。** 34/34 有证据、0 误报。
- **普遍成本优势：证伪。** 只有一个边际增量便宜，其他 PR 成本显著更高且无增量。
- **intent 与 gate：保留为最有力的产品价值。** 合流已实测；exact-HEAD 已修正并实测重新验收。
- **quick 高危主力：仍不支持。** 本协议主要验证 standard，未改变 quick 只作轻审的定位。

## 8. 遗留问题

1. exact-HEAD 验收会把部分已 fixed finding 重新判 open，需改进“未触碰保持 fixed、明确重引入才 open”的语义与证据要求。
2. standard 在真实大 diff 上仍有较高 cacheRead/输出成本，pr-008 达 $0.1478，需要下一轮控制。
3. 每 PR 仅一次运行，无法估计 standard 方差；A/A 只证明本次 baseline 自身召回稳定。
4. 独立子代理盲裁未执行，当前为协调者人工盲裁；后续有 explore 工具时可复核。
5. adverse 未纳入主实验，不影响协议主臂，但竞品对照仍未完成。
6. 协议次数上限被违反一次，后续 gate 回归失败重试必须预先计入次数预算。
