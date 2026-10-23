import * as admin from 'firebase-admin';
import { logger, setGlobalOptions } from 'firebase-functions/v2';

// Default instance ceiling for every function (an explicit per-function `maxInstances` still
// wins). Cloud Run reserves CPU per service × max instances; with ~270 functions at the default
// of 20 the europe-west6 CPU quota was exhausted and deploys left functions on stale revisions
// (2026-10-23). Club traffic needs far less than 5 instances per function.
// This file is imported first in main.ts, so it runs before any function is defined.
setGlobalOptions({ maxInstances: 5 });

// Initialize Firebase Admin SDK. This must be done only once.
admin.initializeApp();

// Initialize Admin SDK with explicit error handling
try {
  if (!admin.apps.length) {
    admin.initializeApp();
    logger.info('init: Admin SDK initialized successfully');
  }
} catch (error) {
  logger.error('init: Failed to initialize Admin SDK', { error });
  throw new Error('Admin SDK initialization failed');
}