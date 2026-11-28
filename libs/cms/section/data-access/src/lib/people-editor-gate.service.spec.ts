import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { FirestoreService } from '@okr/shared-data-access';

import { PEOPLE_EDITOR_MIN_VERSION, PeopleEditorGate } from './people-editor-gate.service';

describe('PeopleEditorGate', () => {
  const readObjectStrict = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    TestBed.configureTestingModule({ providers: [{ provide: FirestoreService, useValue: { readObjectStrict } }] });
  });

  it('is released with release A', () => {
    expect(PEOPLE_EDITOR_MIN_VERSION).toBe('7.64.0');
  });

  it('opens once minVersion reaches release A', async () => {
    readObjectStrict.mockResolvedValue({ minVersion: '7.64.0' });
    const gate = TestBed.inject(PeopleEditorGate);
    if (gate.trial) return;   // trial mode (development builds) opens it by design
    await expect(gate.load()).resolves.toBe(true);
    await expect(gate.loadMayWrite()).resolves.toBe(true);
    expect(gate.open()).toBe(true);
  });

  it('stays closed while minVersion is below release A', async () => {
    readObjectStrict.mockResolvedValue({ minVersion: '7.63.0' });
    const gate = TestBed.inject(PeopleEditorGate);
    if (gate.trial) return;
    await expect(gate.load()).resolves.toBe(false);
    await expect(gate.loadMayWrite()).resolves.toBe(false);
    expect(gate.open()).toBe(false);
  });
});
