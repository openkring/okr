/**
 * srv — one router callable beside the Regasoft SRV contact callables (TOC 3.41, A8).
 *
 * Each op runs the same handler as its stand-alone callable, which keeps its own guards
 * (auth + memberAdmin) and tenant handling inside the body; the router checks nothing per op.
 * The four old names stay as aliases with their own old options. `previewSrvUpdate` (spec 1.133
 * D12) and `getSrvMembersAll` (C1) are router-only: no stand-alone callable, no deployed function.
 */
import { makeOpRouter, type OpHandler } from '../_router';
import { SRV_SECRETS } from '../_gateway/adapters/srv';
import {
  handleCreateSrvContact,
  handleGetSrvContacts,
  handleGetSrvMemberDetail,
  handleGetSrvMembersAll,
  handlePreviewSrvUpdate,
  handleUpdateSrvContact,
} from './contact';

export const SRV_OPS: Record<string, OpHandler> = {
  getSrvContacts: handleGetSrvContacts,
  getSrvMemberDetail: handleGetSrvMemberDetail,
  getSrvMembersAll: handleGetSrvMembersAll,
  createSrvContact: handleCreateSrvContact,
  updateSrvContact: handleUpdateSrvContact,
  previewSrvUpdate: handlePreviewSrvUpdate,
};

export const SRV_OPTIONS = {
  cors: true,
  region: 'europe-west6',
  enforceAppCheck: true,
  secrets: SRV_SECRETS,
};

export const srv = makeOpRouter('srv', SRV_OPTIONS, SRV_OPS);
