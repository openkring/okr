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
 *  - membership-sync.ts Firestore trigger + reconcile (membership → room sync)
 */

export * from './shared';
export * from './credentials';
export * from './rooms';
export * from './push';
