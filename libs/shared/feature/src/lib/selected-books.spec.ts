import { afterEach, describe, expect, it, vi } from 'vitest';
import { TestBed } from '@angular/core/testing';

import { ENV } from '@okr/shared-config';

import { readStoredBooks, SELECTED_BOOKS_STORAGE_PREFIX, SelectedBooks, writeStoredBooks } from './selected-books';

describe('stored books choice', () => {
  afterEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('round-trips the explicit choice per app tenant', () => {
    writeStoredBooks('scs', 'gss');
    expect(localStorage.getItem(SELECTED_BOOKS_STORAGE_PREFIX + 'scs')).toBe('gss');
    expect(readStoredBooks('scs')).toBe('gss');
    expect(readStoredBooks('kring')).toBe('');
  });

  it('ignores an empty tenant or empty books', () => {
    writeStoredBooks('', 'gss');
    writeStoredBooks('scs', '');
    expect(localStorage.length).toBe(0);
    expect(readStoredBooks('')).toBe('');
  });

  it('is empty when storage is unavailable', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked'); });
    expect(() => writeStoredBooks('scs', 'gss')).not.toThrow();
    expect(readStoredBooks('scs')).toBe('');
  });
});

describe('SelectedBooks', () => {
  afterEach(() => localStorage.clear());

  it('starts with the stored explicit choice, so the menu follows it right after a reload', () => {
    writeStoredBooks('scs', 'gss');
    TestBed.configureTestingModule({ providers: [{ provide: ENV, useValue: { tenantId: 'scs' } }] });
    expect(TestBed.inject(SelectedBooks).current()).toBe('gss');
  });

  it('starts empty without a stored choice', () => {
    TestBed.configureTestingModule({ providers: [{ provide: ENV, useValue: { tenantId: 'scs' } }] });
    expect(TestBed.inject(SelectedBooks).current()).toBe('');
  });
});
