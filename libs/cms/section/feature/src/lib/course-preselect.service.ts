import { computed, Injectable, signal } from '@angular/core';

/**
 * Channel between a course section's «Jetzt anmelden» button and the Anmeldung form on the same
 * page (spec 1.166 §8). The form that has a course field applies the request and clears it.
 */
@Injectable({ providedIn: 'root' })
export class CoursePreselectService {
  private readonly _requested = signal('');
  private readonly formCount = signal(0);

  /** the course key to tick; '' = none */
  public readonly requested = this._requested.asReadonly();
  /** a form with a course field is mounted */
  public readonly courseFormPresent = computed(() => this.formCount() > 0);

  public request(courseKey: string): void {
    this._requested.set(courseKey);
  }

  public clear(): void {
    this._requested.set('');
  }

  /** counts a mounted course form; returns the function that unregisters it (once) */
  public registerCourseForm(): () => void {
    this.formCount.update((n) => n + 1);
    let done = false;
    return () => {
      if (done) return;
      done = true;
      this.formCount.update((n) => n - 1);
    };
  }
}
