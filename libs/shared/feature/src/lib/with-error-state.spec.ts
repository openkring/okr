import { beforeEach, describe, expect, it } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { signalStore } from '@ngrx/signals';

import { withErrorState } from './with-error-state';

const TestStore = signalStore(withErrorState());

describe('withErrorState', () => {
  let store: InstanceType<typeof TestStore>;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [TestStore] });
    store = TestBed.inject(TestStore);
  });

  it('starts with no error', () => {
    expect(store.error()).toBeUndefined();
    expect(store.isError()).toBe(false);
    expect(store.errorMessage()).toBeUndefined();
  });

  it('sets an error message', () => {
    store.setError('Speichern fehlgeschlagen');
    expect(store.error()).toBe('Speichern fehlgeschlagen');
    expect(store.isError()).toBe(true);
    expect(store.errorMessage()).toBe('Speichern fehlgeschlagen');
  });

  it('clears the error', () => {
    store.setError('boom');
    store.clearError();
    expect(store.error()).toBeUndefined();
    expect(store.isError()).toBe(false);
    expect(store.errorMessage()).toBeUndefined();
  });

  it('overwrites a previous error with the latest', () => {
    store.setError('first');
    store.setError('second');
    expect(store.errorMessage()).toBe('second');
  });
});
