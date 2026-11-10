import { Component, computed, effect, input, model, output } from '@angular/core';
import { form } from '@angular/forms/signals';
import { IonCard, IonCardContent, IonCardHeader, IonCardTitle, IonCol, IonGrid, IonItem, IonLabel, IonRow } from '@ionic/angular';

import { CaseInsensitiveWordMask } from '@okr/shared-config';
import { CategoryListModel, PageModel, RoleName, UserModel } from '@okr/shared-models';
import { ButtonCopy, ButtonCopyI18n, CategorySelect, Chips, ErrorNote, ImageUrlInput, ImageUrlInputI18n, NotesInput, NotesInputI18n, StringList, StringSelect, StringSelectI18n, TextInput, TextInputI18n } from '@okr/shared-ui';
import { validateVestTree, vestErrors } from '@okr/shared-util-angular';
import { coerceBoolean, hasRole } from '@okr/shared-util-core';
import { DEFAULT_BLOG_TYPE, DEFAULT_CONTENT_STATE, DEFAULT_KEY, DEFAULT_NAME, DEFAULT_NOTES, DEFAULT_PAGE_TYPE, DEFAULT_TAGS, DEFAULT_TITLE, DESCRIPTION_LENGTH, NAME_LENGTH, URL_LENGTH } from '@okr/shared-constants';

import { PAGE_ABSTRACT_LENGTH, PageI18n, pageValidations } from '@okr/cms-page-util';

