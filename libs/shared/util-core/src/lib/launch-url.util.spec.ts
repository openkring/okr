import { describe, expect, it } from 'vitest';
import { LAUNCH_URL_HANDLED_KEY, noteOpenedUrl, takeLaunchUrl } from './launch-url.util';

const mem = () => {
  const data: Record<string, string> = {};
  return { data, getItem: (k: string) => data[k] ?? null, setItem: (k: string, v: string) => { data[k] = v; } };
};

describe('takeLaunchUrl', () => {
  it('hands out a launch url the first time', () => {
    const s = mem();
    expect(takeLaunchUrl('https://app.kring.ch/t/scs', s)).toBe('https://app.kring.ch/t/scs');
    expect(s.data[LAUNCH_URL_HANDLED_KEY]).toBe('https://app.kring.ch/t/scs');
  });

  it('does not hand out the same launch url again after a reload', () => {
    const s = mem();
    takeLaunchUrl('https://app.kring.ch/t/scs', s);
    expect(takeLaunchUrl('https://app.kring.ch/t/scs', s)).toBeUndefined();
  });

  it('hands out a different launch url', () => {
    const s = mem();
    takeLaunchUrl('https://app.kring.ch/t/scs', s);
    expect(takeLaunchUrl('https://app.kring.ch/t/p13', s)).toBe('https://app.kring.ch/t/p13');
  });

  it('passes undefined through', () => expect(takeLaunchUrl(undefined, mem())).toBeUndefined());

  it('still hands out the url when storage throws', () =>
    expect(takeLaunchUrl('https://a/x', { getItem: () => { throw new Error('blocked'); }, setItem: () => undefined })).toBe('https://a/x'));
});

describe('noteOpenedUrl', () => {
  it('a url delivered while running is not handed out again as launch url', () => {
    // iOS getLaunchUrl() returns the LAST url that opened the app, including one from appUrlOpen
    const s = mem();
    expect(noteOpenedUrl('https://app.kring.ch/t/scs', s)).toBe('https://app.kring.ch/t/scs');
    expect(takeLaunchUrl('https://app.kring.ch/t/scs', s)).toBeUndefined();
  });

  it('always passes the url through, even the same one twice (a second tap)', () => {
    const s = mem();
    noteOpenedUrl('https://app.kring.ch/t/scs', s);
    expect(noteOpenedUrl('https://app.kring.ch/t/scs', s)).toBe('https://app.kring.ch/t/scs');
  });
});
