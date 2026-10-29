#!/bin/bash
set -euo pipefail
ROOT=$(cd "$(dirname "$0")/../.." && pwd)
FIXTURES="$ROOT/eval/fixtures"
RESET=0
if [[ "${1:-}" == "--reset" ]]; then
  RESET=1
elif [[ $# -gt 0 ]]; then
  echo "usage: bash eval/acceptance/prepare.sh [--reset]" >&2
  exit 2
fi

prepare_work() {
  local work=$1
  if [[ -d "$work" && "$RESET" == "1" ]]; then
    if [[ ! -x /usr/bin/trash ]]; then
      echo "--reset requires /usr/bin/trash on macOS; existing work was left unchanged: $work" >&2
      exit 1
    fi
    /usr/bin/trash "$work"
  fi
  if [[ -d "$work" ]]; then
    echo "$work exists; leaving unchanged" >&2
    return 1
  fi
  return 0
}

make_checkout_repo() {
  local name=$1
  local source=$2
  local work="$ROOT/eval/acceptance/$name/work"
  prepare_work "$work" || return 0
  mkdir -p "$work/src"
  cp "$FIXTURES/checkout-base.ts" "$work/src/checkout.ts"
  git init -b main "$work" >/dev/null
  git -C "$work" add src/checkout.ts
  git -C "$work" -c user.name='R4 Fixture' -c user.email='r4@localhost' commit -m 'initial checkout' >/dev/null
  git init --bare "$work/origin.git" >/dev/null
  git -C "$work" remote add origin "$work/origin.git"
  git -C "$work" push -u origin main >/dev/null
  cp "$FIXTURES/$source" "$work/src/checkout.ts"
}

make_checkout_repo high checkout-buggy.ts
make_checkout_repo reopen checkout-buggy.ts
make_checkout_repo human checkout-buggy.ts
make_checkout_repo intent-missing checkout-buggy.ts
make_checkout_repo intent-clean checkout-clean.ts
make_checkout_repo intent-negative checkout-clean.ts

LOW="$ROOT/eval/acceptance/low/work"
prepare_work "$LOW" || exit 0
mkdir -p "$LOW/src"
cp "$FIXTURES/cart.ts" "$LOW/src/cart.ts"
cp "$FIXTURES/cart.test.ts" "$LOW/src/cart.test.ts"
git init -b main "$LOW" >/dev/null
git -C "$LOW" add src
git -C "$LOW" -c user.name='R4 Fixture' -c user.email='r4@localhost' commit -m 'initial pure cart utility' >/dev/null
git init --bare "$LOW/origin.git" >/dev/null
git -C "$LOW" remote add origin "$LOW/origin.git"
git -C "$LOW" push -u origin main >/dev/null
cp "$FIXTURES/cart-formatted.ts" "$LOW/src/cart.ts"
