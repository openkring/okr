#!/usr/bin/env bash
# Non-interactive release wrapper (for a Claude session or CI):
#   scripts/release-app.sh all <patch|minor|major> [--native]   release all eight apps at one new version
#   scripts/release-app.sh <app> none                          repair: re-deploy ONE app at the current,
#                                                              already tagged version (no bump/commit/tag)
# `all` passes --yes (the single go/no-go) and, only when the feature catalogue drifts, --accept-drift.
# Nothing is piped in: stdin is /dev/null, so every remaining prompt takes its default.
# This wrapper does NOT source any app .env for `all`: the orchestrator hands each child its own
# scrubbed environment, and a sourced .env would leak one tenant's Firebase config into every app's
# build. (A repair is a single app, so it sources just that app's .env — see below.)
set -euo pipefail

usage() {
  cat >&2 <<'USAGE'
usage: scripts/release-app.sh all <patch|minor|major> [--native]
       scripts/release-app.sh <app> none
USAGE
  exit 2
}

[ "$#" -ge 2 ] || usage
target="$1"; kind="$2"; native=''
if [ "$target" = all ]; then
  case "$kind" in patch|minor|major) ;; *) usage ;; esac
  if [ "$#" -eq 3 ]; then
    [ "$3" = --native ] || usage
    native='--native'
  elif [ "$#" -gt 3 ]; then
    usage
  fi
else
  # a single app is only ever repaired: `<app> none`, nothing else
  [ "$kind" = none ] && [ "$#" -eq 2 ] || usage
  case "$target" in *-app) ;; *) usage ;; esac
fi

cd "$(dirname "$0")/.."
[ "$target" = all ] || [ -d "apps/$target" ] || usage
unset NX_WORKSPACE_ROOT_PATH
export CI=true

# A dirty tree (often another session's WIP) would make the dirty-tree gate the first prompt;
# refuse up front instead of aborting after a full test run.
# `planning` is exempt: parallel sessions edit specs there constantly, and a release never ships it.
if [ -n "$(git status --porcelain -- . ':(exclude)planning')" ]; then
  echo "✖ release-app: working tree is dirty — commit or wait, then re-run:" >&2
  git status --short -- . ':(exclude)planning' >&2
  exit 3
fi

if [ "$target" = all ]; then
  # the drift gate asks only when drift exists; pass --accept-drift only then
  set +e; node scripts/check-feature-catalogue.mjs >/dev/null 2>&1; rc=$?; set -e
  args=(all "$kind" --yes)
  [ "$rc" -eq 1 ] && args+=(--accept-drift)
  [ -n "$native" ] && args+=("$native")
  exec node scripts/release.mjs "${args[@]}" </dev/null
fi

# Repair: one app, so its own .env (SENTRY_* for the source-map upload, FIREBASE_WEBAPP_CONFIG)
# is sourced here, scoped to this single run. Prompts left (all on their default, stdin is
# /dev/null): "Not on main — continue?" (default no: aborts off main), deploy to hosting
# (default yes), the push of the ngsw commit / tag / pointer bump (default yes). A failed
# live-version check aborts (default no).
[ -f "apps/$target/.env" ] || { echo "✖ release-app: apps/$target/.env is missing" >&2; exit 2; }
set -a; source "./apps/$target/.env"; set +a
exec node scripts/release.mjs "$target" none </dev/null
