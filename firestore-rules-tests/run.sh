#!/usr/bin/env bash
# Run the Firestore + Storage security-rules tests against the emulators.
# Usage: ./firestore-rules-tests/run.sh
set -euo pipefail
cd "$(dirname "$0")/.."
PROJECT="${RULES_TEST_PROJECT:-bkaiser-org}"

echo "== Firestore rules =="
npx firebase emulators:exec --only firestore --project "$PROJECT" \
  "python3 firestore-rules-tests/rules.test.py"

# firebase.json lists storage as a per-bucket array (default + private bucket),
# which the deploy accepts but the Storage emulator rejects ("Must supply
# 'target'"). The emulator also applies one ruleset to every bucket, so each
# bucket's rules get their own pass, with a copy of firebase.json whose storage
# is collapsed to those rules. The copy sits at the repo root so the relative
# rules paths still resolve.
EMU_CONFIG=".firebase.rules-test.json"
trap 'rm -f "$EMU_CONFIG"' EXIT
run_storage() { # <rules file> <test script>
  python3 - "$EMU_CONFIG" "$1" <<'PY'
import json, sys
cfg = json.load(open("firebase.json"))
cfg["storage"] = {"rules": sys.argv[2]}
json.dump(cfg, open(sys.argv[1], "w"), indent=2)
PY
  npx firebase emulators:exec --only firestore,storage --project "$PROJECT" \
    --config "$EMU_CONFIG" "python3 $2"
}

echo "== Storage rules (default bucket) =="
run_storage storage.rules firestore-rules-tests/storage.test.py

echo "== Storage rules (private bucket) =="
run_storage storage-private.rules firestore-rules-tests/storage-private.test.py
