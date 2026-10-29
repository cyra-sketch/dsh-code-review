# EVAL-003：插件 A/B 与干净 PR 误报评估

> 日期：2026-10-28 ｜ 方法：同一 dsh / 模型 / 语料，有插件 vs 无插件各跑一次；再做一次插件-only 干净意图 PR 评审。所有数据来自真实 headless 会话，无 mock。

## 1. 实验设置

- dsh：`0.2.1-rc.2`，profile `jury-eval`
- 模型：`deepseek-account/deepseek-flash`，reasoning effort `high`
- A（有插件）：直接调用 `jury_run`，standard，4 个 fresh-context finder + 1 个批量 voter
- B（无插件）：在相同 profile 上追加 `eval/disable-jury.patch.yml`，确认 `juryCalls=0`、`subagentCalls=0`，由单个父 agent 普通评审
- A/B 语料：`pr-001.diff`，同一组 8 个 ground truth bug
- 干净意图语料：`pr-002.diff`，139 行 TS fixed-amount discount PR；由 before/after 源文件和测试文件生成，无预埋 ground truth bug
- 本轮未修改插件源码；pr-002 评审暴露的是语料实现中的真实问题，不是插件 crash 或报告格式错误

证据文件：

- A：`eval/runs/pr-001.jsonl`、`eval/runs/pr-001-usage.txt`、EVAL-002 对应台账
- B：`eval/runs/pr-001-baseline.jsonl`、`eval/runs/pr-001-baseline-usage.txt`
- 干净 PR：`eval/runs/pr-002-jury.jsonl`、`eval/runs/pr-002-jury-usage.txt`
- pr-002 runId：`7689f4fc-b92a-4417-b0ce-6231515a76de`，对应台账第 13–25 行

## 2. pr-001 A/B 对照

| 指标 | A：有插件 | B：无插件 baseline | 增量（A-B） |
|---|---:|---:|---:|
| Ground truth 召回 | **8/8** | **8/8** | **0** |
| 最终 finding 数 | 12 | 15 | -3 |
| 误报 | **0** | **1** | -1 |
| 重复 finding | 1（B5） | 0（部分条目主题重叠但非完全重复） | +1 |
| file:line 证据 | **12/12 = 100%** | **15/15 = 100%** | 0 |
| 评审 agent 调用 | 1 父 + 5 子 | 1 父 + 0 子 | +5 子代理 |
| 父会话 totalTokens | 22,666 | 59,303 | -36,637 |
| 子会话 totalTokens | 799,339 | 0 | +799,339 |
| 总 totalTokens | **822,005** | **59,303** | **+762,702（13.86×）** |
| 非缓存输入 + 输出 | 213,365 | 18,215 | +195,150（11.71×） |

`totalTokens` 包含缓存读取，不等于同价计费 token。用量拆分：

| 运行部分 | 非缓存输入 | 输出（含推理） | 缓存读取 | totalTokens |
|---|---:|---:|---:|---:|
| A 父会话 | 2,800 | 2,714 | 17,152 | 22,666 |
| A 5 个子会话 | 83,156 | 124,695 | 591,488 | 799,339 |
| B 父会话 | 9,330 | 8,885 | 41,088 | 59,303 |
| B 子会话 | 0 | 0 | 0 | 0 |

### 召回与误报判定

- A 的 B1–B8 映射沿用 EVAL-002，全部成立；B4 为 `uncertain/disputed`，仍计语义召回。
- B 命中关系：B3→#1、B1→#2、B2→#3、B5→#4、B4→#6、B6→#9、B7→#13、B8→#14，全部带 file:line。
- B 的 #5 声称 SQL 返回列名“很可能”与 `DiscountCode` 不匹配，但 diff 没有实际 schema 或映射证据，属于未证实的命名猜测，计 **1 条误报**。
- B 的 `SELECT *`、非法日期、无效码提示、影响行数等其余条目均有代码事实或合理风险依据，不因其为低严重度/改进建议而算误报。

## 3. pr-002 干净意图 PR 误报评估

报告首行：

```text
评审结果：13 项（consensus 1 / disputed 2 / solo 10；Important 12 / Nit 0 / Pre-existing 1；已过滤 0）
```

逐条人工判定：

