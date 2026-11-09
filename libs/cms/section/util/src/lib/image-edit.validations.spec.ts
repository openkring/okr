import { describe, expect, it } from 'vitest';

import { ImageConfig, ImageType } from '@okr/shared-models';

import { IMAGE_CAPTION_LENGTH, IMAGE_CREDIT_LENGTH, imageEditValidations } from './image-edit.validations';

const image = (patch: Partial<ImageConfig> = {}): ImageConfig => ({
  label: 'Doppelvierer', type: ImageType.Image, url: 'tenant/scs/section/x/a.jpg',
  actionUrl: '', altText: 'Boot', overlay: '', credit: '', ...patch,
});

describe('imageEditValidations', () => {
  it('accepts a normal image, a legacy imgix url and an empty url', () => {
    expect(imageEditValidations(image()).isValid()).toBe(true);
    expect(imageEditValidations(image({ url: 'https://bkaiser.imgix.net/tenant/scs%2Fa.png' })).isValid()).toBe(true);
    expect(imageEditValidations(image({ url: '' })).isValid()).toBe(true);
  });

  it('accepts older images with missing text fields', () => {
    const legacy = { type: ImageType.Image, url: 'tenant/scs/a.jpg' } as ImageConfig;
    expect(imageEditValidations(legacy).isValid()).toBe(true);
  });

  it('rejects a url that cannot be rendered through imgix', () => {
    expect(imageEditValidations(image({ url: '/path/to/image' })).hasErrors('url')).toBe(true);
  });

  it('caps the caption and the credit', () => {
    expect(imageEditValidations(image({ overlay: 'x'.repeat(IMAGE_CAPTION_LENGTH + 1) })).hasErrors('overlay')).toBe(true);
    expect(imageEditValidations(image({ credit: 'x'.repeat(IMAGE_CREDIT_LENGTH + 1) })).hasErrors('credit')).toBe(true);
    expect(imageEditValidations(image({ credit: 'x'.repeat(IMAGE_CREDIT_LENGTH) })).isValid()).toBe(true);
  });
});
