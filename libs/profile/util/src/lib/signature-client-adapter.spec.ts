import { describe, expect, it } from 'vitest';

import { adaptForClient, buildInstallGuide, hardenHtmlForClient, recommendedFormatFor } from './signature-client-adapter';
import { ProfileI18n } from './profile-i18n';
import { SignatureRender } from './signature.model';

// Stub i18n: every signal returns its own key name, so we can assert which key maps where.
const i18n = new Proxy({}, { get: (_t, prop: string) => () => prop }) as unknown as ProfileI18n;

const BASE: SignatureRender = {
  html: '<table style="line-height:1.3;"><tr><td style="line-height:1.4;">x</td></tr></table>',
  text: '-- \nx',
};

describe('hardenHtmlForClient', () => {
  it('injects mso-line-height-rule for outlook-win', () => {
    const out = hardenHtmlForClient(BASE.html, 'outlook-win');
    expect((out.match(/mso-line-height-rule:exactly;/g) ?? []).length).toBe(2);
    expect(out).toContain('line-height:1.3;mso-line-height-rule:exactly;');
  });
  it('leaves the html untouched for every other client', () => {
    for (const c of ['gmail', 'outlook-web', 'apple-mail-mac', 'apple-mail-ios'] as const) {
      expect(hardenHtmlForClient(BASE.html, c)).toBe(BASE.html);
    }
  });
});

describe('recommendedFormatFor', () => {
  it('recommends html for every client', () => {
    for (const c of ['gmail', 'outlook-web', 'outlook-win', 'apple-mail-mac', 'apple-mail-ios'] as const) {
      expect(recommendedFormatFor(c)).toBe('html');
    }
  });
});

describe('buildInstallGuide', () => {
  it('returns the client title, steps and shared raw fallback', () => {
    const guide = buildInstallGuide('gmail', i18n);
    expect(guide.title).toBe('sig_client_gmail');
    expect(guide.steps).toEqual(['sig_guide_gmail_s1', 'sig_guide_gmail_s2', 'sig_guide_gmail_s3', 'sig_guide_gmail_s4']);
    expect(guide.rawFallback).toBe('sig_guide_raw_fallback');
  });
  it('produces the right number of steps per client', () => {
    expect(buildInstallGuide('outlook-web', i18n).steps).toHaveLength(3);
    expect(buildInstallGuide('outlook-win', i18n).steps).toHaveLength(4);
    expect(buildInstallGuide('apple-mail-mac', i18n).steps).toHaveLength(4);
    expect(buildInstallGuide('apple-mail-ios', i18n).steps).toHaveLength(2);
  });
});

describe('adaptForClient', () => {
  it('composes hardened html, text, recommended format and guide', () => {
    const plan = adaptForClient(BASE, 'outlook-win', i18n);
    expect(plan.client).toBe('outlook-win');
    expect(plan.html).toContain('mso-line-height-rule:exactly;');
    expect(plan.text).toBe(BASE.text);
    expect(plan.recommendedFormat).toBe('html');
    expect(plan.guide.title).toBe('sig_client_outlookWin');
  });
});
