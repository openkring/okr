/**
 * matrixAdmin — one router callable beside the 19 Matrix admin callables (TOC 3.41, A1).
 *
 * Each op runs the same handler as its stand-alone callable, which keeps its own role / operator
 * guard inside the body; the router checks nothing per op. The old names stay as aliases.
 */
import { makeOpRouter, type OpHandler } from '../_router';
import { matrixAdminToken } from './shared';
import {
  handleDeactivateMatrixUser,
  handleRepairMatrixAvatars,
  handleRepairMatrixDisplayNames,
} from './credentials';
import { handleAuditGroupRoomMembers, handlePruneGroupRoomExtras, handleReconcileGroupRoomMembers } from './membership-sync';
import { handleSyncRoomPostPolicy } from './post-policy-sync';
import { handleAssignMatrixRoomTenants, handleListUnassignedMatrixRooms } from './room-assignment';
import {
  handleAddMatrixRoomAlias,
  handleDeleteMatrixRoom,
  handleGetAllMembersFromRoom,
  handleGetMemberDetails,
  handleGetRoomDetails,
  handleGetRoomMessages,
  handleListMatrixRooms,
  handleRenameMatrixRoom,
  handleSetKioskCallRoomPolicy,
} from './rooms';
import { handleBackfillMatrixRoomTenants } from './tenant-backfill';

export const MATRIX_ADMIN_OPS: Record<string, OpHandler> = {
  listMatrixRooms: handleListMatrixRooms,
  getRoomDetails: handleGetRoomDetails,
  getAllMembersFromRoom: handleGetAllMembersFromRoom,
  getRoomMessages: handleGetRoomMessages,
  getMemberDetails: handleGetMemberDetails,
  addMatrixRoomAlias: handleAddMatrixRoomAlias,
  deleteMatrixRoom: handleDeleteMatrixRoom,
  renameMatrixRoom: handleRenameMatrixRoom,
  setKioskCallRoomPolicy: handleSetKioskCallRoomPolicy,
  deactivateMatrixUser: handleDeactivateMatrixUser,
  repairMatrixDisplayNames: handleRepairMatrixDisplayNames,
  repairMatrixAvatars: handleRepairMatrixAvatars,
  backfillMatrixRoomTenants: handleBackfillMatrixRoomTenants,
  listUnassignedMatrixRooms: handleListUnassignedMatrixRooms,
  assignMatrixRoomTenants: handleAssignMatrixRoomTenants,
  auditGroupRoomMembers: handleAuditGroupRoomMembers,
  pruneGroupRoomExtras: handlePruneGroupRoomExtras,
  reconcileGroupRoomMembers: handleReconcileGroupRoomMembers,
  syncRoomPostPolicy: handleSyncRoomPostPolicy,
};

// 540 s is needed by backfillMatrixRoomTenants only; it changes nothing for the other ops.
export const MATRIX_ADMIN_OPTIONS = {
  cors: true,
  region: 'europe-west6',
  enforceAppCheck: true,
  secrets: [matrixAdminToken],
  timeoutSeconds: 540,
};

export const matrixAdmin = makeOpRouter('matrixAdmin', MATRIX_ADMIN_OPTIONS, MATRIX_ADMIN_OPS);
