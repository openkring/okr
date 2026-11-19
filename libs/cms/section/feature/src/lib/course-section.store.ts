import { computed, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { patchState, signalStore, withComputed, withMethods, withProps, withState } from '@ngrx/signals';

import { PublicCoursesService } from '@okr/cms-section-data-access';
import { SECTION_I18N_KEYS } from '@okr/cms-section-util';
import { I18nService } from '@okr/shared-i18n';
import { AppStore } from '@okr/shared-feature';
import type { ApplicationKind } from '@okr/shared-models';
import type { PublicCourse } from '@okr/shared-util-core';

type CourseState = { audience: ApplicationKind[] | undefined };

export const CourseSectionStore = signalStore(
  withState<CourseState>({ audience: undefined }),
  withProps(() => ({
    appStore: inject(AppStore),
    coursesService: inject(PublicCoursesService),
    i18n: inject(I18nService).translateAll(SECTION_I18N_KEYS),
  })),
  withProps((store) => ({
    coursesResource: rxResource({
      // a string key: the resource compares params by reference, a fresh array would refetch on every tick
      params: () => {
        const audience = store.audience();
        return audience === undefined ? undefined : `${store.appStore.env.tenantId}|${audience.join(',')}`;
      },
      stream: ({ params }) => {
        const [tenantId, audience] = params.split('|');
        return store.coursesService.getCourses(tenantId, audience ? (audience.split(',') as ApplicationKind[]) : []);
      },
      defaultValue: [] as PublicCourse[],
    }),
  })),
  withComputed((state) => ({
    courses: computed(() => state.coursesResource.value()),
    isLoading: computed(() => state.coursesResource.isLoading()),
  })),
  withMethods((store) => ({
    setAudience(audience: ApplicationKind[]): void {
      // keep the signal value when nothing changed, so the resource does not refetch
      if (store.audience()?.join(',') === audience.join(',')) return;
      patchState(store, { audience });
    },
  }))
);
