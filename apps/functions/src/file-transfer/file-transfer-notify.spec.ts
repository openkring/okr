import { describe, expect, it } from 'vitest';

import { FileTransferModel } from '@okr/shared-models';

import { fileTransferCardContent, fileTransferEmail, TRANSFER_ALIAS_SPACE } from './file-transfer-notify';

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
  it('uses the file-transfer alias space', () => {
    expect(TRANSFER_ALIAS_SPACE).toBe('file-transfer');
  });

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
    const mail = fileTransferEmail(t, 'https://app.seeclub.org/s/file-transfer/ABC', 'Seeclub');
    expect(mail.subject).toBe('Anna Muster hat dir Dateien geschickt');
    expect(mail.html).toContain('https://app.seeclub.org/s/file-transfer/ABC');
    expect(mail.html).toContain('&lt;b&gt;hallo&lt;/b&gt;');
    expect(mail.html).not.toContain('<b>hallo</b>');
    expect(mail.html).toContain('29.10.2026');
  });
});
