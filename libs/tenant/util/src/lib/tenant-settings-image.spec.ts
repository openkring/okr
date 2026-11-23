import { describe, expect, it } from 'vitest';

import { settingsImageExtension, settingsImageTooBig, SETTINGS_IMAGE_MAX_BYTES, settingsImagePreviewUrl, settingsImageName, settingsImagePath, SETTINGS_IMAGE_MIMETYPES } from './tenant-settings-image';

describe('SETTINGS_IMAGE_MIMETYPES', () => {
  it('offers exactly JPG and PNG', () => {
    expect([...SETTINGS_IMAGE_MIMETYPES]).toEqual(['image/jpeg', 'image/png']);
  });
});

describe('settingsImageExtension', () => {
  it('maps the two accepted types', () => {
    expect(settingsImageExtension('image/jpeg')).toBe('jpg');
    expect(settingsImageExtension('image/png')).toBe('png');
  });
  it('is tolerant of the non-registered image/jpg and of case', () => {
    expect(settingsImageExtension('image/jpg')).toBe('jpg');
    expect(settingsImageExtension('IMAGE/PNG')).toBe('png');
  });
  it('refuses everything else', () => {
    for (const type of ['image/webp', 'image/gif', 'image/heic', 'image/svg+xml', 'application/pdf', '', undefined]) {
      expect(settingsImageExtension(type)).toBeUndefined();
    }
  });
});

describe('settingsImagePath', () => {
  it('builds a new name below the tenant app folder', () => {
    expect(settingsImagePath('scs', 'welcomeBannerUrl', '20261124101500', 'jpg')).toBe('tenant/scs/app/welcome-20261124101500.jpg');
    expect(settingsImagePath('scs', 'notfoundBannerUrl', '20261124101500', 'png')).toBe('tenant/scs/app/not-found-20261124101500.png');
  });
  it('answers undefined without a usable tenant or for a field that is no image', () => {
    expect(settingsImagePath('', 'welcomeBannerUrl', '1', 'jpg')).toBeUndefined();
    expect(settingsImagePath('a/b', 'welcomeBannerUrl', '1', 'jpg')).toBeUndefined();
    expect(settingsImagePath('..', 'welcomeBannerUrl', '1', 'jpg')).toBeUndefined();
    expect(settingsImagePath('scs', 'appName', '1', 'jpg')).toBeUndefined();
  });
});

describe('settingsImageName', () => {
  it('is the file name of a storage path', () => {
    expect(settingsImageName('tenant/scs/app/welcome.jpg')).toBe('welcome.jpg');
  });
  it('drops query and hash of a full url', () => {
    expect(settingsImageName('https://x.imgix.net/tenant/scs/app/a%20b.png?auto=compress#x')).toBe('a b.png');
  });
  it('is empty for nothing and the value itself without a slash', () => {
    expect(settingsImageName('')).toBe('');
    expect(settingsImageName('  ')).toBe('');
    expect(settingsImageName('banner.jpg')).toBe('banner.jpg');
  });
  it('keeps an undecodable name as it is', () => {
    expect(settingsImageName('tenant/scs/app/100%.jpg')).toBe('100%.jpg');
  });
});

describe('settingsImagePreviewUrl', () => {
  const BASE = 'https://bkaiser.imgix.net';
  it('puts a storage path behind the imgix base, resized', () => {
    const url = settingsImagePreviewUrl('tenant/scs/app/welcome.jpg', BASE);
    expect(url.startsWith(`${BASE}/tenant/scs/app/welcome.jpg?`)).toBe(true);
    expect(url).toContain('w=640');
  });
  it('tolerates a trailing slash on the base', () => {
    expect(settingsImagePreviewUrl('tenant/scs/app/a.png', `${BASE}/`).startsWith(`${BASE}/tenant/`)).toBe(true);
  });
  it('keeps an absolute https url', () => {
    expect(settingsImagePreviewUrl('https://example.org/a.jpg', BASE)).toBe('https://example.org/a.jpg');
  });
  it('is empty for nothing, blanks and without a base', () => {
    expect(settingsImagePreviewUrl('', BASE)).toBe('');
    expect(settingsImagePreviewUrl('   ', BASE)).toBe('');
    expect(settingsImagePreviewUrl('tenant/scs/app/a.png', '')).toBe('');
  });
});

describe('settingsImageTooBig', () => {
  it('follows the cap of storage.rules: below 25 MB passes, 25 MB and more does not', () => {
    expect(SETTINGS_IMAGE_MAX_BYTES).toBe(25 * 1024 * 1024);
    expect(settingsImageTooBig(SETTINGS_IMAGE_MAX_BYTES - 1)).toBe(false);
    expect(settingsImageTooBig(SETTINGS_IMAGE_MAX_BYTES)).toBe(true);
    expect(settingsImageTooBig(0)).toBe(false);
  });
});

describe('settingsImagePreviewUrl, legacy values', () => {
  it('makes no preview of an assets path (it is no storage path, imgix cannot serve it)', () => {
    expect(settingsImagePreviewUrl('assets/banner.jpg', 'https://bkaiser.imgix.net')).toBe('');
  });
});
