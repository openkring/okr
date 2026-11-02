import { Signal } from '@angular/core';

const PFX = '@calendar/course/feature.';

export const COURSE_I18N_KEYS = {
  course:  PFX + 'course',
  courses: PFX + 'courses',
  empty:   PFX + 'empty',
} satisfies Record<string, string>;

export type CourseI18n = { [K in keyof typeof COURSE_I18N_KEYS]: Signal<string> };
