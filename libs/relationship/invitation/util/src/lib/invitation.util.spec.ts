import { AvatarInfo } from '@bk2/shared-models';
import { createPersonAvatar, getInvitationIndex, getInvitationIndexInfo, isInvitation } from './invitation.util';
import { InvitationModel } from '@bk2/shared-models';
import { describe, expect, it } from 'vitest';

describe('invitation.util', () => {
  const tenantId = 'tenant-123';

  const mockInvitation: InvitationModel = {
    bkey: 'inv-1',
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
  };

  describe('isInvitation', () => {
    it('should return true for valid InvitationModel', () => {
      expect(isInvitation(mockInvitation, tenantId)).toBe(true);
    });

    it('should return false for missing properties', () => {
      const invalid = { ...mockInvitation, inviteeFirstName: undefined };
      expect(isInvitation(invalid, tenantId)).toBe(false);
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

      // Expected format: d:<date> ir:<inviter name> ie:<invitee name>
      expect(index).toContain('d:20251201'); 
      expect(index).toContain('ir:John Smith');
      expect(index).toContain('ie:Jane Doe');
      expect(index.split(' ')).toHaveLength(3);
    });
  });

  describe('getInvitationIndexInfo', () => {
    it('should return static info string', () => {
      expect(getInvitationIndexInfo()).toBe(
        'd:<date> ir:<inviter name> ie:<invitee name>'
      );
    });
  });
});