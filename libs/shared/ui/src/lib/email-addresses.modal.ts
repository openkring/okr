import { ChangeDetectionStrategy, Component, computed, inject, input, linkedSignal, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActionSheetController, ActionSheetOptions, IonButton, IonButtons, IonContent, IonFooter, IonItem, IonLabel, IonList, IonNote, IonSegment, IonSegmentButton, IonToolbar, ModalController, ToastController } from '@ionic/angular/standalone';

import { ENV } from '@bk2/shared-config';
import { copyToClipboardWithConfirmation, createActionSheetButton, createActionSheetOptions, EmailEntry } from '@bk2/shared-util-angular';

import { Header } from './header';

type Segment = 'main' | 'cc';

@Component({
  selector: 'bk-email-addresses-modal',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormsModule,
    Header,
    IonContent, IonFooter, IonToolbar, IonButtons, IonButton,
    IonSegment, IonSegmentButton, IonLabel,
    IonList, IonItem, IonNote,
  ],
  template: `
    <bk-header title="@membership.operation.emailAddresses.title" [isModal]="true" />
    <ion-content>
      <ion-segment [(ngModel)]="activeSegment">
        <ion-segment-button value="main">
          <ion-label>Hauptadressen</ion-label>
        </ion-segment-button>
        <ion-segment-button value="cc">
          <ion-label>cc: Adressen</ion-label>
        </ion-segment-button>
      </ion-segment>

      @if(activeSegment() === 'main') {
        @if(visibleMainEmails().length === 0) {
          <ion-item lines="none"><ion-note class="ion-padding">{{ '@membership.operation.emailAddresses.empty' }}</ion-note></ion-item>
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
          <ion-item lines="none"><ion-note class="ion-padding">{{ '@membership.operation.emailAddresses.empty' }}</ion-note></ion-item>
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
            {{ '@membership.operation.emailAddresses.copy' }} ({{ currentCount() }})
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

  public mainEmails = input.required<EmailEntry[]>();
  public ccEmails = input.required<EmailEntry[]>();
  public canChange = input(false);

  protected readonly activeSegment = linkedSignal<Segment>(() => 'main');
  private readonly hiddenEmails = signal<Set<string>>(new Set());

  protected readonly visibleMainEmails = computed(() =>
    this.mainEmails().filter(e => !this.hiddenEmails().has(e.email))
  );

  protected readonly visibleCcEmails = computed(() =>
    this.ccEmails().filter(e => !this.hiddenEmails().has(e.email))
  );

  protected readonly currentCount = computed(() =>
    this.activeSegment() === 'main' ? this.visibleMainEmails().length : this.visibleCcEmails().length
  );

  protected async showActions(entry: EmailEntry): Promise<void> {
    const url = this.env.services.imgixBaseUrl;
    const opts: ActionSheetOptions = createActionSheetOptions('@actionsheet.label.choose');
    if (this.canChange()) {
      opts.buttons.push(createActionSheetButton('person.edit', url, 'edit'));
    } else {
      opts.buttons.push(createActionSheetButton('person.view', url, 'show'));
    }
    opts.buttons.push(createActionSheetButton('address.hide', url, 'eye-off'));
    opts.buttons.push(createActionSheetButton('cancel', url, 'cancel'));

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
    await copyToClipboardWithConfirmation(this.toastController, text, '@subject.address.operation.emailCopy.conf');
  }
}
