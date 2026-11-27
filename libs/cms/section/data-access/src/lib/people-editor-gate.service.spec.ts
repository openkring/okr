import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { FirestoreService } from '@okr/shared-data-access';

import { PEOPLE_EDITOR_MIN_VERSION, PeopleEditorGate } from './people-editor-gate.service';

describe('PeopleEditorGate', () => {
  const readObjectStrict = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    readObjectStrict.mockResolvedValue({ minVersion: '99.0.0' });
    TestBed.configureTestingModule({ providers: [{ provide: FirestoreService, useValue: { readObjectStrict } }] });
  });

  it('is not released yet', () => {
    expect(PEOPLE_EDITOR_MIN_VERSION).toBeUndefined();
  });

  it('stays closed while no version is released, however high minVersion is, and reads nothing', async () => {
    const gate = TestBed.inject(PeopleEditorGate);
    if (gate.trial) return;   // trial mode (development builds) opens it by design
    await expect(gate.load()).resolves.toBe(false);
    await expect(gate.loadMayWrite()).resolves.toBe(false);
    expect(gate.open()).toBe(false);
    expect(readObjectStrict).not.toHaveBeenCalled();
  });
});
