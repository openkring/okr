import { describe, expect, it } from 'vitest';
import {
  isLetterPictureRefusal, mailEditorWanted, mailPageRefusalBlockId, mailPageRefusalKey, newMailPage, sameMailPageMeta, testMailRefusalKey,
} from './mail-page.util';

describe('newMailPage', () => {
  it('is a mail page with one tenant, the sender, createdAt and no mailingKey', () => {
    const p = newMailPage('scs', 'uid1');
    expect(p.type).toBe('mail');
    expect(p.tenants).toEqual(['scs']);
    expect(p.senderUid).toBe('uid1');
    expect(Number.isNaN(Date.parse(p.createdAt))).toBe(false);
    expect('mailingKey' in p).toBe(false);
    expect('groupKey' in p).toBe(false);
  });
  it('sets groupKey only when given', () => {
    expect(newMailPage('scs', 'u', 'g1').groupKey).toBe('g1');
  });
});

describe('mailPageRefusalKey', () => {
  const refusal = (message: string, code = 'functions/failed-precondition') => ({ code, message });

  it('maps each page refusal to its message', () => {
    expect(mailPageRefusalKey(refusal('no-content'))).toBe('page_refused_no_content');
    expect(mailPageRefusalKey(refusal('sent'))).toBe('page_refused_sent');
    expect(mailPageRefusalKey(refusal('not-found'))).toBe('page_refused_gone');
    expect(mailPageRefusalKey(refusal('foreign'))).toBe('page_refused_gone');
    expect(mailPageRefusalKey(refusal('unknown-section-type'))).toBe('page_refused_section');
  });
  it('maps the refusals of the blocks and of the letter pictures (spec 1.176 §9.1, §9.4)', () => {
    expect(mailPageRefusalKey(refusal('unknown-block-type'))).toBe('page_refused_block_type');
    expect(mailPageRefusalKey(refusal('invalid-block'))).toBe('page_refused_block');
    expect(mailPageRefusalKey(refusal('too-large'))).toBe('page_refused_too_large');
    expect(mailPageRefusalKey(refusal('letter-picture'))).toBe('page_refused_letter_picture');
  });
  it('accepts the code without the functions/ prefix', () => {
    expect(mailPageRefusalKey(refusal('sent', 'failed-precondition'))).toBe('page_refused_sent');
  });
  it('leaves every other error to the caller', () => {
    expect(mailPageRefusalKey(refusal('price-changed'))).toBeUndefined();
    expect(mailPageRefusalKey(refusal('insufficient-credit'))).toBeUndefined();
    expect(mailPageRefusalKey(refusal('toString'))).toBeUndefined();
    expect(mailPageRefusalKey(refusal('no-content', 'functions/internal'))).toBeUndefined();
    expect(mailPageRefusalKey(new Error('no-content'))).toBeUndefined();
    expect(mailPageRefusalKey(undefined)).toBeUndefined();
    expect(mailPageRefusalKey('no-content')).toBeUndefined();
  });
});

describe('mailEditorWanted', () => {
  const versand = { isVersand: true, segment: 'editor', draftLoaded: true, hasLoader: true };

  it('loads the editor for a Versand in its editor segment once the draft exists', () => {
    expect(mailEditorWanted(versand)).toBe(true);
  });

  it('never loads it for a composer without Versand recipients', () => {
    for (const segment of ['editor', 'preview', 'list']) {
      expect(mailEditorWanted({ isVersand: false, segment, draftLoaded: true, hasLoader: true })).toBe(false);
      expect(mailEditorWanted({ isVersand: false, segment, draftLoaded: false, hasLoader: false })).toBe(false);
    }
  });

  it('waits for the draft, the editor segment and a loader', () => {
    expect(mailEditorWanted({ ...versand, draftLoaded: false })).toBe(false);
    expect(mailEditorWanted({ ...versand, segment: 'preview' })).toBe(false);
    expect(mailEditorWanted({ ...versand, hasLoader: false })).toBe(false);
  });
});

