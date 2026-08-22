// apps/functions/src/diary/drive-client.ts
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const DRIVE_API = 'https://www.googleapis.com/drive/v3';

/**
 * Exchange the long-lived refresh token for a short-lived access token.
 *
 * A service account cannot be used here: it has no storage quota and cannot own files, so any
 * upload into My Drive fails with storageQuotaExceeded. The usual escapes — Shared Drives and
 * domain-wide delegation — both require Google Workspace, which this account does not have.
 * Acting as the user through OAuth is the only path that works, and it needs the full `drive`
 * scope because the archive was created outside this app (`drive.file` sees only app-created files).
 */
export async function getDriveAccessToken(
  refreshToken: string,
  clientId: string,
  clientSecret: string,
): Promise<string> {
  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  });
  if (!response.ok) {
    throw new Error(`drive token exchange failed: ${response.status} ${await response.text()}`);
  }
  const json = (await response.json()) as { access_token?: string };
  if (!json.access_token) {
    throw new Error('drive token exchange returned no access_token');
  }
  return json.access_token;
}

/** GET against the Drive v3 API with an access token. `path` starts with a slash, e.g. '/files'. */
export async function driveFetch(
  token: string,
  path: string,
  params: Record<string, string>,
): Promise<Response> {
  const url = `${DRIVE_API}${path}?${new URLSearchParams(params)}`;
  return fetch(url, { headers: { Authorization: `Bearer ${token}` } });
}
