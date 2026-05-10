import { describe, expect, it, beforeEach } from 'vitest';
import { QuickEntryService } from './quick-entry.service';

describe('QuickEntryService', () => {
  let service: QuickEntryService;

  beforeEach(() => {
    service = new QuickEntryService();
  });

  describe('detectTrigger', () => {
    it('returns "person" when text ends with @', () => {
      expect(service.detectTrigger('Team Meeting @')).toBe('person');
    });

    it('returns "person" when text is just @', () => {
      expect(service.detectTrigger('@')).toBe('person');
    });

    it('returns "date" when text ends with //', () => {
      expect(service.detectTrigger('Team Meeting //')).toBe('date');
    });

    it('returns "date" when text is just //', () => {
      expect(service.detectTrigger('//')).toBe('date');
    });

    it('returns null for regular text', () => {
      expect(service.detectTrigger('Team Meeting')).toBeNull();
    });

    it('returns null for empty string', () => {
      expect(service.detectTrigger('')).toBeNull();
    });

    it('returns null when @ is not at the end', () => {
      expect(service.detectTrigger('@Maria Muster Meeting')).toBeNull();
    });

    it('returns null when // is not at the end', () => {
      expect(service.detectTrigger('Meeting 30.01.2026 notes')).toBeNull();
    });
  });

  describe('replaceToken', () => {
    it('replaces trailing @ with person name token', () => {
      expect(service.replaceToken('Team Meeting @', '@', '@Maria Muster'))
        .toBe('Team Meeting @Maria Muster');
    });

    it('replaces trailing // with date token', () => {
      expect(service.replaceToken('Meeting //', '//', '30.01.2026'))
        .toBe('Meeting 30.01.2026');
    });

    it('replaces trailing // with date+time token', () => {
      expect(service.replaceToken('Meeting //', '//', '30.01.2026,1830'))
        .toBe('Meeting 30.01.2026,1830');
    });

    it('replaces last occurrence when trigger appears multiple times', () => {
      expect(service.replaceToken('foo @ bar @', '@', '@Anna'))
        .toBe('foo @ bar @Anna');
    });

    it('returns text unchanged when trigger not found', () => {
      expect(service.replaceToken('Meeting', '@', '@Anna')).toBe('Meeting');
    });
  });
});
