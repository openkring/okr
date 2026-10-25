import { getStorage } from 'firebase-admin/storage';

import {
  BUNDESLAENDER_DIR, buildCatalog, GEMEINDE_REGISTRY_PATH, KANTONE_DIR, LAENDER_DIR,
  LocationAvatarCatalog, parseGemeindeRegistry,
} from './location-avatar.util';

/**
 * Builds the catalog from the default bucket: registry.csv for the Gemeinden, a listing of
 * kantone / deutschland_bundeslaender / laender for the fallbacks (so a missing file falls through
 * to the next level instead of producing a broken picture).
 * No @okr imports: scripts/backfill-location-avatars.ts loads this file under ts-node.
 */
export async function loadLocationAvatarCatalog(): Promise<LocationAvatarCatalog> {
  const bucket = getStorage().bucket();
  const [registry] = await bucket.file(GEMEINDE_REGISTRY_PATH).download();
  const listings = await Promise.all(
    [KANTONE_DIR, BUNDESLAENDER_DIR, LAENDER_DIR].map((prefix) => bucket.getFiles({ prefix }))
  );
  const files = listings.flatMap(([objects]) => objects.map((o) => o.name));
  return buildCatalog(parseGemeindeRegistry(registry.toString('utf8')), files);
}

const TTL_MS = 60 * 60 * 1000;
let cached: { at: number; catalog: Promise<LocationAvatarCatalog> } | undefined;

/** Per-instance cache: a warm instance does not re-download registry.csv on every location write. */
export function getLocationAvatarCatalog(): Promise<LocationAvatarCatalog> {
  if (!cached || Date.now() - cached.at > TTL_MS) {
    const catalog = loadLocationAvatarCatalog();
    cached = { at: Date.now(), catalog };
    catalog.catch(() => { cached = undefined; });
  }
  return cached.catalog;
}
