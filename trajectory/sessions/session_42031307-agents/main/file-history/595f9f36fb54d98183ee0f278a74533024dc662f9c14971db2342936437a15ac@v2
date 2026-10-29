# EVAL-012：R4 final hardening——intent 条款契约与已认证安装闭环

> 日期：2026-10-29 ｜ 本轮模型成本硬上限 $0.30，续记 `eval/budget-R4.md`。未读取/打印或复制 credentials，未对项目仓库 commit；所有 push 仅进入本地 bare remote。

## 1. 反例根因

反例保留在 `eval/acceptance/intent-missing-accepted-unmet/run.jsonl:189-202`：gate round 3 accepted 且 push 成功，但最终代码仍执行 `total = total * (1 - percentOff / 100)`，333 分订单九折得到 299.7 分。

根因有两层：

1. **discovery 召回缺口**：single reviewer 收到完整首条用户消息，其中明确包含整数分、减免封顶和审计 IP，却只冻结 SQL 与审计 IP 两项，漏掉浮点分。
2. **验收语义缺口**：episode 只保存冻结 findings，验收只检查 F 是否清零，没有独立的 intent 条款状态。因此，即使首条需求未被完整核对，也可 accepted。

登记为 `eval/BUGS-R4.md` 的 BUG-R4-004。此次不是“agent 没报告问题”：agent 最终已明确报告需求未满足；缺陷是 gate 仍把不完整契约标记为 accepted。

## 2. 条款化修复

### 确定性条款与状态

新增 `src/intent-clauses.ts`：

- 不增加模型调用，按句读、中文列举与情态结构确定性拆分代码需求；规范化文本哈希生成稳定 clause ID。
- 先过滤完整工作流句子，再拆列举，覆盖 git/gate/jury_run、返回报告和禁止改码等指令。
- `src/jury.ts` 在 discovery 要求 reviewer 对每个条款独立返回 met/unmet/unknown 与理由，并汇入 `JuryResult.intentClauses`；low/none 保留 unknown，而不伪装成 met。
- `src/gate-episode.ts` 持久化条款 ID、文本、状态和理由。

本次首条消息稳定拆为：

| ID | 条款 |
|---|---|
| `ec0dff81de1a7e86` | 折扣金额必须使用整数分 |
| `4ca4ae223c22209f` | 减免不得超过订单总额 |
| `2d58387ac9119df7` | 成功支付后必须写审计记录且包含操作者 IP（合规要求） |

### accepted 联合语义

`src/gate.ts` 的 acceptance 输出同时包含 frozen finding checks 与 intent requirements。验收代理必须独立逐条复核，不得从“findings 全 fixed”推断条款 met。

**accepted = 零 open findings AND 零 unmet intent clauses。** unknown 明示保留，报告与 accepted 均不保证代码全部正确。block 反馈同时列出 findings、全部条款状态和 acceptedSemantics。

`src/prompts.ts` 与 `src/jury.ts` 的报告也明确这一边界。README 使用同一语义。

## 3. intent-missing 复测

旧反例目录保留，使用全新 `eval/acceptance/intent-missing/work`，首次仍原样提交。

| 轮次 | findings | intent 条款 | 结果 |
|---|---|---|---|
| round 1 discovery | 浮点分 open、SQL 注入 open | 整数分 unmet、减免封顶 met、审计 IP unmet | **浮点分被拦截** |
| round 2 acceptance | 两项均 fixed | 三项均 met | accepted，push 成功 |

- 最终 HEAD 与 bare main：`949e0300ca383d2dff8ae71a0980bb9ee0f63837`。
- 最终代码使用整数取整与 `Math.min` 封顶，不再保留原始浮点表达式。
- 本次 reviewer 没再漏掉浮点分，因此**本轮没有遗留 discovery 漏报**；单次成功不能推断其他需求条款永不漏报。即便漏报，独立 unmet 条款现在也可阻止 accepted。
- `eval/acceptance/assert-results.json`：**20 passed / 0 failed**，包含确定性条款 ID、工作流过滤、浮点 unmet、最终全 met 和 bare ref 断言。

## 4. 已认证环境完整 E2E

在默认已认证 home 下新建独立 profile `jury-r4-e2e`，未读取或复制 credentials，未复用 `jury-eval` profile。

