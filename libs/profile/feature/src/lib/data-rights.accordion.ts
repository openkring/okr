import { Component, computed, inject, input, signal } from '@angular/core';
import {
  IonAccordion, IonButton, IonCol, IonGrid, IonItem, IonLabel, IonNote, IonRow,
  IonSpinner, IonText, ModalController,
} from '@ionic/angular/standalone';

import { AppStore } from '@okr/shared-feature';
import { PrivacyRightsService } from '@okr/profile-data-access';
import { ProfileI18n } from '@okr/profile-util';
import { acceptPolicyPatch, needsPolicyAcceptance } from '@okr/user-util';
import { DateFormat, getTodayStr } from '@okr/shared-util-core';

import { ProfileStore } from './profile.store';

/**
 * The member's data-subject rights (privacy 1.19, Phase 5A/5B), as its own accordion next
 * to the privacy preferences: the privacy-policy acceptance record, "Meine Daten
 * herunterladen" and "Meine Daten löschen".
 *
 * It sits in `feature` rather than in `profile-privacy.form.ts` (`ui`), which is where the
 * plan sketched it: these three controls call Cloud Functions and open a modal, and a `ui`
 * component may not inject a service. `EmailSignatureAccordion` established the same split
 * on this very page — the accordion is a feature component, the dumb form stays dumb.
 *
 * The privacy preferences (`usage*`) keep their own accordion: those are edited fields
 * governed by the page's change-confirmation, while everything here is an immediate action
 * with its own confirmation.
 */
@Component({
  selector: 'okr-data-rights-accordion',
  standalone: true,
  imports: [
    IonAccordion, IonItem, IonLabel, IonGrid, IonRow, IonCol, IonNote, IonButton,
    IonSpinner, IonText,
  ],
  styles: [`@media (width <= 600px) { ion-card { margin: 5px; } }`],
  template: `
  <ion-accordion toggle-icon-slot="start" value="data-rights">
    <ion-item slot="header" [color]="color()">
      <ion-label>{{ i18n().policy_title() }}</ion-label>
    </ion-item>
    <div slot="content">
      <ion-grid>

        <!-- policy acceptance — non-blocking: it informs, it never gates the profile -->
        <ion-row>
          <ion-col>
            @if (needsAcceptance()) {
              <ion-item lines="none">
                <ion-label class="ion-text-wrap">
                  <p>{{ i18n().policy_prompt() }}</p>
                  @if (policyPageKey()) {
                    <p><a [href]="policyHref()" target="_blank" rel="noopener">{{ i18n().policy_link() }}</a></p>
                  }
                </ion-label>
                <ion-button slot="end" fill="outline" [disabled]="isAccepting()" (click)="acceptPolicy()">
                  @if (isAccepting()) { <ion-spinner slot="start" name="dots" /> }
                  {{ i18n().policy_accept() }}
                </ion-button>
              </ion-item>
            } @else if (acceptedVersion()) {
              <ion-item lines="none">
                <ion-label class="ion-text-wrap">
                  <ion-note>{{ i18n().policy_accepted() }} ({{ acceptedVersion() }})</ion-note>
                </ion-label>
              </ion-item>
            }
            @if (policyError()) {
              <ion-item lines="none"><ion-text color="danger"><p>{{ i18n().policy_error() }}</p></ion-text></ion-item>
            }
          </ion-col>
        </ion-row>

        <!-- export -->
        <ion-row>
          <ion-col>
            <ion-item lines="none">
              <ion-label class="ion-text-wrap">
                <h3>{{ i18n().export_title() }}</h3>
                <p>{{ i18n().export_description() }}</p>
              </ion-label>
            </ion-item>
            <ion-item lines="none">
              <ion-button [disabled]="isExporting()" (click)="exportMyData()">
                @if (isExporting()) { <ion-spinner slot="start" name="dots" /> }
                {{ isExporting() ? i18n().export_running() : i18n().export_button() }}
              </ion-button>
            </ion-item>
            @if (exportError(); as message) {
              <!-- the rate-limit sentence comes from the server, in German — render it as-is -->
              <ion-item lines="none"><ion-text color="danger"><p>{{ message }}</p></ion-text></ion-item>
            }
          </ion-col>
        </ion-row>

        <!-- erasure -->
        <ion-row>
          <ion-col>
            <ion-item lines="none">
              <ion-label class="ion-text-wrap">
                <h3>{{ i18n().erasure_title() }}</h3>
                <p>{{ i18n().erasure_description() }}</p>
              </ion-label>
            </ion-item>
            <ion-item lines="none">
              <ion-button color="danger" fill="outline" [disabled]="isPreviewing()" (click)="openErasure()">
                @if (isPreviewing()) { <ion-spinner slot="start" name="dots" /> }
                {{ isPreviewing() ? i18n().erasure_loading() : i18n().erasure_button() }}
              </ion-button>
            </ion-item>
            @if (erasureError(); as message) {
              <ion-item lines="none"><ion-text color="danger"><p>{{ message }}</p></ion-text></ion-item>
            }
            @if (erasureDone()) {
              <ion-item lines="none"><ion-label class="ion-text-wrap">{{ i18n().erasure_success() }}</ion-label></ion-item>
            }
          </ion-col>
        </ion-row>

      </ion-grid>
    </div>
  </ion-accordion>
  `,
})
export class DataRightsAccordion {
  private readonly privacyRights = inject(PrivacyRightsService);
  private readonly modalController = inject(ModalController);
  private readonly appStore = inject(AppStore);
  private readonly store = inject(ProfileStore);

