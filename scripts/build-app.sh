#!/bin/sh

# Exit immediately if a command exits with a non-zero status.
set -e

# Set the application ID. It defaults to 'test-app' if the APP_ID env var is not set.
APP_ID=${APP_ID:-test-app}

echo "--- Preparing to build application: $APP_ID ---"

FIREBASE_CONFIG_PATH="./apps/$APP_ID/firebase.json"

# Conditionally copy the app-specific firebase.json if it exists. This ensures the correct environment is set up for the build.
if [ -f "$FIREBASE_CONFIG_PATH" ]; then
  echo "--- App-specific firebase.json found. Copying to root... ---"
  cp "$FIREBASE_CONFIG_PATH" ./firebase.json
else
  echo "--- No app-specific firebase.json found for $APP_ID. Using existing root config. ---"
fi

POLYFILL_PATH="./apps/$APP_ID/ssr-polyfills.js"

# Conditionally set NODE_OPTIONS only if the ssr-polyfills.js file exists for the target app.
if [ -f "$POLYFILL_PATH" ]; then
  echo "--- SSR polyfills found. Applying NODE_OPTIONS... ---"
  export NODE_OPTIONS="--require $POLYFILL_PATH"
  echo "NODE_OPTIONS=$NODE_OPTIONS"
fi

echo "--- Starting build for application: $APP_ID ---"
nx run "$APP_ID:build:production"