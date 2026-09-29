/** Minimal read-only bexio REST client for the archive export (spec 1.68). GET only; never logs the token. */
const BASE = 'https://api.bexio.com';
const MAX_RETRIES = 6;

export function createBexioClient({ token, fetchImpl = fetch, sleep = (ms) => new Promise(r => setTimeout(r, ms)) }) {
  async function request(path, params, asBuffer = false) {
    const url = new URL(BASE + path);
    for (const [k, v] of Object.entries(params ?? {})) url.searchParams.set(k, String(v));
    for (let attempt = 0; ; attempt++) {
      const r = await fetchImpl(url.toString(), { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } });
      if (r.status === 429 && attempt < MAX_RETRIES) {
        const after = parseInt(r.headers.get('retry-after') ?? '', 10);
        await sleep(Number.isFinite(after) && after > 0 ? after * 1000 : Math.min(1000 * 2 ** attempt, 30000));
        continue;
      }
      if (r.status === 404) return null;
      if (!r.ok) throw new Error(`bexio ${r.status} on ${path}`);
      return asBuffer ? Buffer.from(await r.arrayBuffer()) : r.json();
    }
  }
  return {
    get: (path, params) => request(path, params),
    download: (fileId) => request(`/3.0/files/${fileId}/download`, undefined, true),
    /** v2/v3 lists: offset paging until a short page. */
    async getAll(path, pageSize = 2000) {
      const all = [];
      for (let offset = 0; ; offset += pageSize) {
        const page = (await request(path, { limit: pageSize, offset })) ?? [];
        all.push(...page);
        if (page.length < pageSize) return all;
      }
    },
    /** v4 lists: { data, paging } envelope, page paging. */
    async getV4All(path, params = {}, pageSize = 500) {
      const all = [];
      for (let page = 1; ; page++) {
        const r = await request(path, { ...params, limit: pageSize, page });
        all.push(...(r?.data ?? []));
        if (!r?.paging || page >= r.paging.page_count) return all;
      }
    },
  };
}
