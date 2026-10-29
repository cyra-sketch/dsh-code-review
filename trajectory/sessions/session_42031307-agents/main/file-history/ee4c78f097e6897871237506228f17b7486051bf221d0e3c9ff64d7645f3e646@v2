# R5 dogfood 缺陷台账

来源：`eval/dogfood/run.jsonl` 的 single 自评审与协调者人工复核。

## BUG-R5-001：无 upstream 首次 push 漏审已提交内容

- 分类：真 bug（高危，push 契约绕过）。
- 根因：`gateBase` 回退 HEAD，runner 执行 `git diff HEAD`，无 upstream 时得到空 diff。
- 修复要求：从 Git empty tree 审查当前 HEAD 的完整已提交树。

## BUG-R5-002：git -C 在错误仓库验收

- 分类：真 bug（高危，仓库绑定破坏）。
- 根因：命令识别支持 `git -C repo push`，工作目录解析却只处理 cd。
- 修复要求：解析 push 段的 -C，并相对前置 cd 目录解析；HEAD/diff/episode/runner 使用同一目录。

## BUG-R5-003：验收冻结输入丢失 open/fixed 状态

- 分类：真 bug（高危，验收状态语义不完整）。
- 根因：acceptance frozen finding 不含 status，prompt 只说 untouched stays fixed，无法可靠保持 untouched open。
- 修复要求：冻结输入带 status，明确 untouched open 保持 open、fixed 保持 fixed。

## BUG-R5-004：长 diff 预处理误认 hunk 内 --- 为文件头

- 分类：真 bug（高危，评审输入可能被破坏）。
- 根因：`splitSections` 在 hunk 内也按 `--- ` 切新 section。
- 修复要求：只有不在 hunk 内时识别 unified diff 文件头；长 diff 回归保持原始行。

## BUG-R5-005：runtime schemastery 未声明为安装依赖

- 分类：真 bug（发布/安装缺陷）。
- 根因：`src/index.ts` runtime import，但包只有 devDependency。
- 修复要求：移入 runtime dependencies 并更新 lockfile，严格安装可加载。

## 修复验证

五项均已修复。`src/gate.ts` / `src/jury.ts` 使用 empty tree 审查无 upstream HEAD，解析 git -C 并在 acceptance 输入保留 status；`src/diff.ts` 不在 hunk 内切分 `--- `；schemastery 已移入 dependencies 并更新 lockfile。

`node eval/dogfood/regression-assert.mjs`：**5 passed / 0 failed**；原契约 20/20、命令 21/21；typecheck/build 通过。证据：`eval/dogfood/regression-results.json`、`eval/EVAL-013-dogfood.md`。
