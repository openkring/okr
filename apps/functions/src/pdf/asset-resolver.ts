import { getStorage } from 'firebase-admin/storage';
import type { TemplateAssetRef } from '@bk2/shared-models';

interface CachedUrl {
  url: string;
  expires: number;
}

const urlCache = new Map<string, CachedUrl>();
const TTL_MS = 50 * 60 * 1000; // 50 minutes

export async function resolveAssetUrls(
  assets: TemplateAssetRef[]
): Promise<Record<string, string>> {
  const resolved: Record<string, string> = {};
  const bucket = getStorage().bucket();
  const now = Date.now();

  for (const asset of assets) {
    const cached = urlCache.get(asset.storagePath);
    if (cached && cached.expires > now) {
      resolved[asset.key] = cached.url;
      continue;
    }
    const [url] = await bucket.file(asset.storagePath).getSignedUrl({
      action: 'read',
      expires: now + TTL_MS,
    });
    urlCache.set(asset.storagePath, { url, expires: now + TTL_MS });
    resolved[asset.key] = url;
  }
  return resolved;
}
