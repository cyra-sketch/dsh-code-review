# 验收状态迁移回归用例

## 已修复的可靠性缺陷

此前验收代理会把已经 `Math.round` 修复的浮点金额 finding 误判为 open，导致不必要的人工升级。`src/gate.ts` 的验收 prompt 已补充：

- 未触碰的 fixed finding 保持 fixed；
- 与原修复不同但语义等价的修复也算 fixed；
- 只有缺陷原样仍存在或被明确重引入时才判 open。

## 用例 A：等价修复不得重开

1. F 中浮点金额 finding 在上一 HEAD 已用整数取整修复。
2. 新 HEAD 只修改 SQL 查询，不触碰金额代码。
3. 期望金额 finding 保持 fixed，不得仅因实现形式或未触碰而重开。

## 用例 B：明确重引入必须重开

1. F 中 SQL 注入 finding 已参数化修复。
2. 新 HEAD 重新拼接 discountCode。
3. 期望该 finding 变为 open，不能因旧 accepted 直接放行。

R2 exact-HEAD 回归已覆盖 B。R4 进一步覆盖 A/B：`eval/acceptance/high` 证明 Math.floor 等价修复与新 HEAD 复验，`eval/acceptance/reopen` 证明 SQL fixed→open 且未触碰项保持 fixed；组合断言见 `eval/acceptance/assert-results.json`。
