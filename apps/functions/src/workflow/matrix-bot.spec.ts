import { afterEach, describe, expect, it, vi } from 'vitest';

import { joinBotToRoom } from './matrix-bot';

afterEach(() => vi.unstubAllGlobals());

describe('joinBotToRoom', () => {
  it('joins via the Synapse admin API with the admin token', async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return new Response('{}', { status: 200 });
    });

    await joinBotToRoom('!abc:matrix.example.org', '@bot:example.org', 'admin-token');

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toContain('/_synapse/admin/v1/join/');
    expect(calls[0].url).toContain(encodeURIComponent('!abc:matrix.example.org'));
    expect((calls[0].init.headers as Record<string, string>)['Authorization']).toBe('Bearer admin-token');
    expect(JSON.parse(calls[0].init.body as string)).toEqual({ user_id: '@bot:example.org' });
  });

  it('throws with the server text when the join is refused', async () => {
    vi.stubGlobal('fetch', async () => new Response('no such room', { status: 404 }));
    await expect(joinBotToRoom('!x:y', '@bot:y', 't')).rejects.toThrow(/no such room/);
  });

  // An ask room is per person and persists, so from the second report onwards the bot is
  // already a member. Synapse answers 403 M_FORBIDDEN — the desired end-state, not a failure.
  it('tolerates an already-joined bot', async () => {
    vi.stubGlobal('fetch', async () => new Response(
      JSON.stringify({ errcode: 'M_FORBIDDEN', error: '@okrbot:example.org is already in the room.' }),
      { status: 403 },
    ));
    await expect(joinBotToRoom('!x:y', '@okrbot:y', 't')).resolves.toBeUndefined();
  });
});
