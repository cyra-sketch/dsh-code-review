# EVAL-009：single 默认引擎与低成本 gate 闭环

> 日期：2026-10-29 ｜ 本轮模型成本硬上限 $0.15，最多 2 次 dsh 运行。未读取凭证、未对项目仓库 commit。

## 1. 实现与默认行为

新增 `tier=single`：

- 1 个 fresh-context 通用评审子代理，不使用 persona 团，默认无独立 voter。
- 与其他档共用 finding schema、REVIEW.md/intent、确定性去重、报告和 findings 台账。
- auto 风险门控保持低分 none；中/高分默认 single。standard/deep 仅在用户显式指定或 `gateTier` 强制时启用。
- gate 发现默认 single，后续仍只有 1 个纯验收代理；冻结 F、maxRounds、预算和人工升级逻辑不变。
- `gateTier` 可显式覆盖发现档。

本轮当时依据 EVAL-008 调整默认档；该实验后续已由 ERRATA-001 勘误。当前默认依据改为 R3/EVAL-010：三个干净样本未显示 standard 相对强 baseline 的增量，因此不再默认为多 persona 支付多倍成本。standard/deep 为“显式要求的深度审查”，不是默认必选项。

## 2. 两次运行与成本

| 运行 | 结果 | 子代理 | 当次美元 | 本轮累计 |
|---|---|---:|---:|---:|
| 错误 cwd 的 gate 尝试 | 未进入评审，无 episode、无 push | 0 | $0.022607784 | $0.022607784 |
| 正确 cwd 的 single gate | **第 2 轮验收通过，push 成功** | 1 发现 + 1 验收 = 2 | $0.022718826 | **$0.045326610** |

第一次失败是协调者把 headless cwd 错设为项目根，gate 在错误仓库解析 HEAD；不是插件或 single 的评审失败。该成本也计入总账，未重跑 pr-007，因此总运行次数严格为 2，总成本 **$0.045326610 < $0.15**，剩余 $0.104673390。

预算明细已追加到 `eval/budget-R2.md`。

## 3. single gate 闭环证据

事件流：`eval/runs/r2-single-gate-success.jsonl`；台账：`eval/regression/single/work/.dsh/jury/gate-episodes.jsonl`。

1. **round 1 discovery**：single reviewer 冻结 2 个 finding：SQL 注入与浮点分；`subagentCalls=1`。
2. agent 只修冻结项：参数化查询与 `Math.round` 整数分。
3. **round 2 verification**：仅 1 个验收代理，2/2 fixed；`subagentCalls=2`，状态 `accepted`。
4. bare `origin/main` 从 `e5e2038` 推进到 `d197e86`，与本地 HEAD 一致，提交只含 `src/checkout.ts`。

single 的“发现与验收分离”语义完整成立：没有 persona 团，也没有独立 voter，未出现范围扩张。

## 4. 三方对照

| 形态 | 质量/行为证据 | 成本证据 |
|---|---|---|
| 无插件 baseline（pr-007） | 6/6 | $0.015630828 |
| jury standard（pr-007） | 6/6，截断修复后完成 | $0.065318478 |
| single gate | 第 2 轮闭环成功 | $0.022718826 |

另有历史 gate 对照：此前 quick gate 成功闭环为 4 子代理、280,986 totalTokens；single 为 2 子代理、1,105,007 totalTokens（含大量 cacheRead），**美元成本下降约 91.9%**。

pr-007 的可选 single 评审未运行，因为两次运行额度已用完。**没有 single 在该 PR 上的新召回数据**，不能把 gate 成功直接写成 single 评审质量优于 baseline。

## 5. 为什么这是更健康的默认形态

- 默认成本与证据匹配：评审团在 held-out 上无稳定增量，single 不再让每次普通评审默认支付多 persona 成本。
- 控制流简单：默认一次发现、一次验收，仍保留冻结、状态持久化、exact-HEAD 和人工升级。
- 保留升级路径：用户明确需要深度审查时才选择 standard/deep，不为默认场景买单。
- gate 已证明 single 不只是报告工具，也能驱动 agent 修复并真实 push 放行。

## 6. 遗留问题

- single 尚未在 pr-007/008/009 做系统 A/B，召回与误报优势仍未证明。
- 验收代理的 fixed/open 状态迁移仍有上轮误判风险，需要后续加强“未触碰保持 fixed、明确重引入才 open”。
- 单次小 fixture 成本不能外推为所有 PR 的价格；cacheRead 占比和 diff 规模影响很大。
- standard/deep 仍是高成本显式选项，需避免 auto 又隐式升级成评审团。
