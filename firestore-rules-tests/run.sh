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
npx firebase emulators:exec --only firestore,storage --project "$PROJECT" \
  "python3 firestore-rules-tests/storage.test.py"
