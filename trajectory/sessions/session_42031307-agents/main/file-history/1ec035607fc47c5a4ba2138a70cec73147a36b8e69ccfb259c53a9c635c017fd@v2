#!/bin/bash
set -euo pipefail
ROOT=$(cd "$(dirname "$0")/../.." && pwd)

make_checkout_repo() {
  local name=$1
  local source=$2
  local work="$ROOT/eval/acceptance/$name/work"
  if [ -d "$work" ]; then
    echo "$work exists; leaving unchanged" >&2
    return
  fi
  mkdir -p "$work/src"
  git init -b main "$work"
  git -C "$ROOT/eval/gate-fixture/work" show 31e81fd:src/checkout.ts > "$work/src/checkout.ts"
  git -C "$work" add src/checkout.ts
  git -C "$work" -c user.name='R4 Fixture' -c user.email='r4@localhost' commit -m 'initial checkout'
  git init --bare "$work/origin.git"
  git -C "$work" remote add origin "$work/origin.git"
  git -C "$work" push -u origin main
  if [[ "$source" == *":src/checkout.ts" ]]; then
    git -C "$ROOT/eval/gate-fixture/work" show "$source" > "$work/src/checkout.ts"
  else
    cp "$ROOT/$source" "$work/src/checkout.ts"
  fi
}

make_checkout_repo high 3a04f32:src/checkout.ts
make_checkout_repo reopen 3a04f32:src/checkout.ts
make_checkout_repo human 3a04f32:src/checkout.ts
if [ ! -d "$ROOT/eval/acceptance/low/work" ]; then
  mkdir -p "$ROOT/eval/acceptance/low/work/src"
  cp "$ROOT/eval/corpus/pr-004/cart.after.ts" "$ROOT/eval/acceptance/low/work/src/cart.ts"
  cp "$ROOT/eval/corpus/pr-004/test.after.ts" "$ROOT/eval/acceptance/low/work/src/cart.test.ts"
  git init -b main "$ROOT/eval/acceptance/low/work"
  git -C "$ROOT/eval/acceptance/low/work" add src
  git -C "$ROOT/eval/acceptance/low/work" -c user.name='R4 Fixture' -c user.email='r4@localhost' commit -m 'initial pure cart utility'
  git init --bare "$ROOT/eval/acceptance/low/work/origin.git"
  git -C "$ROOT/eval/acceptance/low/work" remote add origin "$ROOT/eval/acceptance/low/work/origin.git"
  git -C "$ROOT/eval/acceptance/low/work" push -u origin main
  printf '\n// R4 low-risk formatting update\n' >> "$ROOT/eval/acceptance/low/work/src/cart.ts"
else
  echo "$ROOT/eval/acceptance/low/work exists; leaving unchanged" >&2
fi
make_checkout_repo intent-missing 3a04f32:src/checkout.ts
make_checkout_repo intent-clean eval/regression/intent/work/src/checkout.ts
make_checkout_repo intent-negative eval/regression/intent/work/src/checkout.ts
