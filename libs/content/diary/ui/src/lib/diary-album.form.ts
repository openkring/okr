import { Component, computed, effect, input, model, output } from '@angular/core';
import { form } from '@angular/forms/signals';
import { IonCard, IonCardContent, IonCol, IonGrid, IonRow } from '@ionic/angular';

import { Avatars } from '@okr/avatar-ui';
import { LONG_NAME_LENGTH } from '@okr/shared-constants';
import { AvatarInfo, DiaryAlbumModel, UserModel } from '@okr/shared-models';
import { ErrorNote, TextInput, TextInputI18n } from '@okr/shared-ui';
import { validateVestTree, vestErrors } from '@okr/shared-util-angular';
import { coerceBoolean } from '@okr/shared-util-core';

import { DiaryI18n, diaryAlbumValidations, eventSlug } from '@okr/content-diary-util';

/**
 * Form for one album (spec 1.114 §4). Person/location albums show the linked avatar with a choose
 * button (the parent runs the picker); event albums show title + slug, the slug following the title
 * while the album is new and read-only afterwards (it is the key entries are matched by).
 */
@Component({
  selector: 'okr-diary-album-form',
  standalone: true,
  imports: [TextInput, ErrorNote, Avatars, IonCard, IonCardContent, IonGrid, IonRow, IonCol],
  styles: [`@media (width <= 600px) { ion-card { margin: 5px; } }`],
  template: `
    @if (showForm()) {
      <form novalidate>
        <ion-card>
          <ion-card-content class="ion-no-padding">
            <ion-grid>
              @if (kind() !== 'event') {
                <ion-row>
                  <ion-col size="12">
                    <okr-avatars [avatars]="refAvatars()" (avatarsChange)="onRefChange($event)"
                      [readOnly]="isReadOnly()" [currentUser]="currentUser()" [maxLength]="1"
                      [title]="kind() === 'person' ? i18n().albums_person_label() : i18n().albums_location_label()"
                      [label]="kind() === 'person' ? i18n().albums_person_select() : i18n().albums_location_select()"
                      [selectIcon]="kind() === 'person' ? 'person' : 'location'"
                      [showButton]="!isReadOnly()" (selectClicked)="selectClicked.emit()" />
                    <okr-error-note [errors]="refErrors()" />
                  </ion-col>
                </ion-row>
              }
              <ion-row>
                <ion-col size="12" size-md="6">
                  <okr-text-input [i18n]="titleI18n()" [value]="title()" (valueChange)="onTitleChange($event)"
                    [autofocus]="true" [maxLength]="longNameLength" [readOnly]="isReadOnly()" />
                  <okr-error-note [errors]="titleErrors()" />
                </ion-col>
                @if (kind() === 'event') {
                  <ion-col size="12" size-md="6">
                    <okr-text-input [i18n]="slugI18n()" [value]="slug()" (valueChange)="onFieldChange('slug', $event)"
                      [showHelper]="true" [readOnly]="isReadOnly() || !isNew()" />
                    <okr-error-note [errors]="slugErrors()" />
                  </ion-col>
                }
              </ion-row>
            </ion-grid>
          </ion-card-content>
        </ion-card>
      </form>
    }
  `,
})
export class DiaryAlbumForm {
  // inputs
  public readonly i18n = input.required<DiaryI18n>();
  public formData = model.required<DiaryAlbumModel>();
  public readonly isNew = input(false);
  public readonly currentUser = input<UserModel | undefined>();
  public readonly readOnly = input(false);
  public readonly showForm = input(true);

  // outputs
  public readonly dirty = output<boolean>();
  public readonly valid = output<boolean>();
  /** The «choose» button was pressed; the parent runs the person or location picker. */
  public readonly selectClicked = output<void>();

  // signal form — wraps formData with Vest validation
  protected readonly albumForm = form(this.formData, (path) => validateVestTree(path, diaryAlbumValidations as any));
  private readonly validationResult = vestErrors(this.albumForm);
  protected readonly titleErrors = computed(() => this.validationResult().getErrors('title'));
  protected readonly slugErrors = computed(() => this.validationResult().getErrors('slug'));
  protected readonly refErrors = computed(() => this.validationResult().getErrors('ref'));

  constructor() {
    effect(() => this.valid.emit(this.albumForm().valid()));
  }

  /** kept in step with the cap the Vest suite enforces on the title */
  protected readonly longNameLength = LONG_NAME_LENGTH;

  protected readonly isReadOnly = computed(() => coerceBoolean(this.readOnly()));
  protected readonly kind = computed(() => this.formData()?.kind ?? 'person');
  protected readonly title = computed(() => this.formData()?.title ?? '');
  protected readonly slug = computed(() => this.formData()?.slug ?? '');
  protected readonly refAvatars = computed<AvatarInfo[]>(() => {
    const ref = this.formData()?.ref;
    return ref ? [ref] : [];
  });

  protected readonly titleI18n = computed<TextInputI18n>(() => ({
    name: 'title', label: this.i18n().albums_title_label(), placeholder: this.i18n().albums_title_placeholder(), helper: '',
  }));
  protected readonly slugI18n = computed<TextInputI18n>(() => ({
    name: 'slug', label: this.i18n().albums_slug_label(), placeholder: '', helper: this.i18n().albums_slug_helper(),
  }));

  /** Once the user has edited the slug by hand, the title no longer overwrites it. */
  private slugTouched = false;

  protected onFieldChange(fieldName: 'title' | 'slug', fieldValue: string): void {
    const value = fieldValue ?? '';
    if (this.formData()?.[fieldName] === value) return;
    if (fieldName === 'slug') this.slugTouched = true;
    this.dirty.emit(true);
    this.formData.update((vm) => ({ ...vm, [fieldName]: value }));
  }

  /** While the album is new and the slug untouched, an event's slug follows its title. */
  protected onTitleChange(title: string): void {
    const value = title ?? '';
    if (this.formData()?.title === value) return;
    this.dirty.emit(true);
    this.formData.update((vm) => ({
      ...vm, title: value, slug: this.isNew() && !this.slugTouched && vm.kind === 'event' ? eventSlug(value) : vm.slug,
    }));
  }

  /** The avatar list is a single-slot list here: removing the avatar clears the ref. */
  protected onRefChange(avatars: AvatarInfo[]): void {
    this.dirty.emit(true);
    this.formData.update((vm) => ({ ...vm, ref: avatars[0] }));
  }
}