@Component({
  selector: 'okr-page-form',
  standalone: true,
  imports: [
    Chips, NotesInput, TextInput, ImageUrlInput, StringList, ButtonCopy, ErrorNote, CategorySelect, StringSelect,
    IonLabel, IonCard, IonCardHeader, IonCardTitle, IonCardContent, IonItem, IonGrid, IonRow, IonCol
  ],
  styles: [`@media (width <= 600px) { ion-card { margin: 5px;} }`],
  template: `
  @if (showForm()) {
    <form novalidate>

        <!---------------------------------------------------
        Sections
        --------------------------------------------------->
      <ion-card>
        <ion-card-header>
          <ion-card-title>{{ i18n().title_label() }}</ion-card-title>
        </ion-card-header>
        <ion-card-content class="ion-no-padding">
          <ion-grid>
            <ion-row>
              <ion-col size="12">
                @if(okey(); as okey) {
                  <ion-item lines="none">
                    <ion-label>{{ i18n().website_okey_label() }}: {{ okey }}</ion-label>
                    <okr-button-copy [i18n]="buttonCopyI18n()" [value]="okey" />
                  </ion-item>
                }
                @if(websiteUrl(); as url) {
                  <ion-item lines="none">
                    <ion-label>{{ i18n().website_url_label() }}: {{ url }}</ion-label>
                    <okr-button-copy [i18n]="buttonCopyI18n()" [value]="url" />
                  </ion-item>
                }
              </ion-col>
              <ion-col size="12">
                <okr-text-input [i18n]="nameI18n()" [value]="name()" (valueChange)="onFieldChange('name', $event)"  [readOnly]="isReadOnly()" />
                <okr-error-note [errors]="nameErrors()" />
              </ion-col>
              <ion-col size="12">
                <okr-text-input [i18n]="titleI18n()" [value]="title()" (valueChange)="onFieldChange('title', $event)" [maxLength]="nameLength" [readOnly]="isReadOnly()" />
                <okr-error-note [errors]="titleErrors()" />
              </ion-col>
              <ion-col size="12" size-md="6">
                <okr-cat-select [category]="types()!" [selectedItemName]="type()" (selectedItemNameChange)="onFieldChange('type', $event)" [readOnly]="isReadOnly()" [withAll]="false" />
                <okr-error-note [errors]="typeErrors()" />
              </ion-col>
              <ion-col size="12" size-md="6">
                <okr-cat-select [category]="states()!" [selectedItemName]="state()" (selectedItemNameChange)="onFieldChange('state', $event)" [readOnly]="isReadOnly()" [withAll]="false" />
                <okr-error-note [errors]="stateErrors()" />
              </ion-col>
              <ion-col size="12">
                <okr-text-input [i18n]="subTitleI18n()" [value]="subTitle()" (valueChange)="onFieldChange('subTitle', $event)" [maxLength]="nameLength" [readOnly]="isReadOnly()" />
                <okr-error-note [errors]="subTitleErrors()" />
              </ion-col>
              <ion-col size="12">
                <okr-text-input [i18n]="abstractI18n()" [value]="abstract()" (valueChange)="onFieldChange('abstract', $event)" [maxLength]="abstractLength" [readOnly]="isReadOnly()" />
                <okr-error-note [errors]="abstractErrors()" />
              </ion-col>
              <ion-col size="12">
                <okr-image-url-input [i18n]="bannerUrlI18n()" [value]="bannerUrl()" (valueChange)="onFieldChange('bannerUrl', $event)" [maxLength]="urlLength" [readOnly]="isReadOnly()" />
                <okr-error-note [errors]="bannerUrlErrors()" />
              </ion-col>
              <ion-col size="12">
                <okr-text-input [i18n]="bannerAltI18n()" [value]="bannerAltText()" (valueChange)="onFieldChange('bannerAltText', $event)" [maxLength]="nameLength" [readOnly]="isReadOnly()" />
                <okr-error-note [errors]="bannerAltTextErrors()" />
              </ion-col>
              <ion-col size="12">
                <okr-text-input [i18n]="metaI18n()" [value]="metaDescription()" (valueChange)="onMetaDescriptionChange($event)" [maxLength]="descriptionLength" [readOnly]="isReadOnly()" />
              </ion-col>
              @if(type() === 'blog') {
                <ion-col size="12" size-md="6">
                  <okr-string-select [i18n]="blogTypeI18n()" [selectedString]="blogType()" (selectedStringChange)="onFieldChange('blogType', $event)" [readOnly]="false" [stringList]="['minimal', 'grid', 'classic', 'magazine', 'bento', 'stream']" />
                </ion-col>
              }
            </ion-row>
          </ion-grid>
        </ion-card-content>
      </ion-card>

      <!-- sections -->
      <okr-strings
          [strings]="sections()"
          (stringsChange)="onFieldChange('sections', $event)"
          [mask]="mask"
          [maxLength]="40"
          [copyable]="true"
          [readOnly]="isReadOnly()"
          [title]="i18n().section_label()"
          [add]="i18n().section_add()" />

      @if(hasRole('privileged')) {
        <okr-chips chipName="tag" [storedChips]="tags()" (storedChipsChange)="onFieldChange('tags', $event)" [readOnly]="isReadOnly()" [allChips]="allTags()" />
      }
      @if(hasRole('admin')) {
        <okr-notes-input [i18n]="notesI18n()" [value]="notes()" (valueChange)="onFieldChange('notes', $event)" [maxLength]="descriptionLength" [readOnly]="isReadOnly()" [errors]="notesErrors()" />
      }
    </form>
    }
  `
})
export class PageForm {
  /** kept in step with the cap the Vest suite enforces on this field */
  protected readonly nameLength = NAME_LENGTH;
  /** kept in step with the cap the Vest suite enforces on this field */
  protected readonly descriptionLength = DESCRIPTION_LENGTH;
  /** kept in step with the cap the Vest suite enforces on this field */
  protected readonly abstractLength = PAGE_ABSTRACT_LENGTH;
  /** kept in step with the cap the Vest suite enforces on this field */
  protected readonly urlLength = URL_LENGTH;
  // inputs
  public readonly i18n = input.required<PageI18n>();
  public readonly formData = model.required<PageModel>();
  public currentUser = input<UserModel | undefined>();
  public showForm = input(true);   // used for initializing the form and resetting vest validations
  public readonly allTags = input.required<string>();
  public tenantId = input.required<string>();
  public readonly types = input.required<CategoryListModel>();
  public readonly states = input.required<CategoryListModel>();
  /** Public website address of the page; shown read-only with a copy button when the sitemap opens the modal. */
  public readonly websiteUrl = input<string | undefined>();
  public readonly readOnly = input(true);
  protected isReadOnly = computed(() => coerceBoolean(this.readOnly()));

  // signals
  public dirty = output<boolean>();
  public valid = output<boolean>();

  // The suite needs tenants and tags, which validateVestTree does not pass — so the bridge
  // calls it through a closure that adds them.
  private readonly suiteWithContext = (model: PageModel) =>
    pageValidations(model, this.tenantId(), this.allTags());
  protected readonly pageForm = form(this.formData, (path) =>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    validateVestTree(path, this.suiteWithContext as any));

  // per-field errors for the notes under each field
  private readonly validationResult = vestErrors(this.pageForm);
  protected stateErrors = computed(() => this.validationResult().getErrors('state'));
  protected typeErrors = computed(() => this.validationResult().getErrors('type'));
  protected notesErrors = computed(() => this.validationResult().getErrors('notes'));
  protected nameErrors = computed(() => this.validationResult().getErrors('name'));
  protected titleErrors = computed(() => this.validationResult().getErrors('title'));
  protected subTitleErrors = computed(() => this.validationResult().getErrors('subTitle'));
  protected abstractErrors = computed(() => this.validationResult().getErrors('abstract'));
  protected bannerUrlErrors = computed(() => this.validationResult().getErrors('bannerUrl'));
  protected bannerAltTextErrors = computed(() => this.validationResult().getErrors('bannerAltText'));