  public readonly i18n = input.required<ProfileI18n>();
  public readonly color = input('light');

  protected readonly isAccepting = signal(false);
  protected readonly policyError = signal(false);
  protected readonly isExporting = signal(false);
  protected readonly exportError = signal('');
  protected readonly isPreviewing = signal(false);
  protected readonly erasureError = signal('');
  protected readonly erasureDone = signal(false);

  /** Set locally on a successful accept so the row flips immediately: the user document
   * streams back through AppStore, but the member should not watch a spinner for it. */
  private readonly justAccepted = signal('');

  protected readonly acceptedVersion = computed(
    () => this.justAccepted() || (this.appStore.currentUser()?.policyAcceptedVersion ?? ''),
  );

  /** A tenant that declares no policy version never prompts — `needsPolicyAcceptance`
   * returns false for '', which is what keeps this silent until a tenant sets it. */
  protected readonly needsAcceptance = computed(() => {
    const user = this.appStore.currentUser();
    if (!user) return false;
    if (this.justAccepted()) return false;
    return needsPolicyAcceptance(user, this.appStore.appConfig());
  });

  protected readonly policyPageKey = computed(() => this.appStore.appConfig()?.privacyPolicyPageKey ?? '');
  protected readonly policyHref = computed(() => `/page/${this.policyPageKey()}`);

  /******************************* actions *************************************** */

  protected async acceptPolicy(): Promise<void> {
    const user = this.appStore.currentUser();
    const version = this.appStore.appConfig()?.privacyPolicyVersion ?? '';
    if (!user || version === '' || this.isAccepting()) return;

    this.isAccepting.set(true);
    this.policyError.set(false);
    try {
      const patch = acceptPolicyPatch(version, getTodayStr(DateFormat.StoreDate));
      await this.store.save(undefined, { ...user, ...patch });
      this.justAccepted.set(version);
    } catch {
      this.policyError.set(true);
    } finally {
      this.isAccepting.set(false);
    }
  }

  protected async exportMyData(): Promise<void> {
    if (this.isExporting()) return;
    this.isExporting.set(true);
    this.exportError.set('');

    const result = await this.privacyRights.exportMyData();
    this.isExporting.set(false);

    if (!result.ok) {
      this.exportError.set(result.message);
      return;
    }
    // The signed URL lives 15 minutes and the ZIP holds AHV, dob and IBAN in plaintext:
    // hand it straight to the browser rather than parking it in a signal where it would
    // sit in memory (and in a screenshot) for the rest of the session.
    //
    // NOT window.open: by the time the callable resolves we are no longer in the user
    // gesture, so a popup blocker silently swallows the download. The signed URL carries
    // `Content-Disposition: attachment`, so navigating the current window downloads the ZIP
    // and leaves the profile page exactly where it is.
    window.location.assign(result.value.downloadUrl);
  }

  protected async openErasure(): Promise<void> {
    if (this.isPreviewing()) return;
    this.isPreviewing.set(true);
    this.erasureError.set('');
    this.erasureDone.set(false);

    const preview = await this.privacyRights.previewErasure();
    this.isPreviewing.set(false);

    if (!preview.ok) {
      this.erasureError.set(preview.message);
      return;
    }

    // Dynamic import per the repo's store↔modal rule: this component is provided by the
    // page that also provides ProfileStore, and the modal is only ever needed on demand.
    const { DataErasureModal } = await import('./data-erasure.modal');
    const modal = await this.modalController.create({
      component: DataErasureModal,
      componentProps: { i18n: this.i18n(), preview: preview.value },
    });
    await modal.present();
    const { data } = await modal.onWillDismiss();
    if (data?.erased) this.erasureDone.set(true);
  }
}
