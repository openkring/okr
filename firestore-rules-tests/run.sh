#!/usr/bin/env bash
# Run the Firestore + Storage security-rules tests against the emulators.
# Usage: ./firestore-rules-tests/run.sh
set -euo pipefail
cd "$(dirname "$0")/.."
PROJECT="${RULES_TEST_PROJECT:-bkaiser-org}"

echo "== Firestore rules =="
npx firebase emulators:exec --only firestore --project "$PROJECT" \
  "python3 firestore-rules-tests/rules.test.py"

echo "== Storage rules =="
# firebase.json lists storage as a per-bucket array (default + private bucket),
# which the deploy accepts but the Storage emulator rejects ("Must supply
# 'target'"). The harness tests only the default bucket, so hand the emulator a
# copy of firebase.json with storage collapsed to that bucket's rules. The copy
# sits at the repo root so the relative rules paths still resolve.
EMU_CONFIG=".firebase.rules-test.json"
trap 'rm -f "$EMU_CONFIG"' EXIT
python3 - "$EMU_CONFIG" <<'PY'
import json, sys
cfg = json.load(open("firebase.json"))
cfg["storage"] = {"rules": "storage.rules"}
json.dump(cfg, open(sys.argv[1], "w"), indent=2)
PY
npx firebase emulators:exec --only firestore,storage --project "$PROJECT" \
  --config "$EMU_CONFIG" \
  "python3 firestore-rules-tests/storage.test.py"
