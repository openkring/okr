// The util-core barrel pulls Angular; this parity spec needs the JIT compiler for it (render itself never does).
import '@angular/compiler';
import type { ImageConfig } from '@okr/shared-models';
import { buildImageCaption } from '@okr/shared-util-core';

import { imageCaption } from './image-caption';

describe('imageCaption parity with buildImageCaption', () => {
  const cases: [string, ImageConfig | undefined, (string | undefined)[]][] = [
    ['own + credit', { overlay: ' Untertitel ', credit: ' Quelle ' } as ImageConfig, ['x']],
    ['own only', { overlay: 'Untertitel' } as ImageConfig, []],
    ['credit only', { credit: 'Quelle' } as ImageConfig, ['x']],
    ['fallbacks', {} as ImageConfig, [undefined, '  ', ' Zwei ', 'Drei']],
    ['empty / whitespace', { overlay: '  ', credit: ' ' } as ImageConfig, ['', '  ']],
    ['no image', undefined, []],
  ];
  it.each(cases)('%s', (_n, img, fb) => {
    expect(imageCaption(img, fb)).toEqual(buildImageCaption(img, fb));
  });
});
