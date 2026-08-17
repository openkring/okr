import { describe, expect, it } from 'vitest';

import { askRoomAliasLocalpart, groupRoomAliasLocalpart } from './shared';

describe('askRoomAliasLocalpart', () => {
  it('derives a stable localpart from group + person', () => {
    expect(askRoomAliasLocalpart('scs_vorstand', 'kaiser')).toBe('ask_scs_vorstand_kaiser');
  });

  it('lowercases and sanitises both parts (Matrix allows only [a-z0-9._~-])', () => {
    expect(askRoomAliasLocalpart('Trainerteam', 'Müller Meier')).toBe('ask_trainerteam_m_ller_meier');
  });

  it('never collides with a group room alias', () => {
    expect(askRoomAliasLocalpart('support', 'x')).not.toBe(groupRoomAliasLocalpart('support'));
  });
});
