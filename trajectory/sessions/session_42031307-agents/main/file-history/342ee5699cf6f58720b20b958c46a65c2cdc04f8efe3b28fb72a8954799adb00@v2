# EVAL-013：dogfood——用 dsh-code-review 评审自己的源码

> 日期：2026-10-29 ｜ 本轮 dsh 成本上限 $0.20，续记 `eval/budget-R4.md`。未读取/打印凭证。有效评审使用 single 档一次完成；finding 由协调者逐项人工复核，没有盲信插件输出。

## 1. 自评审输入与运行

- 输入由 `git diff-tree -p --root HEAD -- src/ cordis.patch.yml package.json tsconfig.json` 生成，保存为 `eval/dogfood/self.diff`。
- root commit：`2681a14bad5ee5f5a84f60d5c3f90016f3c33c51`。
- diff 共 **1,531 行**，有效报告确认进入长 diff 分支：`1531→1530 行，过滤 0 个无关 hunk`。
- 有效事件流：`eval/dogfood/run.jsonl`。`jury_run(path=self.diff,tier=single)` 返回 5 项 Important、均为 disputed（single 无独立 voter）。

首次运行因改名后 `jury-eval` profile 保留旧包链接，插件导入失败，没有调用 jury_run；日志保留为 `run-install-failure.jsonl`。从本地目录更新安装后才取得有效报告，不把环境故障算作 finding。

## 2. Finding 清单与人工分类

| # | Finding | 分类 | 人工核对 |
|---:|---|---|---|
| 1 | 无 upstream 时 gate 回退 `git diff HEAD` | **真 bug（高危）** | 首次 push 的已提交内容可为空 diff，直接绕过评审 |
| 2 | `git -C repo push` 在错误仓库验收 | **真 bug（高危）** | 命令识别支持 -C，但 cwd 只解析 cd，HEAD/diff/episode 可指向另一仓库 |
| 3 | acceptance 可能把 untouched open 标为 fixed | **真 bug（高危）** | frozen 输入不含 status，untouched open 的状态信息确实丢失，验收契约不完整 |
| 4 | 长 diff 预处理把 hunk 内 `--- ` 当文件头 | **真 bug（高危）** | 删除行前缀与内容可形成 `--- `，会错误切 section 并破坏评审输入 |
| 5 | runtime schemastery 只在 devDependencies | **真 bug（发布/安装）** | `src/index.ts` 直接 runtime import；严格或非提升安装会缺包，此前直接 Node 加载已出现同类故障 |

汇总：**真 bug 5、条件性风险 0、误报 0**。没有只记录风格问题而不改代码的情况。

## 3. 真 bug 修复

1. **无 upstream 漏审**：新增 `EMPTY_TREE_SHA` 与 `RunOptions.fromEmptyTree`。无 upstream 时 discovery 和 acceptance 均评审 `EMPTY_TREE_SHA..HEAD`，覆盖当前 HEAD 的完整已提交树，不再执行空 `git diff HEAD`。
2. **git -C 错仓库**：`gitPushWorkingDirectory` 解析 push 段的 `-C`；与 cd 组合时相对 cd 目录解析。HEAD、diff、episode 和 runner 继续使用统一 cwd。
3. **验收状态丢失**：`acceptancePrompt` 的 frozen finding 包含 status，并明确“untouched open stays open、fixed stays fixed”。
4. **diff 头部误判**：`splitSections` 只在不处于 hunk 内时接受 `--- ` 为文件头，长 diff 不再因此切坏。
5. **安装依赖**：`@deepseek-ai/schemastery@3.18.5` 移入 runtime `dependencies`，lockfile 同步更新。

README 补充无 upstream 与 git -C 的实际行为。缺陷台账：`eval/BUGS-R5.md`。

### 无模型回归

`node eval/dogfood/regression-assert.mjs`：**5 passed / 0 failed**，逐项覆盖上述五条路径；结果在 `eval/dogfood/regression-results.json`。

同时通过：

- 原契约断言：**20/20**。
- 命令断言：**21/21**。
- `npm run typecheck && npm run build`。
- `npm pack --dry-run --json`：包名为 `dsh-code-review@0.1.0`，runtime dependency 随包声明。

本报告随五项修复进入同一个修复提交；提交 SHA 以提交后的 Git HEAD 为准。未进行第二次付费模型评审，因此修复结论来自源码检查与确定性回归，不冒充模型复验。

## 4. Dogfood 对可信度的意义

这次自评审直接命中了产品最该自检的区域：push 绕过、仓库绑定、验收状态、长 diff 完整性和发布安装，而不是只给风格建议。它证明 single 对当前大型自身 diff 有实际缺陷发现价值，也验证了 800+ 行预处理路径确实运行。

但 5 项均为 disputed，不能因插件自报 Important 就直接发布。可信度来自“模型提出候选 → 人工逐条核对 → 最小修复 → 确定性回归”的闭环，而不是模型自我背书。此次也没有证明评审能发现所有高危绕过面；复杂 shell、其他执行路径和远端 API 仍按 README 作为边界保留。

## 5. 成本

| 运行 | 美元 |
|---|---:|
| 改名后 profile 包链接失效（未调用 jury_run） | $0.005456442 |
| 有效 single 自评审（5 findings） | $0.024549792 |
| 合计 | **$0.030006234** |

本轮剩余 **$0.169993766**。逐次 usage 与累计见 `eval/budget-R4.md`；有效评审父子 usage 见 `eval/dogfood/usage.json`。
