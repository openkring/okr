import { describe, expect, it } from 'vitest';
import { DIARY_FILE_MARKER } from './diary-file';

describe('diary-file', () => {
  it('exposes the marker that identifies a diary file name', () => {
    expect(DIARY_FILE_MARKER).toBe('diary');
  });
});
