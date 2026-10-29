#!/bin/bash
set -euo pipefail
ROOT=$(cd "$(dirname "$0")/../.." && pwd)

make_repo() {
  local name=$1
  local work="$ROOT/eval/regression/$name/work"
  if [ -d "$work" ]; then
    echo "$work already exists; leaving it unchanged" >&2
    return
  fi
  mkdir -p "$work/src"
  git init -b main "$work"
  git -C "$ROOT/eval/gate-fixture/work" show 31e81fd:src/checkout.ts > "$work/src/checkout.ts"
  git -C "$work" add src/checkout.ts
  git -C "$work" -c user.name='R2 Fixture' -c user.email='r2@localhost' commit -m 'initial checkout'
  git init --bare "$work/origin.git"
  git -C "$work" remote add origin "$work/origin.git"
  git -C "$work" push -u origin main
  git -C "$ROOT/eval/gate-fixture/work" show 3a04f32:src/checkout.ts > "$work/src/checkout.ts"
}

make_repo intent
make_repo head
