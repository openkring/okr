import { Component, inject } from '@angular/core';
import { Router } from '@angular/router';

import { AppStore } from '@okr/shared-feature';
import { navigateByUrl } from '@okr/shared-util-angular';
import { ActivityService } from '@okr/activity-data-access';
import { AuthService } from '@okr/auth-data-access';

/**
 * Headless page for the /auth/logout route: performs the sign-out and redirects to
 * /auth/login. The main menu already intercepts '/auth/logout' before routing
 * (see MenuStore.select), so this page is reached only via direct navigation
 * (typed URL, deep link, browser back/forward).
 */
@Component({
  selector: 'okr-logout-page',
  standalone: true,
  template: '',
})
export class LogoutPage {
  private readonly router = inject(Router);
  private readonly appStore = inject(AppStore);
  private readonly authService = inject(AuthService);
  private readonly activityService = inject(ActivityService);

  constructor() {
    void this.logout();
  }

  private async logout(): Promise<void> {
    const email = this.appStore.loginEmail() ?? '';
    await this.activityService.logAuth('logout', 'on url: ' + email); // user still authenticated here; errors are swallowed
    const loggedOut = await this.authService.logout(this.appStore.currentUser());
    if (loggedOut) await navigateByUrl(this.router, '/auth/login');
  }
}
