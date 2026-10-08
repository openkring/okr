import { Injector } from '@angular/core';
import { catchError, firstValueFrom, of, timeout } from 'rxjs';

import { ProjectModel } from '@okr/shared-models';
import { ProjectService } from '@okr/project-project-data-access';

/**
 * The projects for the TaskEditModal's project picker (archived ones included, so a linked archived
 * project keeps its name), for callers outside the task feature that open the modal through a
 * dynamic import (dashboard tasks section, expense screen) and must not import the project libs
 * statically. Never rejects and never hangs: a failed or slow read answers [] and the picker hides.
 */
export async function loadTaskProjects(injector: Injector): Promise<ProjectModel[]> {
  return firstValueFrom(
    injector.get(ProjectService).listAll().pipe(
      timeout({ first: 5000 }),
      catchError(() => of([] as ProjectModel[])),
    ),
    { defaultValue: [] as ProjectModel[] },
  );
}
