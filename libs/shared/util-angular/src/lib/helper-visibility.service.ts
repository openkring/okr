import { Injectable, signal } from '@angular/core';

/**
 * The user's «Hilfetexte anzeigen» setting (UserModel.showHelpers), app-wide.
 * AppStore keeps it in step with the current user; every shared-ui field ANDs it with its own
 * `showHelper` input, so switching the setting off hides all helper texts without each form
 * having to pass it down.
 */
@Injectable({ providedIn: 'root' })
export class HelperVisibility {
  public readonly showHelpers = signal(true);
}
