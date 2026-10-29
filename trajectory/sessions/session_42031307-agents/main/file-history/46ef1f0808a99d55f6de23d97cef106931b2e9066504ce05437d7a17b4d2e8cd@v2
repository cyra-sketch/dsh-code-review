# R2 gate 行为回归

运行顺序：

```sh
bash eval/regression/prepare.sh
bash eval/regression/run-intent.sh
bash eval/regression/run-head.sh
```

- `run-intent.sh`：patch 提供 `gateIntent`。首轮冻结 finding 必须包含 SQL/浮点之外的 operatorIp 合规遗漏；agent 修复并 push 后才算合流通过。
- `run-head.sh`：首次验收成功后，脚本故意重新引入 SQL 注入并产生新 HEAD。第二次 push 必须重新验收并拦截，不能因为 base SHA 相同而直接放行。

两个场景只用本地 bare remote。脚本会修改 regression fixture 并提交本地 commit，不会修改项目 Git 历史。输出在 `eval/runs/r2-*.jsonl`。
