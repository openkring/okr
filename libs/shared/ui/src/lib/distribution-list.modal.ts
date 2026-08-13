import { ChangeDetectionStrategy, Component, computed, inject, input, linkedSignal, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  IonButton, IonButtons, IonCheckbox, IonContent, IonFooter, IonItem, IonLabel, IonList, IonNote,
  IonSegment, IonSegmentButton, IonToolbar, ModalController, ToastController,
} from '@ionic/angular/standalone';
import { signalStore, withProps } from '@ngrx/signals';

import { EmailEntry, mergeEmailList, parseEmailList } from '@okr/shared-util-angular';
import { I18nService } from '@okr/shared-i18n';

import { Header } from './header';
import { TextInput, TextInputI18n } from './text-input';

type Segment = 'to' | 'cc' | 'bcc';

/** One selectable address; `name` is the person/org behind it, empty for manually added ones. */
export interface DistributionEntry {
  email: string;
  name: string;
  selected: boolean;
}

/** What the modal hands back on confirm — ready to drop into the email composer. */
export interface DistributionList {
  to: string[];
  cc: string[];
  bcc: string[];
}

const DistributionStore = signalStore(
  withProps(() => ({ i18nService: inject(I18nService) })),
  withProps(store => ({
    i18n: store.i18nService.translateAll({
      title:       '@shared/ui.distribution.title',
      empty:       '@shared/ui.distribution.empty',
      next:        '@shared/ui.distribution.next',
      segment_to:  '@shared/ui.distribution.segment.to',
      segment_cc:  '@shared/ui.distribution.segment.cc',
      segment_bcc: '@shared/ui.distribution.segment.bcc',
      add_label:   '@shared/ui.distribution.add.label',
      add_ph:      '@shared/ui.distribution.add.placeholder',
      add_helper:  '@shared/ui.distribution.add.helper',
      add_invalid: '@shared/ui.distribution.add.invalid',
    }),
  })),
);

/**
 * Step 1 of the bulk-mail flow: turn a filtered list of persons into a to/cc/bcc distribution list.
 *
 * `to` is seeded with the default org's email addresses (favourite preselected), `cc` is empty and
 * `bcc` holds the resolved recipients. Every segment can be extended with manually typed addresses.
 */
@Component({
  selector: 'okr-distribution-list-modal',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [DistributionStore],
  imports: [
    FormsModule,
    Header, TextInput,
    IonContent, IonFooter, IonToolbar, IonButtons, IonButton,
    IonSegment, IonSegmentButton, IonLabel,
    IonList, IonItem, IonNote, IonCheckbox,
  ],
  template: `
    <okr-header [i18n]="{ title: store.i18n.title() }" [isModal]="true" />
    <ion-content>
      <ion-segment [(ngModel)]="activeSegment">
        <ion-segment-button value="to"><ion-label>{{ store.i18n.segment_to() }}</ion-label></ion-segment-button>
        <ion-segment-button value="cc"><ion-label>{{ store.i18n.segment_cc() }}</ion-label></ion-segment-button>
        <ion-segment-button value="bcc"><ion-label>{{ store.i18n.segment_bcc() }}</ion-label></ion-segment-button>
      </ion-segment>

      <okr-text-input [i18n]="addI18n()" [value]="addField()"
        (valueChange)="addField.set($event)" [readOnly]="false" [maxLength]="500" />
      <ion-item lines="none">
        <ion-buttons slot="end">
          <ion-button fill="outline" size="small" [disabled]="addField().length === 0" (click)="addAddresses()">
            {{ store.i18n.add_label() }}
          </ion-button>
        </ion-buttons>
      </ion-item>

      @if (currentEntries().length === 0) {
        <ion-item lines="none"><ion-note class="ion-padding">{{ store.i18n.empty() }}</ion-note></ion-item>
      } @else {
        <ion-list lines="full">
          @for (entry of currentEntries(); track entry.email) {
            <ion-item>
              <ion-checkbox justify="start" labelPlacement="end"
                [checked]="entry.selected" (ionChange)="toggle(entry.email)">
                <ion-label>
                  @if (entry.name.length > 0) { <p>{{ entry.name }}</p> }
                  {{ entry.email }}
                </ion-label>
              </ion-checkbox>
            </ion-item>
          }
        </ion-list>
      }
    </ion-content>
    <ion-footer>
      <ion-toolbar>
        <ion-buttons slot="end">
          <ion-button color="primary" [disabled]="!canConfirm()" (click)="confirm()">
            {{ store.i18n.next() }} ({{ selectedCount() }})
          </ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-footer>
  `,
})
export class DistributionListModal {
  private readonly modalController = inject(ModalController);
  private readonly toastController = inject(ToastController);
  protected readonly store = inject(DistributionStore);

