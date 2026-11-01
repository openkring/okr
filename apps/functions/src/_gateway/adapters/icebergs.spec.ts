// apps/functions/src/_gateway/adapters/icebergs.spec.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../http', () => ({ gatewayFetch: vi.fn() }));
import { gatewayFetch } from '../http';
import { byuIcebergsAdapter } from './icebergs';

const PAGE = `<p>* Last revised: 11:32:50 10/23/26</p><table><tr><td>Iceberg</td><td>Longitude</td><td>Latitude</td><td>Day</td></tr>
<tr><td>a81</td><td>38 20'W</td><td> 54 52'S</td><td> 292</td></tr></table>`;

describe('byuIcebergsAdapter', () => {
  beforeEach(() => vi.mocked(gatewayFetch).mockReset());

  it('is a shared open-data adapter with a 30-day TTL', () => {
    expect(byuIcebergsAdapter.scope).toBe('shared');
    expect(byuIcebergsAdapter.secrets).toEqual([]);
    expect(byuIcebergsAdapter.ttlSeconds).toBe(30 * 24 * 60 * 60);
  });

  it('caches the parsed snapshot, stamped with the revision date', async () => {
    vi.mocked(gatewayFetch).mockResolvedValue({ data: PAGE } as never);
    const raw = await byuIcebergsAdapter.fetch({}, { tenantId: '', uid: 'u', isAdmin: false });
    expect(raw.icebergs).toEqual([{ name: 'A81', lat: -54.8667, lng: -38.3333, seenAt: '20261019' }]);
    expect(byuIcebergsAdapter.sourceTimestamp(raw)).toBe('20261023');
  });

  it('throws on a page without icebergs, so the last good snapshot stays', async () => {
    vi.mocked(gatewayFetch).mockResolvedValue({ data: '<html>maintenance</html>' } as never);
    await expect(byuIcebergsAdapter.fetch({}, { tenantId: '', uid: 'u', isAdmin: false })).rejects.toThrow(/no iceberg rows/);
  });
});
