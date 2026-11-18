import { Injectable, inject } from '@angular/core';
import { type RegisterView, buildRegisterView } from './processing-register.view';
import { APP_STORE_MIN } from '@okr/shared-data-access';

/**
 * The tenant's Bearbeitungsverzeichnis (spec 1.19 Phase 5C).
 *
 * A DI shell around `buildRegisterView`, which holds all the logic and is unit-tested on
 * its own. The split predates APP_STORE_MIN: importing `AppStore` pulled in `@ionic/angular`,
 * whose directory-style exports break Vitest's ESM resolution. The token lifts that, but the
 * pure module stays the cheaper thing to test.
 *
 * Reads `appConfig` and nothing else — no Firestore access. The catalogue is code, and the
 * tenant's own entries ride on `app-config`, which AppStore already streams (read here through APP_STORE_MIN).
 */
@Injectable({ providedIn: 'root' })
export class ProcessingRegisterService implements RegisterView {
  private readonly appStore = inject(APP_STORE_MIN);
  private readonly view = buildRegisterView(this.appStore.appConfig);

  public readonly entries = this.view.entries;
  public readonly countries = this.view.countries;
  public readonly categories = this.view.categories;
  public readonly byKey = this.view.byKey;
  public readonly filtered = this.view.filtered;
  public readonly cloudFunctionsFor = this.view.cloudFunctionsFor;
}
