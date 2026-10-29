# v0.1.0 Release Checklist

本清单用于主 agent 统一发布。当前只做准备，不创建或推送 tag。

## 官方 testing policy 对照

| dsh testing policy | 本仓库证据 | 发布前检查 |
|---|---|---|
| REAL-composition：测试真实插件组合，而非孤立函数 | `eval/e2e-auth/composed-config.yml` 在独立已认证 profile 中组合 `dsh-code-review`；`eval/acceptance/run.mjs` 从 fresh clone 安装到隔离 profile | 确认 `id: jury`、bundle 名和实际加载项与发布包一致 |
| 真实 Loader 与入口 | `dsh plugin add` 后通过真实 `jury_run` 调用；block gate 通过真实 bash `git push` 触发 | `eval/e2e-auth/jury-call.jsonl`、`gate-push.jsonl`；不接受只 import 模块作为端到端证据 |
| 发布构建 | TypeScript `typecheck`、build、`npm pack --dry-run --json` | 包名 `dsh-code-review@0.1.0`，仅发布 `lib/`、`cordis.patch.yml`、README、LICENSE 和 manifest |
| mock 只用于外部边界 | fake runner 仅替代模型 reviewer；Git 仓库和 bare remote 为本地真实 Git；外部账户凭证不读取 | `eval/acceptance/gate-command-assert.mjs` 与 `eval/dogfood/regression-assert.mjs`；不得把 fake runner 结果写成真实模型证据 |
| 真实模型流程单独验证 | 已认证宿主 home 的独立 profile，真实 headless、discovery、acceptance、human/approved 与 push | `eval/acceptance/.results/`、`eval/e2e-auth/`、`eval/EVAL-012-final-hardening.md` |
| 环境矩阵明确记录 | Node.js 22+、npm、Git、zstd、dsh `0.2.1-rc.2`、pnpm、已认证 dsh 账户 | macOS 已验证；其他 OS 的 `--reset` 和登录流程未验证，必须保留为已知边界 |

## 发布前命令

```sh
npm install
npm run typecheck
npm run build
node eval/acceptance/gate-command-assert.mjs
node eval/acceptance/assert.mjs
npm pack --dry-run --json
```

要求：

- typecheck/build 通过。
- 命令断言 40/40，契约断言 20/20；如果后续新增断言，记录新的总数而不是覆盖历史结果。
- `eval/acceptance/.results/` 中的最新 fresh-clone 结果可复现，历史结果文件不被运行器改写。
- `npm pack --dry-run` 不包含 eval、fixture、credentials、`.dsh`、node_modules 或缓存。
- README 的成本归因、冻结边界、嵌套 shell 覆盖与 postAcceptReview 语义一致。

## v0.1.0 tag 准备（主 agent 执行）

1. 审查全部未提交变更并让独立评委完成 fresh-clone 复测。
2. 确认工作区干净、目标 commit 已推送到 `main`，记录最终 commit SHA：________。
3. 再跑一次上述发布前命令并保存结果。
4. 确认 GitHub release  notes 包含：single 默认、冻结+验收、intent 条款、exact-HEAD、人工批准、嵌套 shell fail-closed、可选 postAcceptReview。
5. 只有主 agent 明确批准后才创建并推送 `v0.1.0` tag；本清单本身不授权 tag 或 push。
