// The openChat dispatch path, stubbed at its seams: Firestore (the group + its memberships),
// the Matrix helpers, and the bot's post. What is worth testing here is the ORDER of the two
// side effects and the two refusals — everything else in this file is HTTP plumbing that
// matrix-simple owns and tests separately.

import { beforeEach, describe, expect, it, vi } from 'vitest';

const calls: string[] = [];
const posted: { roomId: string; body: string }[] = [];
const joined: { roomId: string; personKey: string }[] = [];

let group: Record<string, unknown> | undefined;
let memberKeys: string[] = [];

vi.mock('../matrix-simple/shared', () => ({
  MATRIX_HOMESERVER: 'https://matrix.example.org',
  matrixAdminToken: { value: () => 'admin-token' },
  activeGroupMemberKeys: async () => memberKeys,
  resolveChatRoomForPerson: async () => {
    calls.push('resolve');
    return '!room:example.org';
  },
  ensurePersonInRoom: async (roomId: string, personKey: string) => {
    calls.push('join');
    joined.push({ roomId, personKey });
    return `@${personKey.toLowerCase()}:example.org`;
  },
}));

vi.mock('./matrix-bot', () => ({
  matrixBotToken: { value: () => 'bot-token' },
  postGroupChatMessage: async (roomId: string, body: string) => {
    calls.push('post');
    posted.push({ roomId, body });
  },
  sendBotDirectMessage: async () => undefined,
}));

vi.mock('firebase-admin/firestore', () => ({
  FieldValue: { serverTimestamp: () => 'ts' },
  getFirestore: () => ({
    collection: () => ({
      doc: () => ({ get: async () => ({ data: () => group, exists: !!group }) }),
      add: async () => undefined,
    }),
  }),
}));

import { dispatch, OutboxDoc } from './outbox';

const PERSON = 'anna';

function doc(): OutboxDoc {
  return {
    tenants: ['scs'],
    kind: 'openChat',
    ruleKey: 'r1',
    day: '20260825',
    payload: {
      groupId: 'ausschuss_boote',
      personKey: PERSON,
      body: 'Steuerseil gerissen',
      txnId: 'wf-r1-0-damage-t1',
    },
  };
}

beforeEach(() => {
  calls.length = 0;
  posted.length = 0;
  joined.length = 0;
  memberKeys = [];
  group = { chatMode: 'ask', isArchived: false };
});

describe('dispatch openChat', () => {
  it('joins the reporter into the room BEFORE the report is posted into it', async () => {
    await dispatch(doc());

    expect(calls).toEqual(['resolve', 'join', 'post']);
    expect(joined).toEqual([{ roomId: '!room:example.org', personKey: PERSON }]);
    expect(posted).toEqual([{ roomId: '!room:example.org', body: 'Steuerseil gerissen' }]);
  });

  it('refuses an archived group and posts nothing', async () => {
    group = { chatMode: 'ask', isArchived: true };

    await expect(dispatch(doc())).rejects.toThrow(/archived/);
    expect(calls).toEqual([]);
    expect(posted).toEqual([]);
  });

  it("refuses a 'shared' group the person is not a member of, and posts nothing", async () => {
    group = { chatMode: 'shared', isArchived: false };
    memberKeys = ['bruno'];

    await expect(dispatch(doc())).rejects.toThrow(/not a member/);
    expect(calls).toEqual([]);
    expect(posted).toEqual([]);
  });

  it("posts normally in a 'shared' group the person IS a member of", async () => {
    group = { chatMode: 'shared', isArchived: false };
    memberKeys = ['Anna'];        // Firestore keys are case-sensitive, Matrix localparts are not

    await dispatch(doc());

    expect(calls).toEqual(['resolve', 'join', 'post']);
    expect(posted).toHaveLength(1);
  });
});
