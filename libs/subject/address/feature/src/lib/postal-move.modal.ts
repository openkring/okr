import { Component, computed, DestroyRef, inject, input, linkedSignal, OnInit, signal } from '@angular/core';
import { IonContent, ModalController, ToastController } from '@ionic/angular';

import { AddressModel } from '@okr/shared-models';
import { AppStore } from '@okr/shared-feature';
import { I18nService } from '@okr/shared-i18n';
import { ChangeConfirmation, ChangeConfirmationI18n, Header } from '@okr/shared-ui';
import { dismissOverlay, showToast } from '@okr/shared-util-angular';
import { DateFormat, getTodayStr, warn } from '@okr/shared-util-core';

import { AddressService } from '@okr/subject-address-data-access';
import { PostalMoveForm, PostalSearchState } from '@okr/subject-address-ui';
import {
  ADDRESSES_I18N_KEYS, AddressesI18n, checkEditMove, checkMove, moveActionKind, newPostalMoveFormModel, POSTAL_MOVE_ERROR_I18N, postalMoveErrorKind, PostalMoveFormModel,
  PostalMoveMode, postalTarget, SwissAddressHit,
} from '@okr/subject-address-util';

const SEARCH_DEBOUNCE_MS = 300;
const MIN_QUERY_LENGTH = 3;

/**
 * «Ich ziehe um» / «Wir ziehen um» / «Umzug erfassen» (move), «Adresse korrigieren» (correct) and
 * «Umzug bearbeiten» (edit-move), spec 1.164 §6.1–§6.2. Saves through the move callables and stays
 * open with a toast when the server refuses, so nothing typed is lost. Lives in `feature` because it
 * runs the swisstopo search and the save through AddressService.
 */
@Component({
  selector: 'okr-postal-move-modal',
  standalone: true,
  imports: [PostalMoveForm, Header, ChangeConfirmation, IonContent],
  template: `
    <okr-header [i18n]="{ title: headerTitle() }" [isModal]="true" />
    @if (showConfirmation()) {
      <okr-change-confirmation [i18n]="changeConfirmationI18n()" (cancelClicked)="cancel()" (saveClicked)="save()" />
    }
    <ion-content class="ion-no-padding">
      @if (formData(); as data) {
        <okr-postal-move-form
          [i18n]="i18n"
          [formData]="data"
          (formDataChange)="formData.set($event)"
          [mode]="mode()"
          [hits]="hits()"
          [searchState]="searchState()"
          [showForm]="showForm()"
          (queryChange)="onQueryChange($event)"
          (dirty)="formDirty.set($event)"
          (valid)="formValid.set($event)"
        />
      }
    </ion-content>
  `,
})
export class PostalMoveModal implements OnInit {
  private readonly modalController = inject(ModalController);
  private readonly toastController = inject(ToastController);
  private readonly addressService = inject(AddressService);
  private readonly appStore = inject(AppStore);
  protected readonly i18n = inject(I18nService).translateAll(ADDRESSES_I18N_KEYS) as AddressesI18n;

  // inputs
  public readonly mode = input.required<PostalMoveMode>();
  public readonly parentKey = input.required<string>();
  /** the row the action sheet was opened on: the current row (move, correct) or the announced one (edit-move) */
  public readonly residence = input<AddressModel>();
  /** the parent's postal rows as the accordion read them: the client-side checks mirror the server's refusals */
  public readonly rows = input<AddressModel[]>([]);

  // signals
  protected readonly formDirty = signal(false);
  protected readonly formValid = signal(false);
  protected readonly showForm = signal(true);
  protected readonly hits = signal<SwissAddressHit[]>([]);
  protected readonly searchState = signal<PostalSearchState>('idle');
  private readonly saving = signal(false);
  /** edit-move: the announced row is already cancelled (the record after it failed); a retry only records */
  private readonly announcedCancelled = signal(false);
  private readonly initialModel = computed(() => this.buildInitialModel());
  protected readonly formData = linkedSignal(() => this.initialModel());

  // derived
  protected readonly showConfirmation = computed(() => this.formValid() && this.formDirty() && !this.saving());
  protected readonly changeConfirmationI18n = computed(() => ({ cancel: this.i18n.cancel(), save: this.i18n.save() } as ChangeConfirmationI18n));
  protected readonly headerTitle = computed(() => {
    switch (this.mode()) {
      case 'correct': return this.i18n.move_correct();
      case 'edit-move': return this.i18n.move_edit();
      default:
        switch (moveActionKind(this.appStore.currentUser(), this.parentKey())) {
          case 'own': return this.i18n.move_own();
          case 'org': return this.i18n.move_org();
          default: return this.i18n.move_other();
        }
    }
  });

