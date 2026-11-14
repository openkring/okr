import { Injectable, Signal, effect, inject, untracked } from '@angular/core';
import { Router } from '@angular/router';

import { UserModel, StartPage } from '@okr/shared-models';
import { DepartureSeen, START_PAGE_URLS, shouldJumpToEmergency } from '@okr/shared-util-core';

/**
 * Spec 1.158 §2.3: an app that is already open jumps to the Notfall page once, when the trips trigger marks the
 * signed-in user as crew of an open Logbuch trip (`activeTripKey`) and they opted in. Takes the user as a signal
 * instead of injecting AppStore, which starts it (no circular injection).
 */
@Injectable({ providedIn: 'root' })
export class DepartureNavigationService {
  private readonly router = inject(Router);
  private seen: DepartureSeen | undefined;

  /** Call once, in an injection context (AppStore onInit). */
  public start(currentUser: Signal<UserModel | undefined>): void {
    effect(() => {
      const user = currentUser();
      untracked(() => {
        if (shouldJumpToEmergency(this.seen, user)) {
          const url = START_PAGE_URLS[StartPage.Emergency];
          if (!this.router.url.startsWith(url)) void this.router.navigateByUrl(url);
        }
        this.seen = user?.okey ? { uid: user.okey, activeTripKey: user.activeTripKey ?? '' } : undefined;
      });
    });
  }
}
