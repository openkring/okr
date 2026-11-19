import { beforeEach, describe, expect, it } from 'vitest';
import { TestBed } from '@angular/core/testing';

import { CoursePreselectService } from './course-preselect.service';

describe('CoursePreselectService', () => {
  let service: CoursePreselectService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(CoursePreselectService);
  });

  it('starts empty', () => {
    expect(service.requested()).toBe('');
    expect(service.courseFormPresent()).toBe(false);
  });

  it('request sets the key and a later request replaces it', () => {
    service.request('k');
    expect(service.requested()).toBe('k');
    service.request('m');
    expect(service.requested()).toBe('m');
  });

  it('clear empties the request', () => {
    service.request('k');
    service.clear();
    expect(service.requested()).toBe('');
  });

  it('counts registered course forms', () => {
    const off1 = service.registerCourseForm();
    const off2 = service.registerCourseForm();
    expect(service.courseFormPresent()).toBe(true);
    off1();
    expect(service.courseFormPresent()).toBe(true);
    off2();
    expect(service.courseFormPresent()).toBe(false);
  });

  it('an unregister function works only once', () => {
    const off1 = service.registerCourseForm();
    service.registerCourseForm();
    off1();
    off1();
    expect(service.courseFormPresent()).toBe(true);
  });
});