  // fields
  protected okey = computed(() => this.formData().okey ?? DEFAULT_KEY);
  protected sections = computed(() => this.formData().sections ?? []);
  protected name = computed(() => this.formData().name ?? DEFAULT_NAME);
  protected title = computed(() => this.formData().title ?? DEFAULT_TITLE);
  protected subTitle = computed(() => this.formData().subTitle ?? '');
  protected abstract = computed(() => this.formData().abstract ?? '');
  protected bannerUrl = computed(() => this.formData().bannerUrl ?? '');
  protected bannerAltText = computed(() => this.formData().bannerAltText ?? '');
  protected metaDescription = computed(() => this.formData().meta?.find(m => m.name === 'description')?.content ?? '');
  protected type = computed(() => this.formData().type ?? DEFAULT_PAGE_TYPE);
  protected blogType = computed(() => this.formData().blogType ?? DEFAULT_BLOG_TYPE);
  protected state = computed(() => this.formData().state ?? DEFAULT_CONTENT_STATE);
  protected tags = computed(() => this.formData().tags ?? DEFAULT_TAGS);
  protected notes = computed(() => this.formData().notes ?? DEFAULT_NOTES);

  // passing constants to template
  protected mask = CaseInsensitiveWordMask;

  constructor() { effect(() => this.valid.emit(this.pageForm().valid())); }

  protected readonly buttonCopyI18n = computed(() => ({ copy_conf: this.i18n().copy_conf() } as ButtonCopyI18n));

  protected nameI18n = computed(() => ({
    name: 'name',
    label: this.i18n().name_label(),
    placeholder: this.i18n().name_placeholder(),
    helper: this.i18n().name_helper(),
  } as TextInputI18n));

  protected titleI18n = computed(() => ({
    name: 'title',
    label: this.i18n().title_label(),
    placeholder: this.i18n().title_placeholder(),
    helper: this.i18n().title_helper(),
  } as TextInputI18n));

  protected subTitleI18n = computed(() => ({ name: 'subTitle', label: this.i18n().website_subTitle_label(), placeholder: this.i18n().website_subTitle_placeholder(), helper: '' } as TextInputI18n));
  protected abstractI18n = computed(() => ({ name: 'abstract', label: this.i18n().website_abstract_label(), placeholder: this.i18n().website_abstract_placeholder(), helper: '' } as TextInputI18n));
  protected bannerAltI18n = computed(() => ({ name: 'bannerAltText', label: this.i18n().website_bannerAlt_label(), placeholder: this.i18n().website_bannerAlt_placeholder(), helper: '' } as TextInputI18n));
  protected metaI18n = computed(() => ({ name: 'metaDescription', label: this.i18n().website_meta_label(), placeholder: this.i18n().website_meta_placeholder(), helper: '' } as TextInputI18n));
  protected bannerUrlI18n = computed(() => ({
    name: 'bannerUrl', label: this.i18n().website_bannerUrl_label(), placeholder: this.i18n().website_bannerUrl_placeholder(), copy_conf: this.i18n().copy_conf()
  } as ImageUrlInputI18n));

  protected notesI18n = computed(() => ({
    name: 'notes', label: this.i18n().notes_label(), placeholder: this.i18n().notes_placeholder()
  } as NotesInputI18n));
  protected blogTypeI18n = computed(() => ({ name: 'blogType', label: this.i18n().blog_type_label() } as StringSelectI18n));

  /************************************** actions *********************************************** */
  protected onFieldChange(fieldName: string, fieldValue: string | string[] | number): void {
    this.dirty.emit(true);
    if (fieldName === 'sections') {
      this.formData.update(vm => ({ ...vm, sections: fieldValue as string[] }));
    }
    else {
      this.formData.update((vm) => ({ ...vm, [fieldName]: fieldValue }));
    }
  }

  /** The meta description is the `meta` entry named «description»; an empty value removes the entry. */
  protected onMetaDescriptionChange(content: string): void {
    this.dirty.emit(true);
    this.formData.update(vm => {
      const others = (vm.meta ?? []).filter(m => m.name !== 'description');
      return { ...vm, meta: content.trim() ? [...others, { name: 'description', content }] : others };
    });
  }

  protected hasRole(role: RoleName): boolean {
    return hasRole(role, this.currentUser());
  }
}
