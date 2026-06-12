import { Component, computed, inject, input, signal } from '@angular/core';
import { ModalController, IonButton, IonButtons, IonContent, IonHeader, IonItem, IonLabel, IonList, IonListHeader, IonTitle, IonToggle, IonToolbar } from '@ionic/angular/standalone';

import { I18nService } from '@bk2/shared-i18n';
import { ExportScope, ScopeAvailability, VcardChannelType, VcardI18n, VCARD_I18N_KEYS, VcardTargetKind } from '@bk2/vcard-util';

const CHANNEL_ORDER: VcardChannelType[] = ['phone', 'email', 'postal', 'web'];

/**
 * Data-driven scope picker for tiers 2/3 (spec §5). A toggle is shown only where
 * the underlying data exists; every available toggle defaults on. Confirming
 * dismisses with the assembled {@link ExportScope}.
 */
@Component({
  selector: 'bk-vcard-export-scope-modal',
  standalone: true,
  imports: [
    IonHeader, IonToolbar, IonTitle, IonButtons, IonButton, IonContent,
    IonList, IonListHeader, IonItem, IonLabel, IonToggle,
  ],
  template: `
    <ion-header>
      <ion-toolbar color="secondary">
        <ion-title>{{ i18n.modal_title() }}</ion-title>
        <ion-buttons slot="end">
          <ion-button (click)="cancel()">{{ i18n.cancel() }}</ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>

    <ion-content>
      <ion-list lines="full">
        <ion-list-header>
          <ion-label>{{ i18n.modal_intro() }}</ion-label>
        </ion-list-header>

        @if(showChannel('phone')) {
          <ion-item>
            <ion-toggle [checked]="phone()" (ionChange)="phone.set($event.detail.checked)">{{ i18n.scope_phone() }}</ion-toggle>
          </ion-item>
        }
        @if(showChannel('email')) {
          <ion-item>
            <ion-toggle [checked]="email()" (ionChange)="email.set($event.detail.checked)">{{ i18n.scope_email() }}</ion-toggle>
          </ion-item>
        }
        @if(showChannel('postal')) {
          <ion-item>
            <ion-toggle [checked]="postal()" (ionChange)="postal.set($event.detail.checked)">{{ i18n.scope_postal() }}</ion-toggle>
          </ion-item>
        }
        @if(showChannel('web')) {
          <ion-item>
            <ion-toggle [checked]="web()" (ionChange)="web.set($event.detail.checked)">{{ i18n.scope_web() }}</ion-toggle>
          </ion-item>
        }
        @if(availability().birthday && kind() === 'person') {
          <ion-item>
            <ion-toggle [checked]="birthday()" (ionChange)="birthday.set($event.detail.checked)">{{ i18n.scope_birthday() }}</ion-toggle>
          </ion-item>
        }
        @if(availability().photo) {
          <ion-item>
            <ion-toggle [checked]="photo()" (ionChange)="photo.set($event.detail.checked)">{{ i18n.scope_photo() }}</ion-toggle>
          </ion-item>
        }
        @if(availability().workRels) {
          <ion-item>
            <ion-toggle [checked]="workRels()" (ionChange)="workRels.set($event.detail.checked)">{{ i18n.scope_workRels() }}</ion-toggle>
          </ion-item>
        }
        @if(availability().personalRels && kind() === 'person') {
          <ion-item>
            <ion-toggle [checked]="personalRels()" (ionChange)="personalRels.set($event.detail.checked)">{{ i18n.scope_personalRels() }}</ion-toggle>
          </ion-item>
        }
      </ion-list>

      <ion-button expand="block" class="ion-margin" (click)="confirm()">{{ i18n.save() }}</ion-button>
    </ion-content>
  `,
})
export class VcardExportScopeModal {
  private readonly modalController = inject(ModalController);
  protected readonly i18n = inject(I18nService).translateAll(VCARD_I18N_KEYS) as VcardI18n;

  public readonly availability = input.required<ScopeAvailability>();
  public readonly kind = input.required<VcardTargetKind>();

  protected readonly phone = signal(true);
  protected readonly email = signal(true);
  protected readonly postal = signal(true);
  protected readonly web = signal(true);
  protected readonly birthday = signal(true);
  protected readonly photo = signal(true);
  protected readonly workRels = signal(true);
  protected readonly personalRels = signal(true);

  protected showChannel(channel: VcardChannelType): boolean {
    return this.availability().addresses.includes(channel);
  }

  private readonly channelState = computed<Record<VcardChannelType, () => boolean>>(() => ({
    phone: this.phone,
    email: this.email,
    postal: this.postal,
    web: this.web,
  }));

  public async confirm(): Promise<void> {
    const av = this.availability();
    const isPerson = this.kind() === 'person';
    const addresses = CHANNEL_ORDER.filter((c) => av.addresses.includes(c) && this.channelState()[c]());
    const scope: ExportScope = {
      identity: true,
      addresses,
      birthday: isPerson && av.birthday && this.birthday(),
      photo: av.photo && this.photo(),
      workRels: av.workRels && this.workRels(),
      personalRels: isPerson && av.personalRels && this.personalRels(),
      orgLinks: false,
    };
    await this.modalController.dismiss(scope, 'confirm');
  }

  public async cancel(): Promise<void> {
    await this.modalController.dismiss(undefined, 'cancel');
  }
}
