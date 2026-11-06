import { describe, expect, it } from 'vitest';
import { activeMemberKeys, groupMailContent, inlineAttachments, unknownRecipients } from './group-mail';

const member = { tenants: ['scs'], memberKey: 'p1', memberModelType: 'person', dateOfExit: '99991231' };

describe('activeMemberKeys', () => {
  it('takes a current member', () => expect(activeMemberKeys([member], 'scs', '20261106')).toEqual(['p1']));
  it('takes a legacy membership without an exit date', () => {
    expect(activeMemberKeys([{ ...member, dateOfExit: undefined }], 'scs', '20261106')).toEqual(['p1']);
  });
  it('skips somebody who left, also today', () => {
    expect(activeMemberKeys([{ ...member, dateOfExit: '20261001' }], 'scs', '20261106')).toEqual([]);
    expect(activeMemberKeys([{ ...member, dateOfExit: '20261106' }], 'scs', '20261106')).toEqual([]);
  });
  it('skips an archived membership, an org and another tenant', () => {
    expect(activeMemberKeys([{ ...member, isArchived: true }], 'scs', '20261106')).toEqual([]);
    expect(activeMemberKeys([{ ...member, memberModelType: 'org' }], 'scs', '20261106')).toEqual([]);
    expect(activeMemberKeys([{ ...member, tenants: ['p13'] }], 'scs', '20261106')).toEqual([]);
  });
  it('lists a person with two memberships once', () => {
    expect(activeMemberKeys([member, { ...member }], 'scs', '20261106')).toEqual(['p1']);
  });
});

describe('unknownRecipients', () => {
  it('accepts the list, whatever the case', () => {
    expect(unknownRecipients(['Anna@Club.ch', ' ben@club.ch '], ['anna@club.ch', 'BEN@club.ch'])).toEqual([]);
  });
  it('names what is not on the list', () => {
    expect(unknownRecipients(['anna@club.ch', 'x@evil.example'], ['anna@club.ch'])).toEqual(['x@evil.example']);
  });
});

describe('inlineAttachments', () => {
  const inline = { filename: 'a.pdf', contentBase64: 'QQ==', contentType: 'application/pdf' };
  it('keeps an inline file', () => expect(inlineAttachments([inline])).toEqual([inline]));
  it('copies only the known fields', () => {
    expect(inlineAttachments([{ ...inline, extra: 'x', contentType: 1 }])).toEqual([{ filename: 'a.pdf', contentBase64: 'QQ==' }]);
  });
  it('refuses a storage reference, also next to inline content', () => {
    expect(() => inlineAttachments([{ storagePath: 'tenant/x/secret.pdf' }])).toThrow();
    expect(() => inlineAttachments([{ ...inline, storagePath: 'tenant/x/secret.pdf' }])).toThrow();
  });
  it('refuses a malformed list', () => {
    expect(() => inlineAttachments('x')).toThrow();
    expect(() => inlineAttachments([null])).toThrow();
    expect(() => inlineAttachments([{ filename: 'a.pdf', contentBase64: 1 }])).toThrow();
  });
  it('copes with no attachments', () => expect(inlineAttachments(undefined)).toEqual([]));
});

describe('groupMailContent', () => {
  it('takes a body with its layout and attachment name', () => {
    expect(groupMailContent({ body: '<p>x</p>', layout: 'plain', attachmentName: 'a.pdf' })).toEqual({ body: '<p>x</p>', layout: 'plain', attachmentName: 'a.pdf' });
  });
  it('defaults the layout to standard and leaves the attachment out', () => {
    expect(groupMailContent({ body: '<p>x</p>' })).toEqual({ body: '<p>x</p>', layout: 'standard' });
  });
  it('still takes html alone from an old client', () => {
    expect(groupMailContent({ html: '<p>x</p>' })).toEqual({ html: '<p>x</p>' });
  });
  it('lets the body win over html', () => {
    expect(groupMailContent({ body: '<p>b</p>', html: '<p>h</p>' })).toEqual({ body: '<p>b</p>', layout: 'standard' });
  });
  it('refuses a request with neither, or with an empty body and no html', () => {
    expect(() => groupMailContent({})).toThrow();
    expect(() => groupMailContent({ body: '  ' })).toThrow();
    expect(() => groupMailContent({ body: 3 as never })).toThrow();
  });
});
