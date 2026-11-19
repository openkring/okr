import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';

import { ENV } from '@okr/shared-config';
import type { PublicCourse } from '@okr/shared-util-core';

import { PublicCoursesService } from './public-courses.service';

const BASE = 'https://europe-west6-proj-1.cloudfunctions.net/publicApi/public/api/v1/courses';

describe('PublicCoursesService', () => {
  let service: PublicCoursesService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: ENV, useValue: { firebase: { projectId: 'proj-1' } } },
      ],
    });
    service = TestBed.inject(PublicCoursesService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
    vi.restoreAllMocks();
  });

  it('requests tenant and audience', async () => {
    const result = firstValueFrom(service.getCourses('scs', ['youth', 'adult']));
    const req = http.expectOne(`${BASE}?tenantId=scs&audience=youth,adult`);
    const course = { key: 'c1' } as PublicCourse;
    req.flush([course]);
    expect(await result).toEqual([course]);
  });

  it('omits the audience parameter when empty', async () => {
    const result = firstValueFrom(service.getCourses('scs', []));
    http.expectOne(`${BASE}?tenantId=scs`).flush([]);
    expect(await result).toEqual([]);
  });

  it('emits [] on an HTTP error', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const result = firstValueFrom(service.getCourses('scs', ['youth']));
    http.expectOne(`${BASE}?tenantId=scs&audience=youth`).flush('boom', { status: 500, statusText: 'Server Error' });
    expect(await result).toEqual([]);
  });
});