  // inputs
  /** All email addresses of the default org — the candidates for the `to` segment. */
  public readonly orgEmails = input<string[]>([]);
  /** The org's favourite email address; preselected in `to`. */
  public readonly favOrgEmail = input('');
  /** The resolved recipients of the filtered list — seeded into `bcc`, all selected. */
  public readonly recipients = input<EmailEntry[]>([]);

  protected readonly activeSegment = linkedSignal<Segment>(() => 'to');
  protected readonly addField = signal('');

  private readonly entries = linkedSignal<Record<Segment, DistributionEntry[]>>(() => ({
    to: this.orgEmails().map(email => ({
      email,
      name: '',
      selected: email.toLowerCase() === this.favOrgEmail().toLowerCase(),
    })),
    cc: [],
    bcc: this.recipients().map(r => ({ email: r.email, name: r.memberName, selected: true })),
  }));

  protected readonly currentEntries = computed(() => this.entries()[this.activeSegment()]);
  protected readonly selectedCount = computed(() => this.currentEntries().filter(e => e.selected).length);

  /** Confirmable once there is a sender-side address and at least one real recipient. */
  protected readonly canConfirm = computed(() => {
    const picked = this.entries();
    const count = (s: Segment) => picked[s].filter(e => e.selected).length;
    return count('to') > 0 && count('cc') + count('bcc') > 0;
  });

  protected readonly addI18n = computed(() => ({
    name: 'addAddress',
    label: this.store.i18n.add_label(),
    placeholder: this.store.i18n.add_ph(),
    helper: this.store.i18n.add_helper(),
  } as TextInputI18n));

  /** Parses the input field into the active segment; already-present addresses are ignored. */
  protected async addAddresses(): Promise<void> {
    const segment = this.activeSegment();
    const existing = this.entries()[segment];
    const merged = mergeEmailList(existing.map(e => e.email), this.addField());
    if (merged.length === existing.length) {
      // Nothing was added: either the input held no valid address, or all of them are duplicates.
      if (parseEmailList(this.addField()).length === 0) await this.showInvalidToast();
      this.addField.set('');
      return;
    }
    const added = merged.slice(existing.length).map(email => ({ email, name: '', selected: true }));
    this.entries.update(all => ({ ...all, [segment]: [...existing, ...added] }));
    this.addField.set('');
  }

  protected toggle(email: string): void {
    const segment = this.activeSegment();
    this.entries.update(all => ({
      ...all,
      [segment]: all[segment].map(e => e.email === email ? { ...e, selected: !e.selected } : e),
    }));
  }

  protected async confirm(): Promise<void> {
    const picked = this.entries();
    const selected = (s: Segment) => picked[s].filter(e => e.selected).map(e => e.email);
    const list: DistributionList = { to: selected('to'), cc: selected('cc'), bcc: selected('bcc') };
    await this.modalController.dismiss(list, 'confirm');
  }

  private async showInvalidToast(): Promise<void> {
    const toast = await this.toastController.create({
      message: this.store.i18n.add_invalid(), duration: 3000, color: 'danger', position: 'bottom',
    });
    await toast.present();
  }
}
