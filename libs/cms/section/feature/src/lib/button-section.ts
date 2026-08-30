import { Component, computed, inject, input } from '@angular/core';
import { IonCard, IonCardContent, IonCol, IonGrid, IonRow, ModalController } from '@ionic/angular/standalone';
import {} from '@capacitor/google-maps';

import { ButtonSection, ViewPosition } from '@okr/shared-models';
import { OptionalCardHeader, Spinner } from '@okr/shared-ui';
import { warn } from '@okr/shared-util-core';

import { isReservation } from '@okr/relationship-reservation-util';
import { ReservationService } from '@okr/relationship-reservation-data-access';

import { ButtonWidget, EmergencyButtonWidget } from '@okr/cms-section-ui';
import { resolveButtonModal } from '@okr/cms-section-util';
import { SectionStore } from './section.store';



@Component({
  selector: 'okr-button-section',
  standalone: true,
  imports: [
    Spinner, ButtonWidget, EmergencyButtonWidget, OptionalCardHeader,
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
                    <okr-button-widget [section]="section" [i18n]="store.i18n" [editMode]="editMode()" (clicked)="onClick($event)" />
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
                    <okr-button-widget [section]="section" [i18n]="store.i18n" [editMode]="editMode()" (clicked)="onClick($event)" />
                  </ion-col>
                </ion-row>
              </ion-grid>
            }
            @case(VP.Top) {
              <ion-grid>
                <ion-row>
                  <ion-col size="12">
                    <okr-button-widget [section]="section" [i18n]="store.i18n" [editMode]="editMode()" (clicked)="onClick($event)" />
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
                    <okr-button-widget [section]="section" [i18n]="store.i18n" [editMode]="editMode()" (clicked)="onClick($event)" />
                  </ion-col>
                </ion-row>
              </ion-grid>
            }
            @default {  <!-- VP.None -->
              <okr-button-widget [section]="section" [i18n]="store.i18n" [editMode]="editMode()" (clicked)="onClick($event)" />
            }
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