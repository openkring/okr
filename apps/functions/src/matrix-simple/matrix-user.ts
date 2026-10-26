/**
 * matrixUser — one router callable beside the user-facing Matrix chat callables (TOC 3.41, A2).
 *
 * Each op runs the same handler as its stand-alone callable, which keeps its own role guard and
 * rate-limit key (the old function name) inside the body; the router checks nothing per op.
 * 16 ops: the old names stay as aliases, except syncFirebaseProfileToMatrix, which is op-only.
 * setChatPins is not an op: its payload carries its own `op` field, which dispatchOp strips (R5).
 */
import { makeOpRouter, type OpHandler } from '../_router';
import { matrixAdminToken } from './shared';
import { handleAddAdhocChatMembers, handleCreateAdhocChat, handleLeaveAdhocChat, handleRemoveAdhocChatMember } from './adhoc-chat';
import { handleProvisionMatrixUser, handleSyncFirebaseProfileToMatrix } from './credentials';
import { handleResolveNotesRoom } from './notes-room';
import {
  handleArchivePinboard,
  handleCreatePinboard,
  handleJoinPinboard,
  handleLeavePinboard,
  handleListAvailablePinboards,
  handleUpdatePinboard,
} from './pinboard';
import { handleInvitePersonToGroupRoom, handleKickPersonFromGroupRoom, handleRequestGroupRoomAccess } from './rooms';

export const MATRIX_USER_OPS: Record<string, OpHandler> = {
  createAdhocChat: handleCreateAdhocChat,
  addAdhocChatMembers: handleAddAdhocChatMembers,
  leaveAdhocChat: handleLeaveAdhocChat,
  removeAdhocChatMember: handleRemoveAdhocChatMember,
  createPinboard: handleCreatePinboard,
  updatePinboard: handleUpdatePinboard,
  archivePinboard: handleArchivePinboard,
  leavePinboard: handleLeavePinboard,
  joinPinboard: handleJoinPinboard,
  listAvailablePinboards: handleListAvailablePinboards,
  invitePersonToGroupRoom: handleInvitePersonToGroupRoom,
  kickPersonFromGroupRoom: handleKickPersonFromGroupRoom,
  requestGroupRoomAccess: handleRequestGroupRoomAccess,
  resolveNotesRoom: handleResolveNotesRoom,
  provisionMatrixUser: handleProvisionMatrixUser,
  syncFirebaseProfileToMatrix: handleSyncFirebaseProfileToMatrix,
};

export const MATRIX_USER_OPTIONS = {
  cors: true,
  region: 'europe-west6',
  enforceAppCheck: true,
  secrets: [matrixAdminToken],
};

export const matrixUser = makeOpRouter('matrixUser', MATRIX_USER_OPTIONS, MATRIX_USER_OPS);
