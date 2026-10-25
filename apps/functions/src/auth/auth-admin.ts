/**
 * authAdmin — one router callable beside the 12 auth admin callables (TOC 3.41, A5).
 *
 * Each op runs the same handler as its stand-alone callable, which keeps its own role guard inside
 * the body (e.g. syncPersonAccount admits admin or memberAdmin, setPassword admins only); the
 * router checks nothing per op. The old names stay as aliases.
 */
import { makeOpRouter, type OpHandler } from '../_router';
import {
  handleCreateCustomToken,
  handleCreateFirebaseUser,
  handleDeleteFirebaseAuthUser,
  handleGetFirebaseUser,
  handleGetUidByEmail,
  handleListBkUsers,
  handleListFirebaseUsers,
  handleSetPassword,
  handleUpdateFirebaseUser,
} from './index';
import { handleSetLoginId, handleSwapLoginEmail } from './login-id-admin';
import { handleSyncPersonAccount } from './account-sync';

export const AUTH_ADMIN_OPS: Record<string, OpHandler> = {
  createCustomToken: handleCreateCustomToken,
  createFirebaseUser: handleCreateFirebaseUser,
  getUidByEmail: handleGetUidByEmail,
  getFirebaseUser: handleGetFirebaseUser,
  setPassword: handleSetPassword,
  updateFirebaseUser: handleUpdateFirebaseUser,
  listFirebaseUsers: handleListFirebaseUsers,
  listBkUsers: handleListBkUsers,
  deleteFirebaseAuthUser: handleDeleteFirebaseAuthUser,
  swapLoginEmail: handleSwapLoginEmail,
  setLoginId: handleSetLoginId,
  syncPersonAccount: handleSyncPersonAccount,
};

export const AUTH_ADMIN_OPTIONS = {
  cors: true,
  region: 'europe-west6',
  enforceAppCheck: true,
};

export const authAdmin = makeOpRouter('authAdmin', AUTH_ADMIN_OPTIONS, AUTH_ADMIN_OPS);
