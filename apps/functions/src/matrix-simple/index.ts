/**
 * matrix-simple — Firebase ↔ Matrix integration (token exchange approach).
 *
 * Firebase is the identity provider; Matrix accounts are admin-provisioned and
 * password-less. The client exchanges its Firebase auth for a short-lived Matrix
 * access token via getMatrixCredentials (much simpler and more reliable than the
 * removed OIDC bridge, at the cost of the app managing token refresh itself).
 *
 * Modules (split from the former single-file implementation, design review #4 /
 * ARCH-2 — planning/specs/2026-07-05-chat-design-review-spec.md):
 *  - shared.ts          config, secrets, authorization gates, Synapse helpers
 *  - credentials.ts     token exchange, user provisioning, profile sync, deactivation
 *  - rooms.ts           group-room resolve/access/invite/kick + admin room management
 *  - push.ts            call notifications, pusher registration, push gateway
 *  - tenant-backfill.ts backfill of the org.okr.tenant room marker
 *  - membership-sync.ts Firestore trigger + reconcile (membership → room sync)
 *  - adhoc-chat.ts      ad-hoc chats (a group document with kind: 'chat')
 *  - notes-room.ts      «Notizen an mich» room per (person, tenant), chat bookmarks (1.104)
 *  - chat-reminders.ts  sendChatReminders: 5-minute sweep, bot reply for due chat reminders (1.104)
 *  - pinboard.ts        Pinnwand (a group document with kind: 'pinboard')
 *  - room-assignment.ts manual tenant assignment of a room the backfill cannot derive
 */

export * from './shared';
export * from './credentials';
export * from './rooms';
export * from './push';
export * from './tenant-backfill';
export * from './adhoc-chat';
export * from './notes-room';
export * from './chat-reminders';
export * from './pinboard';
export * from './room-assignment';
