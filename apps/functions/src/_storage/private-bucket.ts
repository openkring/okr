import { getStorage } from 'firebase-admin/storage';

/**
 * The private Storage bucket (spec 2026-09-30 private media bucket): `<project>-private`.
 * Not linked to Firebase Storage and not an imgix source, so neither the client SDK nor the
 * public imgix source can read it — only Cloud Functions and admin scripts. The public default
 * bucket stays readable through imgix (`bkaiser.imgix.net`); anything personal belongs here.
 */
export function privateBucketName(projectId = process.env['GCLOUD_PROJECT'] ?? ''): string {
  if (!projectId) throw new Error('privateBucketName: no project id (GCLOUD_PROJECT unset)');
  return `${projectId}-private`;
}

export function privateBucket() {
  return getStorage().bucket(privateBucketName());
}
