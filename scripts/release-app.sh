#!/usr/bin/env bash
# Non-interactive single-app release: scripts/release-app.sh <app> <minor|patch|major|none>
# Answers the drift gate with y (only when drift exists) and the bump prompt with <kind>;
# every later gate takes its default (deploy/push yes, a failed live-version check aborts).
set -euo pipefail
app="${1:?usage: scripts/release-app.sh <app> <minor|patch|major|none>}"
kind="${2:?usage: scripts/release-app.sh <app> <minor|patch|major|none>}"
case "$kind" in minor|patch|major|none) ;; *) echo "invalid kind: $kind" >&2; exit 2 ;; esac

cd "$(dirname "$0")/.."
unset NX_WORKSPACE_ROOT_PATH
export CI=true
set -a; source "./apps/$app/.env"; set +a

# A dirty tree (often another session's WIP) would make the dirty-tree gate the first prompt and
# eat the drift answer; refuse up front instead of aborting after a full test run.
if [ -n "$(git status --porcelain)" ]; then
  echo "✖ release-app: working tree is dirty — commit or wait, then re-run:" >&2
  git status --short >&2
  exit 3
fi

# the drift prompt is conditional — an unconditional y would land on the bump prompt (→ patch)
set +e; node scripts/check-feature-catalogue.mjs >/dev/null 2>&1; rc=$?; set -e
drift=''; [ "$rc" -eq 1 ] && drift='y\n'

printf "${drift}%s\n" "$kind" | node scripts/release.mjs "$app"