| # | finding 摘要 | 判定 | 理由 |
|---|---|---|---|
| 1 | payment_failed 分支的 release 失败会被 catch 再次 release | **成立，真实缺陷** | 两次调用确实位于同一 try/catch；commit-then-error 时会双减，且清理错误覆盖原返回 |
| 2 | 直接信任 items 中的 priceCents/qty | 成立，Pre-existing | 入参验证缺失是真实的；表达式来自旧代码，不应算本 PR 新增，但不是误报 |
| 3 | 网关已扣款但抛错时 release 会造成次数/支付不一致 | 条件性成立，disputed | 网络结果不确定是合理支付风险；具体网关行为未知，voter 已正确降为 uncertain |
| 4 | 预占与支付分离，崩溃后无 reservation 记录可 reconcile | 成立 | 代码事实成立，是可靠性与运营闭环缺口 |
| 5 | 全额减免仍调用零元网关，导致折扣不可用 | **误报** | 零元调用存在，但“网关拒绝并导致失败”没有接口合同依据；mock 明确允许 0，不能断言必然失败 |
| 6 | lookup 错误原因合并、生命周期无日志 | 成立 | 可观测性缺口真实，严重度为 minor |
| 7 | 缺少异常/释放次数/零元网关行为测试 | 成立 | 覆盖缺口真实，与 #11/#13 有主题重叠但非虚假陈述 |
| 8 | expired 测试未断言 charge 未调用 | 成立 | 测试名声称 before charging，但 closure 无计数，无法防止顺序回归 |
| 9 | lookup mock 忽略 code/owner | 成立 | 删除 owner 条件仍会通过现有测试 |
| 10 | reserve 失败分支无测试 | 成立 | mock 永远返回一行，零行分支未覆盖 |
| 11 | charge reject 后 rollback 无测试 | 成立 | 当前仅覆盖 resolved `{ok:false}` |
| 12 | 无折扣码的正常支付路径无测试 | 成立 | empty-cart 在 early return 前已抛出，其余成功用例都有 code |
| 13 | 支付失败测试只断言某个 decrement 存在 | 成立 | 未验证顺序、次数和 id，无法捕获双释放 |

结果：

- **误报：1/13 = 7.7%**（#5）
- 非误报：12/13，其中 #3 是条件性风险，#2 是 Pre-existing
- file:line：13/13 = 100%
- 插件稳定运行，无 crash；voter 汇总为 **11 valid、2 uncertain、0 invalid**
- 重要语料边界：pr-002 是“干净意图、无预埋 bug”，但 #1 是评审发现的真实实现缺陷。因此不能把 13 条全部当作误报，也不能声称它是已知零缺陷 PR。

pr-002 本次 token：父会话 23,634，5 个子会话 1,672,996，合计 **1,696,630 totalTokens**（其中缓存读取 1,468,800）。没有运行 pr-002 baseline，所以该数字只用于观察成本，不参与 A/B 成本比。

## 4. 增量价值与是否值得装

本次正式 A/B 的量化结论：

1. **召回增量为 0**：同一强模型单审本轮已经 8/8，不能继续引用 EVAL-001 的 5/8→8/8 作为当前插件的必然收益。单轮结果也说明模型、prompt 和运行波动会显著影响 baseline。
2. **质量增量有限**：插件少了 baseline 的 1 条无证据 schema 猜测，但自身仍有 B5 重复；两边 file:line 都是 100%。
3. **成本显著增加**：pr-001 总 token 为 baseline 的 **13.86×**，非缓存输入加输出为 **11.71×**，却没有换来召回提升。
4. **高风险场景仍有兜底价值**：pr-002 的 #1 是 finder 团捕获的真实双释放缺陷；多数测试完整性 finding 也成立。但 13 条中仍有 1 条误报，且大量覆盖建议会带来阅读噪声。

**诚实建议：不值得把它作为所有 PR 默认执行的 standard 评审。** 在本次语料上，召回增益为零而成本高一个数量级，默认常开的投入产出不成立。对于支付、鉴权、并发等高风险变更，或单审已经暴露盲区时，按需运行仍有保留价值；是否值得长期安装取决于后续在更多真实 PR 上能否稳定获得召回增量，并降低子代理 token 消耗。

## 5. 局限与后续

- 每个 A/B 条件仅运行一次、一个 PR、一个模型，不能做统计泛化；需要多次重复和更多真实历史 PR。
- baseline 为核对行号额外读取了 after 文件，插件只使用 diff；这给了 baseline 更多上下文，但也是普通 agent 的自然行为，已如实记录。
- pr-002 由评估者编写且非盲审；发现真实缺陷后未回改语料，避免把评估改成“直到得到想要结果”。
- 未测 quick 档的成本/质量，不能假设它能解决 standard 档成本问题。
- 插件去重和报告降噪仍是遗留问题：pr-001 有重复，pr-002 有多条相互重叠的测试覆盖建议。
