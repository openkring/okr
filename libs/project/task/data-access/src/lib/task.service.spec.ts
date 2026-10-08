import { beforeEach, describe, expect, it, vi } from 'vitest';

const firestore = {
  getDataOnceStrict: vi.fn(),
  updateObjectStrict: vi.fn(),
};

vi.mock('@angular/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@angular/core')>();
  return { ...actual, inject: vi.fn(() => ({ translateAll: () => ({}), log: vi.fn() })) };
});
vi.mock('firebase/app', () => ({ getApp: vi.fn() }));
vi.mock('firebase/functions', () => ({ getFunctions: vi.fn(), httpsCallable: vi.fn() }));
vi.mock('@okr/shared-data-access', () => ({ FirestoreService: class {} }));
vi.mock('@okr/activity-data-access', () => ({ ActivityService: class {} }));
vi.mock('@okr/shared-i18n', () => ({ I18nService: class {} }));
vi.mock('@okr/project-task-util', () => ({ getRestorePatch: vi.fn(), getTaskIndex: vi.fn(), getTaskShareKey: vi.fn() }));
vi.mock('@okr/shared-util-core', () => ({ getArchiveInclusiveQuery: (t: string) => [{ key: 'tenants', operator: 'array-contains-any', value: [t] }] }));

import { TaskService } from './task.service';

function makeService(): TaskService {
  const svc = new TaskService();
  (svc as unknown as { firestoreService: typeof firestore }).firestoreService = firestore;
  return svc;
}

describe('TaskService.detachParent', () => {
  beforeEach(() => vi.clearAllMocks());

  it('detaches every task of the parent and returns the count', async () => {
    firestore.getDataOnceStrict.mockResolvedValue([{ okey: 'a' }, { okey: 'b' }]);
    firestore.updateObjectStrict.mockResolvedValue(undefined);
    expect(await makeService().detachParent('project.p', 'scs')).toBe(2);
    expect(firestore.updateObjectStrict).toHaveBeenCalledWith('tasks', 'a', { parentKey: '' });
    expect(firestore.updateObjectStrict).toHaveBeenCalledWith('tasks', 'b', { parentKey: '' });
  });

  it('returns 0 for a project without tasks', async () => {
    firestore.getDataOnceStrict.mockResolvedValue([]);
    expect(await makeService().detachParent('project.p', 'scs')).toBe(0);
  });

  it('rejects when the read fails instead of reporting 0 tasks', async () => {
    firestore.getDataOnceStrict.mockRejectedValue(new Error('offline'));
    await expect(makeService().detachParent('project.p', 'scs')).rejects.toThrow('offline');
    expect(firestore.updateObjectStrict).not.toHaveBeenCalled();
  });

  it('rejects when any single update fails', async () => {
    firestore.getDataOnceStrict.mockResolvedValue([{ okey: 'a' }, { okey: 'b' }]);
    firestore.updateObjectStrict.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('denied'));
    await expect(makeService().detachParent('project.p', 'scs')).rejects.toThrow('1 of 2');
  });
});
