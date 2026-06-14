import { ChangeDetectionStrategy, Component, computed, inject, input, linkedSignal, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActionSheetController, ActionSheetOptions, IonButton, IonButtons, IonContent, IonFooter, IonItem, IonLabel, IonList, IonNote, IonSegment, IonSegmentButton, IonToolbar, ModalController, ToastController } from '@ionic/angular/standalone';
import { signalStore, withProps } from '@ngrx/signals';

import { ENV } from '@bk2/shared-config';
import { copyToClipboardWithConfirmation, createActionSheetButton, createActionSheetOptions, EmailEntry } from '@bk2/shared-util-angular';
import { I18nService } from '@bk2/shared-i18n';

import { Header } from './header';

type Segment = 'main' | 'cc';

const EmailAddressStore = signalStore(
  withProps(() => ({ i18nService: inject(I18nService) })),
  withProps(store => ({
    i18n: store.i18nService.translateAll({
      membership_email_title: '@shared/ui.membership.email.title',
      membership_email_empty: '@shared/ui.membership.email.empty',
      membership_email_copy: '@shared/ui.membership.email.copy.label',
      membership_email_copy_conf: '@shared/ui.membership.email.copy.conf',
      membership_email_address_main: '@shared/ui.membership.email.address.main',
      membership_email_address_cc: '@shared/ui.membership.email.address.cc',

      as_edit:  '@shared/ui.actionsheet.address.edit',
      as_view:  '@shared/ui.actionsheet.address.view',
      as_hide:  '@shared/ui.actionsheet.address.hide',
      as_title: '@actionsheet.title',
      cancel:   '@cancel',
    }),
  })),
);

@Component({
  selector: 'bk-email-addresses-modal',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [EmailAddressStore],
  imports: [
    FormsModule,
    Header,
    IonContent, IonFooter, IonToolbar, IonButtons, IonButton,
    IonSegment, IonSegmentButton, IonLabel,
    IonList, IonItem, IonNote,
  ],
  template: `
    <bk-header [i18n]="{ title: title() }" [isModal]="true" />
    <ion-content>
      <ion-segment [(ngModel)]="activeSegment">
        <ion-segment-button value="main">
          <ion-label>{{ store.i18n.membership_email_address_main() }}</ion-label>
        </ion-segment-button>
        <ion-segment-button value="cc">
          <ion-label>{{ store.i18n.membership_email_address_cc() }}</ion-label>
        </ion-segment-button>
      </ion-segment>

      @if(activeSegment() === 'main') {
        @if(visibleMainEmails().length === 0) {
          <ion-item lines="none"><ion-note class="ion-padding">{{ empty() }}</ion-note></ion-item>
        } @else {
          <ion-list lines="full">
            @for(entry of visibleMainEmails(); track entry.email) {
              <ion-item button detail="false" (click)="showActions(entry)">
                <ion-label>
                  <p>{{ entry.memberName }}</p>
                  {{ entry.email }}
                </ion-label>
              </ion-item>
            }
          </ion-list>
        }
      }

      @if(activeSegment() === 'cc') {
        @if(visibleCcEmails().length === 0) {
          <ion-item lines="none"><ion-note class="ion-padding">{{ empty() }}</ion-note></ion-item>
        } @else {
          <ion-list lines="full">
            @for(entry of visibleCcEmails(); track entry.email) {
              <ion-item button detail="false" (click)="showActions(entry)">
                <ion-label>
                  <p>{{ entry.memberName }}</p>
                  {{ entry.email }}
                </ion-label>
              </ion-item>
            }
          </ion-list>
        }
      }
    </ion-content>
    <ion-footer>
      <ion-toolbar>
        <ion-buttons slot="end">
          <ion-button color="primary" [disabled]="currentCount() === 0" (click)="copy()">
            {{ copy2() }} ({{ currentCount() }})
          </ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-footer>
  `
})
export class EmailAddressesModal {
  private readonly actionSheetController = inject(ActionSheetController);
  private readonly modalController = inject(ModalController);
  private readonly toastController = inject(ToastController);
  private readonly env = inject(ENV);
  protected readonly store = inject(EmailAddressStore);

  // inputs
  public mainEmails = input.required<EmailEntry[]>();
  public ccEmails = input.required<EmailEntry[]>();
  public canChange = input(false);

  // i18n
  protected title = computed(() => this.store.i18n.membership_email_title());
  protected empty = computed(() => this.store.i18n.membership_email_empty());
  protected copy2 = computed(() => this.store.i18n.membership_email_copy());
  protected copy_conf = computed(() => this.store.i18n.membership_email_copy_conf());

  // signals
  protected readonly activeSegment = linkedSignal<Segment>(() => 'main');
  private readonly hiddenEmails = signal<Set<string>>(new Set());

  // derived
  protected readonly visibleMainEmails = computed(() =>
    this.mainEmails()
      .filter(e => !this.hiddenEmails().has(e.email))
      .sort((a, b) => a.lastName.localeCompare(b.lastName))
  );

  protected readonly visibleCcEmails = computed(() =>
    this.ccEmails().filter(e => !this.hiddenEmails().has(e.email))
  );

  protected readonly currentCount = computed(() =>
    this.activeSegment() === 'main' ? this.visibleMainEmails().length : this.visibleCcEmails().length
  );

  // actions
  protected async showActions(entry: EmailEntry): Promise<void> {
    const url = this.env.services.imgixBaseUrl;
    const opts: ActionSheetOptions = createActionSheetOptions(this.store.i18n.as_title());
    if (this.canChange()) {
      opts.buttons.push(createActionSheetButton('person.edit', this.store.i18n.as_edit(), url, 'edit'));
    } else {
      opts.buttons.push(createActionSheetButton('person.view', this.store.i18n.as_view(), url, 'show'));
    }
    opts.buttons.push(createActionSheetButton('address.hide', this.store.i18n.as_hide(), url, 'eye-off'));
    opts.buttons.push(createActionSheetButton('cancel', this.store.i18n.cancel(), url, 'cancel'));

    const sheet = await this.actionSheetController.create(opts);
    await sheet.present();
    const { data } = await sheet.onDidDismiss();
    if (!data) return;

    switch (data.action) {
      case 'person.edit':
        await this.modalController.dismiss({ memberKey: entry.memberKey, readOnly: false }, 'navigate');
        break;
      case 'person.view':
        await this.modalController.dismiss({ memberKey: entry.memberKey, readOnly: true }, 'navigate');
        break;
      case 'address.hide':
        this.hiddenEmails.update(hidden => new Set([...hidden, entry.email]));
        break;
    }
  }

  protected async copy(): Promise<void> {
    const emails = this.activeSegment() === 'main' ? this.visibleMainEmails() : this.visibleCcEmails();
    const text = emails.map(e => e.email).join(', ');
    await copyToClipboardWithConfirmation(this.toastController, text, this.copy_conf());
  }
}
