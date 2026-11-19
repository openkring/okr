import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { catchError, Observable, of } from 'rxjs';

import { ENV } from '@okr/shared-config';
import type { ApplicationKind } from '@okr/shared-models';
import type { PublicCourse } from '@okr/shared-util-core';

/**
 * Reads the announced courses through the `publicApi` Cloud Function (spec 1.166 §5). Like the
 * public gallery, this is the only path: places are counted from applications, which an app
 * visitor cannot read.
 */
@Injectable({ providedIn: 'root' })
export class PublicCoursesService {
  private readonly http = inject(HttpClient);
  private readonly env = inject(ENV);

  private readonly baseUrl =
    `https://europe-west6-${this.env.firebase.projectId}.cloudfunctions.net/publicApi/public/api/v1`;

  /** Announced courses offered to at least one of the audiences (`[]` = all); `[]` on an error. */
  public getCourses(tenantId: string, audience: ApplicationKind[]): Observable<PublicCourse[]> {
    let url = `${this.baseUrl}/courses?tenantId=${encodeURIComponent(tenantId)}`;
    if (audience.length > 0) url += `&audience=${audience.map(encodeURIComponent).join(',')}`;
    return this.http.get<PublicCourse[]>(url).pipe(
      catchError((error) => {
        console.error('PublicCoursesService.getCourses failed', error);
        return of([] as PublicCourse[]);
      })
    );
  }
}
