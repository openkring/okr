import { describe, expect, it } from 'vitest';

import { DeliveryChannel, FileTransferModel } from '@okr/shared-models';

import { fileTransferCardContent, fileTransferEmail, mayPostCard, planNotifications, recipientsForSend } from './file-transfer-notify';

function transfer(): FileTransferModel {
  const t = new FileTransferModel('scs');
  t.okey = 't1';
  t.senderName = 'Anna Muster';
  t.message = 'Video vom Training';
  t.expiresAt = '2026-10-29T10:00:00.000Z';
  t.files = [
    { index: 0, name: 'a.mov', size: 10, contentType: 'video/quicktime', path: 'p0', uploaded: true },
    { index: 1, name: 'b.mov', size: 20, contentType: 'video/quicktime', path: 'p1', uploaded: true },
  ];
  return t;
}

describe('file-transfer-notify', () => {
  it('card carries sender, file count, link and the transfer key', () => {
    const link = 'https://app.seeclub.org/private/file-transfer/t1';
    const card = fileTransferCardContent(transfer(), link);
    expect(card.body).toContain('Anna Muster');
    expect(card.body).toContain('2 Dateien');
    expect(card.body).toContain(link);
    expect(card['org.okr.fileTransfer']).toEqual({ transferKey: 't1' });
  });

  it('card says «1 Datei» for a single file', () => {
    const t = transfer();
    t.files = t.files.slice(0, 1);
    expect(fileTransferCardContent(t, 'https://x').body).toContain('1 Datei');
  });

  it('email is du-form German with the link and an escaped message', () => {
    const t = transfer();
    t.message = '<b>hallo</b>';
    const mail = fileTransferEmail(t, 'https://app.seeclub.org/public/file-transfer/TOKEN', 'Seeclub');
    expect(mail.subject).toBe('Anna Muster hat dir Dateien geschickt');
    expect(mail.html).toContain('https://app.seeclub.org/public/file-transfer/TOKEN');
    expect(mail.html).toContain('&lt;b&gt;hallo&lt;/b&gt;');
    expect(mail.html).not.toContain('<b>hallo</b>');
    expect(mail.html).toContain('29.10.2026');
  });

  describe('mayPostCard', () => {
    it('allows a joined sender in a postPolicy all (or legacy undefined) room', () => {
      expect(mayPostCard({ senderJoined: true, postPolicy: 'all', senderRoles: { registered: true } })).toBe(true);
      expect(mayPostCard({ senderJoined: true, postPolicy: undefined, senderRoles: { registered: true } })).toBe(true);
    });
    it('refuses a sender who is not joined', () => {
      expect(mayPostCard({ senderJoined: false, postPolicy: 'all', senderRoles: { admin: true } })).toBe(false);
    });
    it('refuses a postPolicy privileged room for a non-privileged sender (group admin does not count)', () => {
      expect(mayPostCard({ senderJoined: true, postPolicy: 'privileged', senderRoles: { registered: true, groupAdmin: true } })).toBe(false);
    });
    it('allows privileged and admin senders in a postPolicy privileged room', () => {
      expect(mayPostCard({ senderJoined: true, postPolicy: 'privileged', senderRoles: { privileged: true } })).toBe(true);
      expect(mayPostCard({ senderJoined: true, postPolicy: 'privileged', senderRoles: { admin: true } })).toBe(true);
    });
  });

  describe('recipients and notification plan', () => {
    const chatOnly = { personKey: 'p1', name: 'Beat', email: 'beat@example.ch', viaGroupKey: 'g1', channels: [DeliveryChannel.Chat] };
    const mailAndChat = { personKey: 'p2', name: 'Cla', email: 'cla@example.ch', viaGroupKey: 'g1', channels: [DeliveryChannel.Email, DeliveryChannel.Chat] };

    it('merges an outside email equal to a chat-only member into that person and does not keep or mail it', () => {
      const recipients = recipientsForSend([chatOnly], ['Beat@Example.ch', 'x@example.ch']);
      expect(recipients.map(r => r.id)).toEqual(['p:p1', 'e:x@example.ch']);
      expect(recipients[0].email).toBe('');
      const plan = planNotifications(recipients, new Map([['p1', chatOnly.channels]]), new Set());
      expect(plan.emailIds).toEqual(['e:x@example.ch']);
      expect(plan.pushKeys).toEqual(['p1']);
    });

    it('a member covered by a card gets no push but still the email of their channel', () => {
      const recipients = recipientsForSend([chatOnly, mailAndChat], []);
      const channels = new Map([['p1', chatOnly.channels], ['p2', mailAndChat.channels]]);
      const plan = planNotifications(recipients, channels, new Set(['p1', 'p2']));
      expect(plan.pushKeys).toEqual([]);
      expect(plan.coveredIds).toEqual(['p:p1', 'p:p2']);
      expect(plan.emailIds).toEqual(['p:p2']);
    });

    it('an uncovered chat member is pushed; signal and post only reach nobody', () => {
      const signalOnly = { personKey: 'p3', name: 'Dora', email: 'd@example.ch', channels: [DeliveryChannel.Signal, DeliveryChannel.Post] };
      const recipients = recipientsForSend([mailAndChat, signalOnly], []);
      const plan = planNotifications(recipients, new Map([['p2', mailAndChat.channels], ['p3', signalOnly.channels]]), new Set());
      expect(plan.pushKeys).toEqual(['p2']);
      expect(plan.emailIds).toEqual(['p:p2']);
      expect(recipients.find(r => r.id === 'p:p3')?.email).toBe('');
    });
  });
});
