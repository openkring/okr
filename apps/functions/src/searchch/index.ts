// The `searchChSearchPerson` callable moved onto the external-data gateway
// (1.18) — see `_gateway/adapters/searchch.ts`. Only the feed parser lives here
// now; it stays in this folder because it is provider-shaped, not gateway-shaped,
// and its unit tests sit next to it.
export { parseTelFeed, feedUpdatedAt } from './parse';
export type { PersonDirectoryResult } from './parse';
