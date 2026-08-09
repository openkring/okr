import { Component, computed, effect, inject, input, linkedSignal, signal, untracked } from '@angular/core';
import {
  IonCard, IonCardContent, IonCardHeader, IonCardSubtitle, IonContent, IonItem, IonLabel, IonList,
} from '@ionic/angular/standalone';

import { AppStore } from '@okr/shared-feature';
import { TicketModel } from '@okr/shared-models';
import { ChangeConfirmation, ChangeConfirmationI18n, Header, Spinner } from '@okr/shared-ui';
import { hasRole, safeStructuredClone } from '@okr/shared-util-core';

import { TicketForm } from '@okr/business-ticket-ui';

import { TicketStore } from './ticket.store';

/**
 * One escalation in full (C4 §4): the partner's report, the triage block, and the thread.
 *
 * A **page, not a modal**, unlike most detail views in the app — an escalation is worked over days
 * and referred to by URL in an e-mail or a Sentry issue, which a modal has no way to be.
 *
 * The form is seeded **once**, through an `effect` + `untracked`, not through a `linkedSignal` over
 * the store's computed. The ticket comes from a live Firestore stream, so a `linkedSignal` would
 * re-run and silently wipe a half-typed classification reason every time the comment thread or the
 * SLA fields changed underneath — the trap `linkedSignal-over-rxResource-wipes-forms` records.
 */
@Component({
  selector: 'okr-ticket-page',
  standalone: true,
  imports: [
    Header, ChangeConfirmation, Spinner, TicketForm,
    IonContent, IonCard, IonCardHeader, IonCardSubtitle, IonCardContent, IonList, IonItem, IonLabel,
  ],
  providers: [TicketStore],
  template: `
    <okr-header [i18n]="{ title: headerTitle() }" />
    @if(showConfirmation()) {
      <okr-change-confirmation [i18n]="changeConfirmationI18n()" (cancelClicked)="cancel()" (saveClicked)="save()" />
    }
    <ion-content class="ion-no-padding">
      @if(!ticket()) {
        <okr-spinner />
      } @else if(formData(); as formData) {
        <okr-ticket-form
          [formData]="formData"
          (formDataChange)="onFormDataChange($event)"
          [currentUser]="store.currentUser()"
          [tenantId]="appStore.tenantId()"
          [showForm]="showForm()"
          [readOnly]="readOnly()"
          [i18n]="store.i18n"
          (dirty)="formDirty.set($event)"
          (valid)="formValid.set($event)"
        />

        <ion-card>
          <ion-card-header>
            <ion-card-subtitle>{{ store.i18n.comment_thread() }}</ion-card-subtitle>
          </ion-card-header>
          <ion-card-content class="ion-no-padding">
            <ion-list lines="inset">
              @for(comment of store.comments(); track comment.okey) {
                <ion-item>
                  <ion-label class="ion-text-wrap">
                    <h3>{{ comment.authorName }}</h3>
                    <p>{{ comment.description }}</p>
                  </ion-label>
                </ion-item>
              }
            </ion-list>
          </ion-card-content>
        </ion-card>
      }
    </ion-content>
  `,
})
export class TicketPage {
  protected readonly store = inject(TicketStore);
  protected readonly appStore = inject(AppStore);

  /** Route param — `/ticket/:ticketKey`. */
  public readonly ticketKey = input.required<string>();

  protected readonly ticket = computed(() => this.store.currentTicket());
  protected readonly readOnly = computed(() => !hasRole('admin', this.store.currentUser()));

  protected formDirty = signal(false);
  protected formValid = signal(false);
  protected showForm = signal(true);
  protected formData = linkedSignal<TicketModel | undefined>(() => undefined);

  protected readonly headerTitle = computed(() => this.ticket()?.name ?? this.store.i18n.plural());
  protected showConfirmation = computed(() => this.formValid() && this.formDirty() && !this.readOnly());
  protected readonly changeConfirmationI18n = computed(() => ({
    cancel: this.store.i18n.changeConfirmation_cancel(),
    save: this.store.i18n.changeConfirmation_ok(),
  } as ChangeConfirmationI18n));

  constructor() {
    effect(() => this.store.setTicketKey(this.ticketKey()));
    // Seed once per ticket: the read is tracked, the write is not, so a later stream emission on the
    // same ticket does not reach back into what the operator is typing.
    effect(() => {
      const ticket = this.ticket();
      if (!ticket) return;
      untracked(() => {
        if (this.formData()?.okey !== ticket.okey) this.formData.set(safeStructuredClone(ticket));
      });
    });
  }

  /** The store decides what actually changed and which callables to run, in which order. */
  public async save(): Promise<void> {
    const edited = this.formData();
    const original = this.ticket();
    if (!edited || !original) return;
    await this.store.saveTriage(edited, original);
    this.formDirty.set(false);
  }

  public cancel(): void {
    this.formDirty.set(false);
    const ticket = this.ticket();
    if (ticket) this.formData.set(safeStructuredClone(ticket));
    this.showForm.set(false);
    setTimeout(() => this.showForm.set(true), 0);   // force a fresh form → clears stale Vest state
  }

  protected onFormDataChange(formData: TicketModel): void {
    this.formData.set(formData);
  }
}
