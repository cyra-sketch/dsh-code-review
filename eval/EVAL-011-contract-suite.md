# EVAL-011：R4 契约套件、自动 intent 与安装收口

> 日期：2026-10-29 ｜ 预算：`eval/budget-R4.md`，硬上限 $0.70。全程未读取/打印凭证，未对项目仓库 commit；所有 push 只进入 fixture 内的本地 bare remote。
>
> 后续勘误：本文的 intent-missing accepted 被证明仍含浮点分违约，揭示“冻结项清零 ≠ 需求满足”。R4 final hardening 已加入独立 intent 条款状态并修正 accepted 语义，见 `eval/EVAL-012-final-hardening.md`；本文的 3/3 不代表需求完整性已保证。

## 结论

- **A / gate 契约：最终 4/4 场景通过。** low-risk 零子代理；single 发现与纯验收；冻结集合不扩张；Math.floor 等价修复保持 fixed；独立 fixture 证明 fixed→open；新 HEAD 重新验收；maxRounds=1 确定性人工升级并阻断 push。
- **B / 自动 intent：最终 3/3 按各自窄口径通过。** 全程不传 `gateIntent`，由 sessionQuery 读取首条用户消息。缺失 operator IP 可发现并修复，clean 零 finding，negative 不虚构需求偏离。
- **C / 安装：协调者模拟干净环境安装 3/3，通过模块加载与组合配置检查。** 这不是外部用户采用证据。clean-home 真实 headless 仅尝试 1 次，在模型调用前被独立 home 的登录要求阻断，完整 clean-home E2E 仍缺失。
- 组合机器断言：**18 passed / 0 failed**，见 `eval/acceptance/assert-results.json`。
- 13 次有模型调用的运行（含失败与重跑）总成本 **$0.211579338**，剩余 **$0.488420662**。安装验证没有产生模型费用。

## A. Gate 行为契约

| 场景 | 最终证据 | 判定 |
|---|---|---|
| low | `eval/acceptance/low/rerun.jsonl`：round 1 accepted，`subagentCalls=0`，bare main=`805e049` | 通过 |
| high single | `eval/acceptance/high/run.jsonl`：round 1 一个 reviewer 冻结 SQL/浮点分两项；round 2 全 fixed，Math.floor 被接受，无新增 finding | 通过 |
| exact-HEAD | high round 3 在新 HEAD `85c2636` 重新验收并放行；后续未验收 `afadefc` 不在 bare remote | 通过 |
| fixed→open | `eval/acceptance/reopen`：round 2 accepted 后只重引入 SQL；round 3 SQL 转 open，其余保持 fixed，未验收 `6133b66` 被阻断 | 通过 |
| maxRounds=1 | `eval/acceptance/human/run.jsonl`：round 1 discovery 后 `jury_gate_human_required`，只调用一个 reviewer；`2275c22` 不在 bare remote | 通过 |

旧的 `high/reopen.jsonl` 只有 round 3 human、空 findings，不能证明 fixed→open，未用作通过证据。`high/reintroduce.jsonl` 中 agent 在 push 前主动修复，同样不冒充重开证据；有效证据来自独立 `acceptance/reopen` episode。

`eval/acceptance/assert.mjs` 直接读取 episode JSONL、验收时提交的源码和 bare refs。除状态迁移外，还断言未验收 commit 的对象没有进入 bare 仓库，避免只检查 agent 文本。

## B. 自动 intent 三任务

三次运行均只使用 `headless.patch.yml` 与 `gate-block.patch.yml`，没有 `gateIntent`。

| 任务 | 首轮自动 intent 结果 | 最终状态 | 判定 |
|---|---|---|---|
| intent-missing | 冻结 SQL 注入与 `No audit record with operator IP after successful payment` | round 3 两项 fixed，bare main=`388e7e5` | 通过 |
| intent-clean | 零 findings | round 1 accepted，bare main=`f294993` | 通过 |
| intent-negative | 不再出现“未请求审计”类虚构偏离；保留有代码依据的支付成功后审计失败 finding | gate 阻断未验收 `9d75b4c` | 窄口径通过 |

negative 的目标是“不幻觉需求偏离”，不是强迫真实代码问题归零。审计 INSERT 在支付成功后失败会造成调用方重试风险，因此保留阻断是正确行为。

### 失败—修复—重跑记录

