#!/usr/bin/env bash
# Run the Firestore security-rules tests against the emulator.
# Usage: ./firestore-rules-tests/run.sh
set -euo pipefail
cd "$(dirname "$0")/.."
npx firebase emulators:exec --only firestore --project "${RULES_TEST_PROJECT:-bkaiser-org}" \
  "python3 firestore-rules-tests/rules.test.py"
