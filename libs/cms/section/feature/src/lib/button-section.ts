import { Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { IonCard, IonCardContent, IonCol, IonGrid, IonRow, ModalController } from '@ionic/angular/standalone';
import {} from '@capacitor/google-maps';

import { ButtonAction, ButtonSection, ViewPosition } from '@okr/shared-models';
import { OptionalCardHeader, Spinner } from '@okr/shared-ui';
import { fill, warn } from '@okr/shared-util-core';

import { isReservation } from '@okr/relationship-reservation-util';
import { ReservationService } from '@okr/relationship-reservation-data-access';

import { ButtonWidget, EmergencyButtonWidget, RequestStatusNote } from '@okr/cms-section-ui';
import { resolveButtonModal } from '@okr/cms-section-util';
import { SectionStore } from './section.store';

/** Result of the `requestContract` callable (spec 1.87); re-declared, the client never imports functions code. */
type ContractRequestResult =
  | { preview: { name: string; street: string; zipCity: string; date: string; kindName: string } }
  | { requested: true }
  | { refused: 'notActive' | 'alreadyOwned' | 'openRequest' | 'noAddress' | 'cooldown' };
/** Result of `getContractRequestStatus` (spec 1.88 §5.3). */
type RequestStatus = { state: 'none' | 'pending' | 'approved' | 'owned' | 'notActive'; text: string; roomId?: string };

@Component({
  selector: 'okr-button-section',
  standalone: true,
  imports: [
    Spinner, ButtonWidget, EmergencyButtonWidget, RequestStatusNote, OptionalCardHeader,
    IonCard, IonCardContent, IonGrid, IonRow, IonCol
  ],
  providers: [SectionStore],
  styles: [`
    ion-card-content { padding: 0px; }
    ion-card { padding: 0px; margin: 0px; border: 0px; box-shadow: none !important;}
  `],
  template: `
    @if(section(); as section) {
      <ion-card>
        <okr-optional-card-header [title]="title()" [subTitle]="subTitle()" />
        <ion-card-content>
          <!-- we need to handle the emergency-button differently because of a different button style and action -->
          @if(name() === 'emergency-button') {
            <ion-grid>
              <ion-row>
                <ion-col size="12">
                  <okr-emergency-button-widget [section]="section" [editMode]="editMode()" (send)="store.sendEmergencyMessage()" />
                </ion-col>
              </ion-row>
              <ion-row>
                <ion-col size="12">
                  <div [innerHTML]="content()"></div>
                </ion-col>
              </ion-row>
            </ion-grid>
          } @else {
          @switch(position()) {
            @case(VP.Left) {
              <ion-grid>
                <ion-row>
                  <ion-col [size]="colSizeButton()">
                    <okr-button-widget [class.ion-hide]="buttonHidden()" [section]="section" [i18n]="store.i18n" [editMode]="editMode()" (clicked)="onClick($event)" (workflow)="onWorkflow()" (contract)="onContract()" />
                  </ion-col>
                  <ion-col [size]="colSizeText()">
                    <div [innerHTML]="content()"></div>
                  </ion-col>
                </ion-row>
              </ion-grid>
            }
            @case(VP.Right) {
              <ion-grid>
                <ion-row>
                  <ion-col [size]="colSizeText()">
                    <div [innerHTML]="content()"></div>
                  </ion-col>
                  <ion-col [size]="colSizeButton()">
                    <okr-button-widget [class.ion-hide]="buttonHidden()" [section]="section" [i18n]="store.i18n" [editMode]="editMode()" (clicked)="onClick($event)" (workflow)="onWorkflow()" (contract)="onContract()" />
                  </ion-col>
                </ion-row>
              </ion-grid>
            }
            @case(VP.Top) {
              <ion-grid>
                <ion-row>
                  <ion-col size="12">
                    <okr-button-widget [class.ion-hide]="buttonHidden()" [section]="section" [i18n]="store.i18n" [editMode]="editMode()" (clicked)="onClick($event)" (workflow)="onWorkflow()" (contract)="onContract()" />
                  </ion-col>
                </ion-row>
                <ion-row>
                  <ion-col size="12">
                    <div [innerHTML]="content()"></div>
                  </ion-col>
                </ion-row>
              </ion-grid>
            }
            @case(VP.Bottom) {
              <ion-grid>
                <ion-row>
                  <ion-col size="12">
                  <div [innerHTML]="content()"></div>
                  </ion-col>
                </ion-row>
                <ion-row>
                  <ion-col size="12">
                    <okr-button-widget [class.ion-hide]="buttonHidden()" [section]="section" [i18n]="store.i18n" [editMode]="editMode()" (clicked)="onClick($event)" (workflow)="onWorkflow()" (contract)="onContract()" />
                  </ion-col>
                </ion-row>
              </ion-grid>
            }
            @default {  <!-- VP.None -->
              <okr-button-widget [class.ion-hide]="buttonHidden()" [section]="section" [i18n]="store.i18n" [editMode]="editMode()" (clicked)="onClick($event)" (workflow)="onWorkflow()" (contract)="onContract()" />
            }
          }
        }
          @if (requestStatus(); as status) {
            @if (status.state !== 'none' && status.text) {
              <okr-request-status-note [text]="status.text" [roomId]="status.roomId" [linkLabel]="store.i18n.contract_status_chat()" />
            }
          }
        </ion-card-content>
      </ion-card>
    } @else {
      <okr-spinner />
    }
  `
})
export class ButtonSectionComponent {
  protected readonly store = inject(SectionStore);
  private modalController = inject(ModalController);
  private reservationService = inject(ReservationService);

  // inputs
  public section = input<ButtonSection>();
  public editMode = input<boolean>(false);

  // computed
  protected name = computed(() => this.section()?.name ?? '');
  protected content = computed(() => this.section()?.content?.htmlContent ?? '<p></p>');
  protected colSizeButton = computed(() => this.section()?.content?.colSize ?? 6);
  protected position = computed(() => this.section()?.content?.position ?? ViewPosition.None);
  protected colSizeText = computed(() => 12 - this.colSizeButton());
  protected readonly title = computed(() => this.section()?.title);
  protected readonly subTitle = computed(() => this.section()?.subTitle);

  public VP = ViewPosition;

  protected readonly requestStatus = signal<RequestStatus | undefined>(undefined);
  /** set right after a successful request until the re-fetched status arrives */
  protected readonly justRequested = signal(false);
  /** Review Focus 5: no status (loading, failed, or a kind without texts) → the button stays */
  protected readonly buttonHidden = computed(() => {
    const s = this.requestStatus();
    return this.justRequested() || (!!s && s.state !== 'none' && s.text.length > 0);
  });
  private readonly isContractButton = computed(() => this.section()?.properties?.action?.type === ButtonAction.Contract);

  constructor() {
    effect(() => {
      if (this.isContractButton() && !this.editMode() && this.section()?.okey) untracked(() => void this.loadRequestStatus());
    });
  }

  private async loadRequestStatus(): Promise<void> {
    const sectionKey = this.section()?.okey ?? '';
    if (!sectionKey) return;
    try {
      const { getFunctions, httpsCallable } = await import('firebase/functions');
      const { getApp } = await import('firebase/app');
      const fn = httpsCallable<{ tenantId: string; sectionKey: string }, RequestStatus>(
        getFunctions(getApp(), 'europe-west6'), 'getContractRequestStatus');
      this.requestStatus.set((await fn({ tenantId: this.store.tenantId(), sectionKey })).data);
    } catch (ex) {
      // the page must stay usable: keep the button, no toast
      warn('ButtonSectionComponent.loadRequestStatus: ' + ex);
    } finally {
      // an empty text (e.g. Skiffplatz) or a failed fetch must not keep the button hidden
      this.justRequested.set(false);
    }
  }

  /**
   * A button's config string decides what opens (spec 2026-08-29 §6a). Until this became a
   * registry it was a single `if (modalType === 'bhres')` — one tenant's boathouse
   * reservation, hard-coded in shared CMS code.
   *
   * An unknown config opens nothing rather than guessing: `resolveButtonModal` is a closed
   * whitelist, so a string an admin typed can never resolve to an arbitrary component.
   */
  protected async onClick(config: string): Promise<void> {
    const target = resolveButtonModal(config);
    if (!target) return;
    if (target.kind === 'form') {
      await this.openFormModal(target.formKey);
      return;
    }
    await this.openDomainModal(target.registryKey);
  }

  /**
   * ButtonAction.Workflow: the press IS the event (spec 2026-08-29 §2).
   *
   * This covers only the case where the intent writes no document — "Schlüssel bestellen",
   * "Ich helfe am Fest mit" (§6d). Anything data-shaped goes through a `form:` button, whose
   * submit fires from the WRITE instead.
   *
   * `sourceName` is deliberately NOT sent: the callable reads it from the section document.
   * Sending it would let any signed-in client fire any rule of its tenant by inventing a name.
   */
  protected async onWorkflow(): Promise<void> {
    const okey = this.section()?.okey ?? '';
    if (!okey) return;
    try {
      const { getFunctions, httpsCallable } = await import('firebase/functions');
      const { getApp } = await import('firebase/app');
      const fn = httpsCallable<{ tenantId: string; kind: string; sourceKey: string; linkKey: string }, unknown>(
        getFunctions(getApp(), 'europe-west6'), 'emitUiEvent',
      );
      await fn({ tenantId: this.store.tenantId(), kind: 'button', sourceKey: okey, linkKey: `section.${okey}` });
    } catch (ex) {
      // A failed trigger must never break the page. The cooldown path does not throw at all.
      warn('ButtonSectionComponent.onWorkflow: ' + ex);
    }
  }

  /**
   * ButtonAction.Contract (spec 1.87 §6.1). Two calls: the first returns the preview or a refusal —
   * so an ineligible member never sees the dialog — the second submits.
   */
  protected async onContract(): Promise<void> {
    const sectionKey = this.section()?.okey ?? '';
    if (!sectionKey) return;
    const i18n = this.store.i18n;
    const refusal = (r: 'notActive' | 'alreadyOwned' | 'openRequest' | 'noAddress' | 'cooldown'): string => {
      const texts = {
        notActive: i18n.contract_refused_notActive,
        alreadyOwned: i18n.contract_refused_alreadyOwned,
        openRequest: i18n.contract_refused_openRequest,
        noAddress: i18n.contract_refused_noAddress,
        cooldown: i18n.contract_refused_cooldown,
      };
      return texts[r]();
    };
    try {
      const { getFunctions, httpsCallable } = await import('firebase/functions');
      const { getApp } = await import('firebase/app');
      const fn = httpsCallable<{ tenantId: string; sectionKey: string; confirm: boolean }, ContractRequestResult>(
        getFunctions(getApp(), 'europe-west6'), 'requestContract');
      const tenantId = this.store.tenantId();
      const first = (await fn({ tenantId, sectionKey, confirm: false })).data;
      if ('refused' in first) { await this.toast(refusal(first.refused)); return; }
      if ('requested' in first) { await this.afterRequested(); return; }
      if (!('preview' in first)) return;
      const alert = await this.store.alertController.create({
        header: fill(i18n.contract_confirm_header(), first.preview),
        message: fill(i18n.contract_confirm_message(), first.preview),
        buttons: [
          { text: i18n.contract_confirm_cancel(), role: 'cancel' },
          { text: i18n.contract_confirm_ok(), role: 'confirm' },
        ],
      });
      await alert.present();
      if ((await alert.onDidDismiss()).role !== 'confirm') return;
      const second = (await fn({ tenantId, sectionKey, confirm: true })).data;
      if ('refused' in second) { await this.toast(refusal(second.refused)); return; }
      await this.afterRequested();
    } catch (ex) {
      warn('ButtonSectionComponent.onContract: ' + ex);
      await this.toast(i18n.contract_error());
    }
  }

  /** spec 1.88 §5.4: hide the button at once; the approval is created asynchronously, so re-fetch after a moment */
  private async afterRequested(): Promise<void> {
    this.justRequested.set(true);
    await this.toast(this.store.i18n.contract_requested());
    setTimeout(() => void this.loadRequestStatus(), 4000);
  }

  private async toast(message: string): Promise<void> {
    const t = await this.store.toastController.create({ message, duration: 4000, position: 'bottom' });
    await t.present();
  }

  /** Any form-builder definition, behind any button, with no code per form. */
  private async openFormModal(formKey: string): Promise<void> {
    const { FormModal } = await import('@okr/forms-ui');
    const modal = await this.modalController.create({
      component: FormModal,
      componentProps: {
        formKey,
        tenantId: this.store.tenantId(),
        title: this.title() ?? '',
        i18n: this.store.i18n,
        categories: this.store.appStore.allCategories(),
      },
    });
    await modal.present();
    // Nothing to do on dismissal: the consequence of a submit is the WRITE's own workflow
    // event (§6b), never something this component reacts to. That is what makes an import or
    // an admin edit produce the same consequence as this click.
    await modal.onDidDismiss();
  }

  /**
   * A domain modal with typed logic. `await import()` keeps the reservation feature out of
   * the CMS eager bundle — and out of the bundle of every tenant that has no boathouse.
   */
  private async openDomainModal(registryKey: string): Promise<void> {
    if (registryKey !== 'reservation-apply') return;
    const { ReservationApplyModal } = await import('@okr/relationship-reservation-feature');
    const modal = await this.modalController.create({ component: ReservationApplyModal });
    await modal.present();
    const { data, role } = await modal.onDidDismiss();
    if (role !== 'confirm' || !data) return;
    if (!isReservation(data, this.store.tenantId())) return;
    // The task for the responsible person is NOT opened here any more: `reservation.created`
    // fires from the collection's onDocumentCreated emitter, and a rule
    // `reservation.created` + `paramIs:resourceType=<type>` -> openTask configures it without
    // code. That closes the old `// tbd: add a task to responsible`.
    // Still open: adding the reservation as a calevent (tracked with the reservation feature).
    try {
      await this.reservationService.create(data, this.store.currentUser());
    } catch (ex) {
      warn('ButtonSectionComponent.openDomainModal: ' + ex);
    }
  }
}