1. **BUG-R4-001**：reviewer 曾把“尚未 push”当成代码 finding，形成无法通过修码清零的死锁。`src/prompts.ts` 现在明确忽略 stage/commit/push/remote/gate 操作指令；finder 与 voter 口径一致。干净 intent-missing 与机器断言证明该误报消失。
2. **BUG-R4-003**：reviewer 曾把“没有附加审计需求”理解成“禁止审计”。prompt 现在明确未提及或可选功能不等于禁止，只有违反明确需求才是 intent deviation。negative 重跑只保留真实发现。
3. **BUG-R4-002**：准备脚本的 low 分支原本不具备幂等性，复跑会改写 fixture。已补存在性保护；连续两次运行后 HEAD 保持 `c5b7a2f`，随后重新取得 low 的零子代理证据。事故现场保留，未用 destructive Git 清理。

完整台账：`eval/BUGS-R4.md`。首次失败目录保留为 `intent-missing-pre-fix` 与 `intent-negative-pre-fix`，没有覆盖历史来制造全绿。

## C. 三个独立 DSH_HOME 安装验证

证据类型：**协调者模拟干净环境安装验证**。当前没有独立 coder 子代理工具，不冒充外部用户采用或独立 coder 反馈。

| Case | 安装 | 耗时 | 模块加载 | 组合出 jury 条目 | 真实 headless |
|---|---|---:|---|---|---|
| 1 | 首次缺 pnpm；任务内 PATH shim 后成功 | 重试 4 秒 | 通过 | 通过 | 调用前 `ACCOUNT_SIGN_IN_REQUIRED` |
| 2 | 成功 | 5 秒 | 通过 | 通过 | 未重复尝试同一认证障碍 |
| 3 | 成功 | 4 秒 | 通过 | 通过 | 未重复尝试同一认证障碍 |

- 成功率：tarball 安装 **3/3**，模块加载 **3/3**，组合配置 **3/3**。
- 卡点：DSH 插件管理器要求 PATH 中有 pnpm；本机无 pnpm/corepack，使用 `eval/install/bin/pnpm` 调用项目缓存中的 `npx pnpm`，未修改全局环境。独立 home 不继承账户登录，未复制凭证绕过。
- 误阻断：clean-home headless 在 agent 运行前失败，源码与 bare main 均未变化；这不是 gate 误阻断。已观察 gate 误阻断 0 次，但 clean-home E2E 样本不足。
- 是否愿保持启用：三个干净 home 均标为 **pending-auth-and-clean-home-e2e**，不能伪装成用户采用意愿。
- 结构化结果：`eval/install/results.json`。

## 成本与通过率

| 分组 | 模型运行 | 成本 | 最终通过率 |
|---|---:|---:|---|
| A（含 high 补记与 low 重建复跑） | 8 | $0.088893282 | 契约场景 4/4 |
| B（含两次失败与干净重跑） | 5 | $0.122686056 | intent 窄口径 3/3 |
| C | 0 次有效模型调用 | $0 | 安装 3/3；clean-home E2E 未完成 |
| 合计 | 13（含失败/重跑） | **$0.211579338** | 不用单一百分比掩盖 C 的缺失 |

每次父子会话 token 与成本见各场景 `*usage.json`；逐次累计见 `eval/budget-R4.md`。`high/reintroduce` 最初漏账，已按原始会话 usage 补记 $0.005619378 并重排累计。

## 文档清账

- README：默认 single 的依据从已勘误 EVAL-008 改为 R3/EVAL-010；intent 改为 sessionQuery 自动获取，并写明显式优先级与工作流/未提及功能边界。
- `docs/笔试方案.md`：§0 与 C.1 改为高危默认 single；§3① 区分弱 baseline 与 dsh 强 baseline；Q4 将异构模型降为未测可选配置；E.4 改为“本组样本未显示增量”。
- EVAL-010：原始 usage 复核后，baseline output 修正为 **81,939**，standard cacheRead 修正为 **14,930,688**；两者与既有美元成本一致。
- EVAL-010 新增隔离限制披露：pr-008 diff 自带 Bug fixes/符号问题定位提示；`issue31.json` 留在目录但未被读取，因此不是严格只含 diff 的完全盲审。
- `eval/regression/ACCEPTANCE.md`：等价修复与明确重引入均改为已实跑。

## 最终验证与遗留

执行：

```sh
node eval/acceptance/assert.mjs
npm run typecheck && npm run build
```

机器断言 18/18；TypeScript typecheck/build 均通过。

仍未证明：

1. 独立 home 登录后的完整安装—运行—push E2E，以及真实外部用户/独立 coder 的采用意愿。
2. intent 只有三个任务，prompt 语义约束不能推断为所有需求文本都稳定；需要更多负面对照和跨会话测试。
3. standard 在 pr-008 大 diff 上超时的问题未在本轮处理；评审团仍只作显式深度档。
4. R3 pr-008 自带定位提示，不能把其三臂命中当成完全无提示盲审能力。
