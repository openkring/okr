import { Component, computed, inject, input, linkedSignal, signal } from '@angular/core';
import { IonContent, ModalController } from '@ionic/angular';

import { AvatarInfo, DiaryAlbumModel, DiaryModel, TripModel, UserModel } from '@okr/shared-models';
import { ChangeConfirmation, ChangeConfirmationI18n, Header } from '@okr/shared-ui';
import { coerceBoolean, safeStructuredClone } from '@okr/shared-util-core';
import { dismissOverlay, TAG_EDITOR } from '@okr/shared-util-angular';
import { DEFAULT_TAGS } from '@okr/shared-constants';

import { DiaryI18n, addDiaryAvatar, formatDiaryDate } from '@okr/content-diary-util';
import { DiaryForm } from './diary.form';

/** What a location pick resolved to — a keyed place or free text (the store builds the avatar). */
export interface DiaryLocationPick {
  location: AvatarInfo;
}

@Component({
  selector: 'okr-diary-edit-modal',
  standalone: true,
  imports: [Header, ChangeConfirmation, DiaryForm, IonContent],
  template: `
    <okr-header [i18n]="{ title: headerTitle() }" [isModal]="true" />
    @if (showConfirmation()) {
      <okr-change-confirmation [i18n]="changeConfirmationI18n()" (cancelClicked)="cancel()" (saveClicked)="save()" />
    }
    <ion-content class="ion-no-padding">
      @if (formData(); as formData) {
        <okr-diary-form [formData]="formData" (formDataChange)="onFormDataChange($event)"
          [i18n]="i18n()" [currentUser]="currentUser()" [tenantId]="tenantId()" [allTags]="tagVocabulary()"
          [travelTrips]="travelTrips()" [eventAlbums]="eventAlbums()" [readOnly]="isReadOnly()" [lockDate]="lockDate()" [showForm]="showForm()"
          (locationSelectClicked)="pickLocation()" (personSelectClicked)="pickPerson()"
          (dirty)="formDirty.set($event)" (valid)="formValid.set($event)" />
      }
    </ion-content>
  `,
})
export class DiaryEditModal {
  private readonly modalController = inject(ModalController);

  // inputs — no store/service injected here: the store passes its two pickers in as callbacks
  // (memory: store-modal-dynamic-import — the modal must not inject the store/ModelSelectService
  // back). The ui lib must not depend on @okr/shared-feature, so the callback shape (DiaryLocationPick)
  // is the modal's own type; the store adapts ModelSelectService's LocationSelectResult to it.
  public readonly diary = input.required<DiaryModel>();
  public readonly i18n = input.required<DiaryI18n>();
  public readonly currentUser = input<UserModel | undefined>();
  public readonly tenantId = input.required<string>();
  public readonly allTags = input(DEFAULT_TAGS);
  /** When set, the tag vocabulary is read live (TAG_EDITOR), so a value added via «Werte bearbeiten» validates at once. */
  public readonly tagModel = input('');
  private readonly tagEditor = inject(TAG_EDITOR, { optional: true });
  protected readonly tagVocabulary = computed(() => {
    const tagModel = this.tagModel();
    return tagModel && this.tagEditor ? this.tagEditor.values(tagModel).join(',') : this.allTags();
  });
  public readonly travelTrips = input<TripModel[]>([]);
  public readonly eventAlbums = input<DiaryAlbumModel[]>([]);
  public readonly readOnly = input(false);
  /** Editing an existing entry: scope and date/year/month are locked (see DiaryForm). */
  public readonly lockDate = input(false);
  public readonly selectLocation = input<() => Promise<DiaryLocationPick | undefined>>();
  public readonly selectPerson = input<() => Promise<AvatarInfo | undefined>>();

  protected readonly isReadOnly = computed(() => coerceBoolean(this.readOnly()));
  protected formDirty = signal(false);
  protected formValid = signal(false);
  // `safeStructuredClone<T>` is typed `T | undefined` generically, but `diary` is a required
  // input — the clone is always defined here, so `applyLocation`/`applyPerson` can spread `vm`.
  public formData = linkedSignal(() => safeStructuredClone(this.diary()) as DiaryModel);
  protected showForm = signal(true);

  protected readonly headerTitle = computed(() => {
    const date = formatDiaryDate(this.diary().date);
    if (this.isReadOnly()) return `${this.i18n().view()} ${date}`;
    return this.diary().text ? `${this.i18n().edit()} ${date}` : `${this.i18n().add()} ${date}`;
  });
  protected showConfirmation = computed(() => this.formValid() && this.formDirty());
  protected readonly changeConfirmationI18n = computed(() => ({
    cancel: this.i18n().cancel(), save: this.i18n().save(),
  } as ChangeConfirmationI18n));

  /** Appends a resolved location (the first one is the main location); also reachable directly for tests. */
  public applyLocation(location: AvatarInfo): void {
    this.formDirty.set(true);
    this.formData.update(vm => ({ ...vm, locations: addDiaryAvatar(vm.locations ?? [], location) }));
  }

  /** Appends a resolved person (keyed or free text); also reachable directly for tests. */
  public applyPerson(person: AvatarInfo): void {
    this.formDirty.set(true);
    this.formData.update(vm => ({ ...vm, people: addDiaryAvatar(vm.people ?? [], person) }));
  }

  /** The form asked for a location; run the store's picker callback and apply what it resolved. */
  protected async pickLocation(): Promise<void> {
    const pick = await this.selectLocation()?.();
    if (pick) this.applyLocation(pick.location);
  }

  /** The form asked for a person; run the store's picker callback and apply what it resolved. */
  protected async pickPerson(): Promise<void> {
    const person = await this.selectPerson()?.();
    if (person) this.applyPerson(person);
  }

  public async save(): Promise<void> {
    await dismissOverlay(this.modalController, this.formData(), 'confirm');
  }

  public async cancel(): Promise<void> {
    this.formDirty.set(false);
    this.formData.set(safeStructuredClone(this.diary()) as DiaryModel);
    this.showForm.set(false);
    setTimeout(() => this.showForm.set(true), 0);
  }

  protected onFormDataChange(formData: DiaryModel): void {
    this.formData.set(formData);
  }
}