describe('sameMailPageMeta', () => {
  const meta = { subject: 'S', layout: 'standard' as const, webVersion: false };
  it('compares subject, layout and web version', () => {
    expect(sameMailPageMeta(meta, { ...meta })).toBe(true);
    expect(sameMailPageMeta(meta, { ...meta, subject: 'T' })).toBe(false);
    expect(sameMailPageMeta(meta, { ...meta, layout: 'plain' })).toBe(false);
    expect(sameMailPageMeta(meta, { ...meta, webVersion: true })).toBe(false);
  });
});

describe('mailPageRefusalBlockId', () => {
  const refusal = (message: string, details: unknown, code = 'functions/failed-precondition') => ({ code, message, details });

  it('is the block a page refusal names', () => {
    expect(mailPageRefusalBlockId(refusal('invalid-block', { blockId: 'b7' }))).toBe('b7');
    expect(mailPageRefusalBlockId(refusal('unknown-block-type', { blockId: 'b1' }, 'failed-precondition'))).toBe('b1');
  });
  it('is undefined without a usable id, or for an error that is no page refusal', () => {
    expect(mailPageRefusalBlockId(refusal('invalid-block', undefined))).toBeUndefined();
    expect(mailPageRefusalBlockId(refusal('invalid-block', { blockId: '' }))).toBeUndefined();
    expect(mailPageRefusalBlockId(refusal('invalid-block', { blockId: 7 }))).toBeUndefined();
    expect(mailPageRefusalBlockId(refusal('invalid-block', 'b7'))).toBeUndefined();
    expect(mailPageRefusalBlockId(refusal('invalid-block', { blockId: 'b7' }, 'functions/internal'))).toBeUndefined();
    expect(mailPageRefusalBlockId(refusal('price-changed', { blockId: 'b7' }))).toBeUndefined();
    expect(mailPageRefusalBlockId(undefined)).toBeUndefined();
  });
});

describe('isLetterPictureRefusal', () => {
  it('is a picture the letters cannot take: unavailable from the quote, failed-precondition from the send', () => {
    expect(isLetterPictureRefusal({ code: 'functions/unavailable', message: 'letter-picture' })).toBe(true);
    expect(isLetterPictureRefusal({ code: 'failed-precondition', message: 'letter-picture' })).toBe(true);
  });
  it('is no other refusal: Pingen unavailable stays what it was', () => {
    expect(isLetterPictureRefusal({ code: 'functions/unavailable', message: 'no credit' })).toBe(false);
    expect(isLetterPictureRefusal({ code: 'functions/internal', message: 'letter-picture' })).toBe(false);
    expect(isLetterPictureRefusal(new Error('letter-picture'))).toBe(false);
    expect(isLetterPictureRefusal(undefined)).toBe(false);
  });
});

describe('testMailRefusalKey', () => {
  const refusal = (message: string, code = 'functions/failed-precondition') => ({ code, message });

  it('maps the refusals of the test mail', () => {
    expect(testMailRefusalKey(refusal('no-address'))).toBe('test_no_address');
    expect(testMailRefusalKey(refusal('impersonated'))).toBe('test_impersonated');
    expect(testMailRefusalKey(refusal('provider', 'functions/unavailable'))).toBe('test_provider');
  });
  it('a sender who may not send this mail any more (role, group or tenant lost) gets its own text, whatever the server says', () => {
    expect(testMailRefusalKey(refusal('Only group admins may send.', 'functions/permission-denied'))).toBe('test_permission');
    expect(testMailRefusalKey(refusal('', 'permission-denied'))).toBe('test_permission');
  });
  it('maps the page refusals as the send does', () => {
    expect(testMailRefusalKey(refusal('invalid-block'))).toBe('page_refused_block');
    expect(testMailRefusalKey(refusal('sent'))).toBe('page_refused_sent');
  });
  it('leaves every other error to the caller', () => {
    expect(testMailRefusalKey(refusal('provider'))).toBeUndefined();
    expect(testMailRefusalKey(refusal('no-address', 'functions/internal'))).toBeUndefined();
    expect(testMailRefusalKey(refusal('no-layout'))).toBeUndefined();
    expect(testMailRefusalKey(refusal('boom', 'functions/internal'))).toBeUndefined();
    expect(testMailRefusalKey(new Error('no-address'))).toBeUndefined();
    expect(testMailRefusalKey(undefined)).toBeUndefined();
  });
});