  private searchTimer: ReturnType<typeof setTimeout> | undefined;
  private searchSeq = 0;

  constructor() {
    inject(DestroyRef).onDestroy(() => clearTimeout(this.searchTimer));
  }

  /** a correction / an edited move starts with the row's address already searched */
  public ngOnInit(): void {
    const query = this.initialModel().query;
    if (query) void this.search(query);
  }

  /** move: an empty CH form from today; correct / edit-move: the row's c/o line and date, its address as search text. */
  private buildInitialModel(): PostalMoveFormModel {
    const row = this.residence();
    const mode = this.mode();
    if (mode === 'move' || !row) return newPostalMoveFormModel(getTodayStr(DateFormat.StoreDate));
    const model = newPostalMoveFormModel(mode === 'edit-move' ? row.validFrom : '', row.countryCode || 'CH');
    model.addressValue2 = row.addressValue2 ?? '';
    if (model.countryCode === 'CH') {
      model.query = [row.streetName, row.streetNumber, row.zipCode, row.city].filter((v) => !!v).join(' ');
    } else {
      model.manual = { streetName: row.streetName, streetNumber: row.streetNumber, zipCode: row.zipCode, city: row.city, countryCode: model.countryCode };
    }
    return model;
  }

  /******************************* search *************************************** */
  protected onQueryChange(query: string): void {
    clearTimeout(this.searchTimer);
    this.searchTimer = setTimeout(() => this.search(query), SEARCH_DEBOUNCE_MS);
  }

  private async search(query: string): Promise<void> {
    const seq = ++this.searchSeq;
    if (query.trim().length < MIN_QUERY_LENGTH) {
      this.hits.set([]);
      this.searchState.set('idle');
      return;
    }
    this.searchState.set('searching');
    try {
      const hits = await this.addressService.searchSwissAddress(query.trim());
      if (seq !== this.searchSeq) return;   // a newer query is on its way
      this.hits.set(hits);
      this.searchState.set('done');
    } catch (error) {
      if (seq !== this.searchSeq) return;
      warn(`PostalMoveModal.search: ${(error as Error)?.message ?? error}`);
      this.hits.set([]);
      this.searchState.set('error');   // the form falls back to the manual fields
    }
  }

  /******************************* actions *************************************** */
  public async save(): Promise<void> {
    const model = this.formData();
    const row = this.residence();
    if (this.mode() !== 'move' && !row) return;
    // refuse on the client what the server would refuse — above all before «Umzug bearbeiten» cancels anything
    const check = this.mode() === 'correct' ? undefined
      : this.mode() === 'edit-move' && row ? checkEditMove(row, this.rows(), model.validFrom)
      : checkMove(this.rows(), row, model.validFrom);
    if (check && !check.ok) {
      await showToast(this.toastController, this.i18n[POSTAL_MOVE_ERROR_I18N[check.reason]]());
      return;
    }
    this.saving.set(true);
    try {
      if (this.mode() === 'correct' && row) {
        await this.addressService.correctAddress(row.okey, postalTarget(model), model.addressValue2);
        await showToast(this.toastController, this.i18n.move_corrected());
      } else if (check?.ok) {
        // «Umzug bearbeiten» has no own callable: cancel the announced move once, then record it again.
        // A retry after a failed record only records — the announced row is archived by then.
        if (this.mode() === 'edit-move' && row && !this.announcedCancelled()) {
          await this.addressService.cancelMove(row.okey);
          this.announcedCancelled.set(true);
        }
        await this.addressService.recordMove({
          parentKey: this.parentKey(),
          fromResidenceKey: check.fromResidenceKey,
          addressUsage: check.fromResidenceKey ? undefined : check.addressUsage,
          target: postalTarget(model),
          addressValue2: model.addressValue2,
          validFrom: model.validFrom,
        });
        await showToast(this.toastController, this.i18n.move_saved());
      }
      await dismissOverlay(this.modalController, model, 'confirm');
    } catch (error) {
      warn(`PostalMoveModal.save(${this.mode()}): ${(error as Error)?.message ?? error}`);
      const message = this.announcedCancelled()
        ? this.i18n.move_edit_removed()
        : this.i18n[POSTAL_MOVE_ERROR_I18N[postalMoveErrorKind(error)]]();
      await showToast(this.toastController, message);
    } finally {
      this.saving.set(false);
    }
  }

  public cancel(): void {
    this.formDirty.set(false);
    this.formData.set(this.initialModel());
    void this.search(this.initialModel().query);
    this.showForm.set(false);
    setTimeout(() => this.showForm.set(true), 0);
  }
}
