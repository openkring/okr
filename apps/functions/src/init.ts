import * as admin from 'firebase-admin';
import { logger } from 'firebase-functions/v2';

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