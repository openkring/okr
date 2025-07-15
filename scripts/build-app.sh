#!/bin/sh

# Exit immediately if a command exits with a non-zero status.
set -e

# Set the application ID. It defaults to 'test-app' if the APP_ID env var is not set.
APP_ID=${APP_ID:-test-app}

echo "--- Preparing to build application: $APP_ID ---"

POLYFILL_PATH="./apps/$APP_ID/ssr-polyfills.js"

# Conditionally set NODE_OPTIONS only if the ssr-polyfills.js file exists for the target app.
if [ -f "$POLYFILL_PATH" ]; then
  echo "--- SSR polyfills found. Applying NODE_OPTIONS... ---"
  export NODE_OPTIONS="--require $POLYFILL_PATH"
fi

echo "--- Building application: $APP_ID with NODE_OPTIONS: $NODE_OPTIONS ---"
nx run "$APP_ID:build:production"