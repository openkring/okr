import { Injectable, inject } from '@angular/core';
import { AppStore } from '@okr/shared-feature';
import { type RegisterView, buildRegisterView } from './processing-register.view';

/**
 * The tenant's Bearbeitungsverzeichnis (spec 1.19 Phase 5C).
 *
 * A DI shell around `buildRegisterView`, which holds all the logic and is unit-tested on
 * its own. The split is not ceremony: `AppStore` pulls in `@ionic/angular`, whose
 * directory-style exports break Vitest's ESM resolution, so anything importing this file
 * cannot be tested. Keeping the derivation in a separate, Ionic-free module is what makes
 * it testable at all.
 *
 * Reads `appConfig` and nothing else — no Firestore access. The catalogue is code, and the
 * tenant's own entries ride on `app-config`, which the AppStore already streams.
 */
@Injectable({ providedIn: 'root' })
export class ProcessingRegisterService implements RegisterView {
  private readonly appStore = inject(AppStore);
  private readonly view = buildRegisterView(this.appStore.appConfig);

  public readonly entries = this.view.entries;
  public readonly countries = this.view.countries;
  public readonly categories = this.view.categories;
  public readonly byKey = this.view.byKey;
  public readonly filtered = this.view.filtered;
  public readonly cloudFunctionsFor = this.view.cloudFunctionsFor;
}
