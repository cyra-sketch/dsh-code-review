# R2 预注册决胜实验协议（预算约束版，运行前冻结）

> 冻结时间：2026-10-29。本文在任何本轮模型运行之前写定；运行后不得修改通过线、样本或计分口径。预算不足只能把剩余项标为“未运行”，不得移动球门柱。

## 1. 样本与既有数据

核心样本（全部高危/困难语义）：

1. pr-003：合成高级雷；复用既有 baseline/standard 数据，不新增运行。
2. pr-007：独立作者盲埋；复用 baseline/quick 数据，仅补 standard。
3. pr-008：真实历史 `bpierre/dnum` bug/fix 对（`56e44125`→`fff072e`）；baseline 和 standard 各跑一次。

可选增量样本（优先级最低）：pr-009，真实 `compare()` 数组比较 bug/fix 对（`530a83a3`→`6f5b048d`）。仅在累计预算仍充足时运行 baseline/standard 各一次。

主臂固定为无插件 baseline vs jury standard（截断修复后），模型均为 `deepseek-account/deepseek-flash`、reasoning high。每个 PR 每臂只跑一次，方差如实标注；不得追加运行直到结果好看。

## 2. 运行上限与顺序

- **全部 dsh 模型调用累计成本 ≤ $1.00**，采用谷时价：未命中输入 $0.15/M、命中输入 $0.003/M、输出 $0.60/M。
- **总运行次数 ≤10 次**（gate 的两次 headless 各计一次，A/A 计一次）。
- 每次结束立即从真实会话 usage 计算当次和累计成本，写入 `eval/budget-R2.md`；接近上限立即停止。
- 非模型工作（语料、GT、人工盲裁、adverse 调研）不得使用 dsh。

执行优先级：

1. pr-007 standard ×1
2. pr-008 baseline ×1、standard ×1
3. gate+intent 合流回归 ×1、exact-HEAD 回归 ×1（quick 评审，只验证行为）
4. pr-009 baseline ×1、standard ×1（可选）
5. A/A：pr-007 baseline 再跑 ×1（可选噪声带）

## 3. 计分

- 召回：对照各自 GT 做语义命中，不要求行号一致。
- 误报：finding 中缺乏代码事实或被代码反驳的比例；uncertain 单独列出，不自动算误报。
- 证据率：带可定位 file:line 的 finding 比例。
- 盲裁：由未参与实现的独立评审者对照 GT 裁定；若工具环境没有独立子代理可用，必须明确标为协调者人工盲裁，不得冒充独立子代理。
- 成本：父会话和全部子会话的 inputTokens/cacheReadTokens/outputTokens，按谷时价分别计算。
- 增量边际成本：`(standard 美元成本 - baseline 美元成本) / max(standard 召回 - baseline 召回, 0)`；无增量时不计算，不写无穷大代替数据。

## 4. 预先固定的通过线

必须同时满足：

1. **召回**：standard 在核心样本上的平均召回相对 baseline 提升 ≥15%，且 core 3 PR 中至少 **2/3** 严格多于 baseline。若 pr-009 完成，则改为在全部 4 PR 中至少 **2/4** 严格多于 baseline；平均召回仍按全部完成 PR 计算。
2. **完成率**：standard 非截断且产出结构化报告的比率 ≥90%（pr-007/008/009 本轮 standard 运行合计，历史失败只作背景，不计入本轮分母）。
3. **误报率**：全部完成 PR 的 standard finding 中，误报 ≤10%。
4. **经济性**：有正增量样本的增量发现美元边际成本中位数 ≤$0.15/雷；没有正增量样本则该线直接失败。
5. **行为回归**：gate+intent 合流与 exact-HEAD 验收后改 HEAD 均通过。

## 5. 未通过的预设结论

- 召回线未达：评审团降级为可选引擎，不再主张默认召回优势；产品价值仅保留 gate+intent 等待独立验证。
- 完成率未达：standard 不作为可交付评审产品，先修可靠性，不讨论质量增益。
- 误报线未达：不主张 voter 降噪和高质量合成。
- 经济线未达：不主张 DeepSeek 评审团具备成本优势，只在用户明确接受边际成本的高风险场景保留。
- gate 回归未达：不把 gate 描述为强制闭环，exact-HEAD 或 intent 哪项失败就保留哪项批评。
- adverse 为可选第三臂；接入失败只记录原因，不影响 baseline vs standard 主实验，也不得用 baseline 冒充 adverse。