| 步骤 | 证据 | 结果 |
|---|---|---|
| tarball 安装 | `eval/e2e-auth/pack.json`、`install.log`、`install-update.log` | 成功，pnpm 使用任务 PATH shim |
| 组合配置 | `composed-config.yml` 含 `dsh-jury` / `id: jury` | 成功 |
| headless jury_run | `jury-call.jsonl`：一次工具调用，single 正式报告，无递归、无伪条款 | 成功 |
| block gate + push | `gate-push.jsonl`：独立 commit 与 push 工具调用 | 成功 |
| exact HEAD | episode、本地 HEAD、bare main 均为 `fc3aaf80e5711fbcbdddf5149526797bac4261da` | 成功 |
| 提交范围 | HEAD 仅 `src/cart.ts` | 成功 |

`eval/e2e-auth/assert-results.json`：**5 passed / 0 failed**。

### 无效过程与新增边界

- 首次 jury_call（`jury-call-recursion.jsonl`）因自动 intent 未过滤 jury_run/报告指令，reviewer 递归调用并产生报告伪条款。登记 BUG-R4-005；修复后重新打包更新同一 profile，才取得上述成功结果。
- 首次 gate push（`gate-push-chained.jsonl`）由 agent 使用 `git commit && git push`。前置钩子只能看到命令执行前 HEAD，episode 记录旧 SHA，不能算 exact-HEAD 成功。登记 BUG-R4-006；最终有效运行使用 `work-final`，明确分步执行。后续零模型修复已在任何评审前确定性拒绝这类串联命令，见 `eval/acceptance/gate-command-assert-results.json`。
- 默认 npx 缓存的一次宿主 zod 启动失败日志也保留；补上项目固定 `npm_config_cache` 后进入真实调用。它不是认证或 gate 失败。

这证明的是**已认证环境下安装到闭环**。独立干净 DSH_HOME 的登录流程仍未测，不越权读取 credentials。

## 5. 文档清账

- `README.md`：补 pnpm 前置条件；记录已认证 E2E 与干净 home 登录边界；写清条款化、accepted 联合语义、报告非全部正确性保证、低风险成本限定及 BUG-R4-006 分步要求。
- `docs/笔试方案.md`：D.5 改为 sessionQuery 自动提取已实现并限定当前首条消息；EVAL-005 改为 harness 原生低摩擦集成优势；限定无插件 baseline 与外部 hook/CI 替代关系；市场因果与“没有任何人”改为调研范围内表述；低风险成本与 BUG-R4-006 同步。
- `eval/EVAL-011-contract-suite.md`：增加后续勘误，避免旧 3/3 被理解为需求完整性保证。
- `eval/BUGS-R4.md`：登记 BUG-R4-004/005/006 与各自证据。
- `eval/acceptance/assert.mjs`：增加条款提取和浮点反例回归。
- 新增 `eval/e2e-auth/assert.mjs`：固化 install→call→gate→push 证据。

## 6. 成本

| 顺序 | 运行 | 美元 |
|---:|---|---:|
| 1 | intent-missing 条款化修复后重跑 | $0.015726204 |
| 2 | E2E jury_call 首次递归，无效 | $0.003866478 |
| 3 | E2E jury_call 修复后成功 | $0.001288242 |
| 4 | E2E commit+push 串联旧 HEAD，过程无效 | $0.001583712 |
| 5 | E2E 分步 commit→gate→push 成功 | $0.002172414 |
| 合计 | 5 次（含失败/无效过程） | **$0.024637050** |

本轮剩余 **$0.275362950 < $0.30 上限内**。每次父子 usage 分别保存在场景 `*usage.json`，逐次累计见 `eval/budget-R4.md`。

## 7. 验证与遗留

最终检查：

```sh
node eval/acceptance/assert.mjs
node eval/e2e-auth/assert.mjs
npm run typecheck && npm run build
```

结果分别为 20/20、5/5，typecheck/build 通过。

BUG-R4-006 后续已由零模型确定性拒绝修复，不再是遗留项。

遗留：

1. 干净 DSH_HOME 的登录与首次使用流程未测；本轮只证明已认证宿主 home 的独立 profile。
2. 条款拆分为确定性启发式，已覆盖当前中文需求和工作流反例，但不能保证所有语言/句式的条款边界；unknown 也不是 met。
3. 单次 discovery 成功不证明普遍召回；accepted 始终只是冻结 findings 与已提取 intent 条款的工程契约，不是全部正确性保证。
