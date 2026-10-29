#!/bin/bash
set -euo pipefail
ROOT=$(cd "$(dirname "$0")/../.." && pwd)
cd "$ROOT/eval/regression/intent/work"
npm_config_cache="$ROOT/.npm-cache" DSH_TELEMETRY_DISABLED=1 npx --yes @deepseek-ai/dsh --profile jury-eval \
  --patch "$ROOT/eval/headless.patch.yml" \
  --patch "$ROOT/eval/regression/gate-intent.patch.yml" \
  --json "请只提交 src/checkout.ts 并 push 到本地 origin/main。若 gate 拦截，请只修复冻结 findings（包括需求中的审计 operatorIp）后重试，直到成功或请人工裁决。不得添加 origin.git、.dsh 或其他文件，不得接触真实远端。" \
  > "$ROOT/eval/runs/r2-gate-intent.jsonl" 2> "$ROOT/eval/runs/r2-gate-intent.stderr.log"
