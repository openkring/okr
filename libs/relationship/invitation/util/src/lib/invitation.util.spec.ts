import { AvatarInfo } from '@okr/shared-models';
import {
  createPersonAvatar, getInvitationIndex, getInvitationIndexInfo, getLockCommentKey, getResponseComment,
  hasResponded, isInvitation, normaliseInvitation, sortInvitees, toStoreDateTime
} from './invitation.util';
import { InvitationModel } from '@okr/shared-models';
import { describe, expect, it } from 'vitest';

describe('invitation.util', () => {
  const tenantId = 'tenant-123';

  const mockInvitation: InvitationModel = {
    okey: 'inv-1',
    tenants: [tenantId],
    isArchived: false,
    index: '',
    tags: 'testtag',
    name: 'Test Invitation',
    notes: 'test invitation notes',
    caleventKey: 'event-1',
    inviteeKey: 'user-2',
    inviteeFirstName: 'Jane',
    inviteeLastName: 'Doe',
    inviterKey: 'user-1',
    inviterFirstName: 'John',
    inviterLastName: 'Smith',
    state: 'pending',
    date: '20251201',
    role: 'required',
    sentAt: '20241101',
    respondedAt: '',
    isLocked: false,
  };

  describe('isInvitation', () => {
    it('should return true for valid InvitationModel', () => {
      expect(isInvitation(mockInvitation, tenantId)).toBe(true);
    });

    it('should return false for an object that does not belong to the tenant', () => {
      const invalid = { ...mockInvitation, tenants: ['other-tenant'] };
      expect(isInvitation(invalid, tenantId)).toBe(false);
    });

    it('should return false for a non-model value', () => {
      expect(isInvitation(undefined, tenantId)).toBe(false);
      expect(isInvitation('not-an-object', tenantId)).toBe(false);
    });

    it('should return false for wrong tenantId', () => {
      expect(isInvitation(mockInvitation, 'wrong-tenant')).toBe(false);
    });
  });

  describe('createPersonAvatar', () => {
    it('should create AvatarInfo with correct label', () => {
      const avatar = createPersonAvatar('key-1', 'Max', 'Mustermann');

      expect(avatar).toEqual({
        key: 'key-1',
        name1: 'Max',
        name2: 'Mustermann',
        modelType: 'person',
        type: '',
        subType: '',
        label: 'Max Mustermann',
      } as AvatarInfo);
    });

    it('should trim whitespace in label', () => {
      const avatar = createPersonAvatar('k', '  Alice  ', '  Wonder  ');
      expect(avatar.label).toBe('Alice Wonder');
    });
  });

  describe('getInvitationIndex', () => {
    it('should generate correct index string', () => {
      const index = getInvitationIndex(mockInvitation);

      // Expected format: i:<invitee name> d:<date> n:<event name>
      expect(index).toBe('i:Jane Doe d:20251201 n:Test Invitation');
    });
  });

  describe('getInvitationIndexInfo', () => {
    it('should return static info string', () => {
      expect(getInvitationIndexInfo()).toBe(
        'i:<invitee name> d:<date> n:<event name>'
      );
    });
  });

  /*-------------------------- responses --------------------------------*/
  const inv = (over: Partial<InvitationModel>): InvitationModel => ({ ...mockInvitation, ...over });

  describe('getResponseComment', () => {
    it('returns the bare i18n key when no note was typed', () => {
      expect(getResponseComment('accepted')).toBe('@relationship/invitation/feature.comment.accepted');
    });

    it('appends the invitee note after the key', () => {
      expect(getResponseComment('declined', 'bin im Urlaub'))
        .toBe('@relationship/invitation/feature.comment.declined bin im Urlaub');
    });

    it('ignores a note that is only whitespace', () => {
      expect(getResponseComment('maybe', '   ')).toBe('@relationship/invitation/feature.comment.maybe');
    });
  });

  describe('getLockCommentKey', () => {
    it('distinguishes lock from release', () => {
      expect(getLockCommentKey(true)).toBe('@relationship/invitation/feature.comment.locked');
      expect(getLockCommentKey(false)).toBe('@relationship/invitation/feature.comment.unlocked');
    });
  });

  describe('hasResponded', () => {
    it('needs both a non-pending state and a timestamp', () => {
      expect(hasResponded(inv({ state: 'accepted', respondedAt: '20260101120000' }))).toBe(true);
      expect(hasResponded(inv({ state: 'pending', respondedAt: '20260101120000' }))).toBe(false);
      expect(hasResponded(inv({ state: 'accepted', respondedAt: '' }))).toBe(false);
    });
  });

  describe('sortInvitees', () => {
    it('puts answered invitations first, oldest response first', () => {
      const late = inv({ okey: 'late', state: 'accepted', respondedAt: '20260301090000' });
      const early = inv({ okey: 'early', state: 'declined', respondedAt: '20260101080000' });
      const middle = inv({ okey: 'middle', state: 'maybe', respondedAt: '20260201100000' });
      expect(sortInvitees([late, early, middle]).map(i => i.okey)).toEqual(['early', 'middle', 'late']);
    });

    it('appends unanswered invitations, sorted by invitee name', () => {
      const answered = inv({ okey: 'a', state: 'accepted', respondedAt: '20260101080000' });
      const zora = inv({ okey: 'z', state: 'pending', respondedAt: '', inviteeLastName: 'Zora' });
      const abt = inv({ okey: 'b', state: 'pending', respondedAt: '', inviteeLastName: 'Abt' });
      expect(sortInvitees([zora, answered, abt]).map(i => i.okey)).toEqual(['a', 'b', 'z']);
    });

    it('sorts a legacy StoreDate response before a same-day StoreDateTime one', () => {
      const legacy = inv({ okey: 'legacy', state: 'accepted', respondedAt: '20260101' });
      const modern = inv({ okey: 'modern', state: 'accepted', respondedAt: '20260101093000' });
      expect(sortInvitees([modern, legacy]).map(i => i.okey)).toEqual(['legacy', 'modern']);
    });

    it('does not mutate the input array', () => {
      const list = [
        inv({ okey: 'b', state: 'accepted', respondedAt: '20260201' }),
        inv({ okey: 'a', state: 'accepted', respondedAt: '20260101' })
      ];
      sortInvitees(list);
      expect(list.map(i => i.okey)).toEqual(['b', 'a']);
    });
  });

  describe('toStoreDateTime', () => {
    it('pads a legacy StoreDate with midnight', () => {
      expect(toStoreDateTime('20241101')).toBe('20241101000000');
    });

    it('leaves a StoreDateTime and an empty value alone', () => {
      expect(toStoreDateTime('20241101143000')).toBe('20241101143000');
      expect(toStoreDateTime('')).toBe('');
      expect(toStoreDateTime(undefined)).toBe('');
    });
  });

  describe('normaliseInvitation', () => {
    it('upgrades legacy timestamps and defaults a missing isLocked', () => {
      // Firestore reads bypass the model defaults: isLocked really is absent on legacy documents
      const legacy = { ...mockInvitation, sentAt: '20241101', respondedAt: '20241105', isLocked: undefined } as unknown as InvitationModel;
      const result = normaliseInvitation(legacy);
      expect(result?.sentAt).toBe('20241101000000');
      expect(result?.respondedAt).toBe('20241105000000');
      expect(result?.isLocked).toBe(false);
    });

    it('passes undefined through', () => {
      expect(normaliseInvitation(undefined)).toBeUndefined();
    });
  });
});
