import { describe, expect, it } from 'vitest';
import { ALBUM_SECTION_SHAPE, AlbumSection } from '@bk2/shared-models';

import { albumSectionValidations } from './album-section.validations';

describe('albumSectionValidations', () => {
  it('does not flag a valid title', () => {
    expect(albumSectionValidations({ ...ALBUM_SECTION_SHAPE }).hasErrors('title')).toBe(false);
  });

  it('flags a non-string title', () => {
    const model = { ...ALBUM_SECTION_SHAPE, title: 123 } as unknown as AlbumSection;
    expect(albumSectionValidations(model).hasErrors('title')).toBe(true);
  });

  it('flags a non-string directory', () => {
    const model = { ...ALBUM_SECTION_SHAPE, properties: { ...ALBUM_SECTION_SHAPE.properties, directory: 123 } } as unknown as AlbumSection;
    expect(albumSectionValidations(model).hasErrors('directory')).toBe(true);
  });

  it('does not throw for a section whose properties lack imageStyle', () => {
    const model = { ...ALBUM_SECTION_SHAPE, properties: {} } as unknown as AlbumSection;
    expect(() => albumSectionValidations(model)).not.toThrow();
  });
});
