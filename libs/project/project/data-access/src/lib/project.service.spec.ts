import { beforeEach, describe, expect, it, vi } from 'vitest';

const deleteModel = vi.fn();
const detachParent = vi.fn();
const showToast = vi.fn();

vi.mock('@angular/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@angular/core')>();
  return { ...actual, inject: vi.fn(() => ({ translateAll: () => ({}) })) };
});
vi.mock('@okr/activity-data-access', () => ({ ActivityService: class {} }));
vi.mock('@okr/shared-config', () => ({ ENV: 'ENV' }));
vi.mock('@okr/shared-data-access', () => ({ FirestoreService: class {} }));
vi.mock('@okr/shared-i18n', () => ({ I18nService: class {} }));
vi.mock('@okr/shared-util-angular', () => ({ AlertService: class {} }));
vi.mock('@okr/project-task-data-access', () => ({ TaskService: class {} }));
vi.mock('@okr/shared-util-core', () => ({ findByKey: vi.fn(), getArchiveInclusiveQuery: vi.fn(), getSystemQuery: vi.fn() }));
vi.mock('@okr/project-project-util', () => ({
  getProjectIndex: vi.fn(),
  getProjectParentKey: (k: string) => `project.${k}`,
}));

import { ProjectService } from './project.service';

function makeService(): ProjectService {
  const svc = new ProjectService() as unknown as Record<string, unknown>;
  svc['env'] = { tenantId: 'scs' };
  svc['firestoreService'] = { deleteModel };
  svc['activityService'] = { log: vi.fn() };
  svc['taskService'] = { detachParent };
  svc['alertService'] = { showToast };
  svc['i18n'] = { delete_conf: () => 'ok', delete_error: () => 'err', delete_detached: () => 'detached {count}' };
  return svc as unknown as ProjectService;
}

const project = { okey: 'p1', name: 'P' } as never;

describe('ProjectService.delete', () => {
  beforeEach(() => vi.clearAllMocks());

  it('detaches the tasks before it deletes the project', async () => {
    const order: string[] = [];
    detachParent.mockImplementation(async () => { order.push('detach'); return 3; });
    deleteModel.mockImplementation(async () => { order.push('delete'); });
    await makeService().delete(project);
    expect(order).toEqual(['detach', 'delete']);
    expect(detachParent).toHaveBeenCalledWith('project.p1', 'scs');
    expect(showToast).toHaveBeenCalledWith('detached 3');
  });

  it('does not toast when no task was attached', async () => {
    detachParent.mockResolvedValue(0);
    await makeService().delete(project);
    expect(showToast).not.toHaveBeenCalled();
    expect(deleteModel).toHaveBeenCalled();
  });

  it('keeps the project when the detach fails', async () => {
    detachParent.mockRejectedValue(new Error('1 of 2 tasks could not be detached.'));
    await expect(makeService().delete(project)).rejects.toThrow('could not be detached');
    expect(deleteModel).not.toHaveBeenCalled();
  });
});
