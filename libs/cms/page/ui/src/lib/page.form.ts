import { Component, computed, inject, input, linkedSignal, model, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { IonCard, IonCardContent, IonCardHeader, IonCardTitle, IonCol, IonGrid, IonItem, IonLabel, IonRow } from '@ionic/angular/standalone';
import { vestForms } from 'ngx-vest-forms';

import { CaseInsensitiveWordMask } from '@bk2/shared-config';
import { CategoryListModel, PageModel, RoleName, UserModel } from '@bk2/shared-models';
import { ButtonCopy, ButtonCopyI18n, CategorySelect, Chips, ErrorNote, NotesInput, NotesInputI18n, StringList, StringSelect, StringSelectI18n, TextInput, TextInputI18n } from '@bk2/shared-ui';
import { coerceBoolean, debugFormErrors, debugFormModel, hasRole } from '@bk2/shared-util-core';
import { DEFAULT_BLOG_TYPE, DEFAULT_CONTENT_STATE, DEFAULT_KEY, DEFAULT_NAME, DEFAULT_NOTES, DEFAULT_PAGE_TYPE, DEFAULT_TAGS, DEFAULT_TITLE } from '@bk2/shared-constants';
import { I18nService } from '@bk2/shared-i18n';

import { pageValidations } from '@bk2/cms-page-util';
import { PFX } from './scope';

export interface PageFormI18n {
  title: string;
}

@Component({
  selector: 'bk-page-form',
  standalone: true,
  imports: [
    vestForms, FormsModule,
    Chips, NotesInput, TextInput, StringList, ButtonCopy, ErrorNote, CategorySelect, StringSelect,
    IonLabel, IonCard, IonCardHeader, IonCardTitle, IonCardContent, IonItem, IonGrid, IonRow, IonCol
  ],
  styles: [`@media (width <= 600px) { ion-card { margin: 5px;} }`],
  template: `
  @if (showForm()) {
    <form scVestForm
      [formValue]="formData()"
      [suite]="suite"
      (dirtyChange)="dirty.emit($event)"
      (validChange)="valid.emit($event)"
      (formValueChange)="onFormChange($event)">

        <!---------------------------------------------------
        Sections
        --------------------------------------------------->
      <ion-card>
        <ion-card-header>
          <ion-card-title>{{ i18n().title }}</ion-card-title>
        </ion-card-header>
        <ion-card-content class="ion-no-padding">
          <ion-grid>
            <ion-row>
              <ion-col size="12">
                @if(bkey(); as bkey) {
                  <ion-item lines="none">
                    <ion-label>Page Key: {{ bkey }}</ion-label>
                    <bk-button-copy [i18n]="buttonCopyI18n()" [value]="bkey" />
                  </ion-item>
                }
              </ion-col>
              <ion-col size="12">
                <bk-text-input [i18n]="nameI18n()" [value]="name()" (valueChange)="onFieldChange('name', $event)"  [readOnly]="isReadOnly()" />
                <bk-error-note [errors]="nameErrors()" />
              </ion-col>
              <ion-col size="12">
                <bk-text-input [i18n]="titleI18n()" [value]="title()" (valueChange)="onFieldChange('title', $event)" [readOnly]="isReadOnly()" />
                <bk-error-note [errors]="titleErrors()" />
              </ion-col>
              <ion-col size="12" size-md="6">
                <bk-cat-select [category]="types()!" [selectedItemName]="type()" (selectedItemNameChange)="onFieldChange('type', $event)" [readOnly]="isReadOnly()" [withAll]="false" />
              </ion-col>
              <ion-col size="12" size-md="6">
                <bk-cat-select [category]="states()!" [selectedItemName]="state()" (selectedItemNameChange)="onFieldChange('state', $event)" [readOnly]="isReadOnly()" [withAll]="false" />
              </ion-col>
              @if(type() === 'blog') {
                <ion-col size="12" size-md="6">
                  <bk-string-select [i18n]="blogTypeI18n()" [selectedString]="blogType()" (selectedStringChange)="onFieldChange('blogType', $event)" [readOnly]="false" [stringList]="['minimal', 'grid', 'classic', 'magazine', 'bento', 'stream']" />
                </ion-col>
              }
            </ion-row>
          </ion-grid>
        </ion-card-content>
      </ion-card>

      <!-- sections -->
      <bk-strings
          [strings]="sections()"
          (stringsChange)="onFieldChange('sections', $event)"
          [mask]="mask"
          [maxLength]="40"
          [copyable]="true"
          [readOnly]="isReadOnly()"
          title="@content.page.forms.section.label"
          addLabel="@content.section.operation.add.label" />

      @if(hasRole('privileged')) {
        <bk-chips chipName="tag" [storedChips]="tags()" (storedChipsChange)="onFieldChange('tags', $event)" [readOnly]="isReadOnly()" [allChips]="allTags()" />
      }
      @if(hasRole('admin')) {
        <bk-notes-input [i18n]="notesI18n()" [value]="notes()" (valueChange)="onFieldChange('notes', $event)" [readOnly]="isReadOnly()" />
      }
    </form>
    }
  `
})
export class PageForm {
  private readonly i18nService = inject(I18nService);

  // inputs
  public readonly i18n = input<PageFormI18n>({ title: '' });
  public readonly formData = model.required<PageModel>();
  public currentUser = input<UserModel | undefined>();
  public showForm = input(true);   // used for initializing the form and resetting vest validations
  public readonly allTags = input.required<string>();
  public tenantId = input.required<string>();
  public readonly types = input.required<CategoryListModel>();
  public readonly states = input.required<CategoryListModel>();
  public readonly readOnly = input(true);
  protected isReadOnly = computed(() => coerceBoolean(this.readOnly()));

  // signals
  public dirty = output<boolean>();
  public valid = output<boolean>();

  // validation and errors
  protected readonly suite = pageValidations;
  private readonly validationResult = computed(() => pageValidations(this.formData(), this.tenantId(), this.allTags()));
  protected nameErrors = computed(() => this.validationResult().getErrors('name'));
  protected titleErrors = computed(() => this.validationResult().getErrors('title'));

  // fields
  protected bkey = computed(() => this.formData().bkey ?? DEFAULT_KEY);
  protected sections = linkedSignal(() => this.formData().sections ?? []);
  protected name = linkedSignal(() => this.formData().name ?? DEFAULT_NAME);
  protected title = linkedSignal(() => this.formData().title ?? DEFAULT_TITLE);
  protected type = linkedSignal(() => this.formData().type ?? DEFAULT_PAGE_TYPE);
  protected blogType = linkedSignal(() => this.formData().blogType ?? DEFAULT_BLOG_TYPE);
  protected state = linkedSignal(() => this.formData().state ?? DEFAULT_CONTENT_STATE);
  protected tags = linkedSignal(() => this.formData().tags ?? DEFAULT_TAGS);
  protected notes = linkedSignal(() => this.formData().notes ?? DEFAULT_NOTES);

  // passing constants to template
  protected mask = CaseInsensitiveWordMask;

  protected readonly fieldI18n = this.i18nService.translateAll({
    name_label:        PFX + 'name.label',
    name_placeholder:  PFX + 'name.placeholder',
    name_helper:       PFX + 'name.helper',
    pageTitle_label:       PFX + 'pageTitle.label',
    pageTitle_placeholder: PFX + 'pageTitle.placeholder',
    pageTitle_helper:      PFX + 'pageTitle.helper',
    notes_label:           PFX + 'notes.label',
    notes_placeholder:     PFX + 'notes.placeholder',
    blogType_label:        PFX + 'blogType.label',
    copy_conf:             '@shared/ui.copy.conf',
  });
  protected readonly buttonCopyI18n = computed(() => ({ copy_conf: this.fieldI18n.copy_conf() } as ButtonCopyI18n));

  protected nameI18n = computed(() => ({
    name: 'name',
    label: this.fieldI18n.name_label(),
    placeholder: this.fieldI18n.name_placeholder(),
    helper: this.fieldI18n.name_helper(),
  } as TextInputI18n));

  protected titleI18n = computed(() => ({
    name: 'title',
    label: this.fieldI18n.pageTitle_label(),
    placeholder: this.fieldI18n.pageTitle_placeholder(),
    helper: this.fieldI18n.pageTitle_helper(),
  } as TextInputI18n));

  protected notesI18n = computed(() => ({
    name: 'notes', label: this.fieldI18n.notes_label(), placeholder: this.fieldI18n.notes_placeholder()
  } as NotesInputI18n));
  protected blogTypeI18n = computed(() => ({ name: 'blogType', label: this.fieldI18n.blogType_label() } as StringSelectI18n));

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

  protected onFormChange(value: PageModel): void {
    this.formData.update((vm) => ({...vm, ...value}));
    debugFormModel('PageForm.onFormChange', this.formData(), this.currentUser());
    debugFormErrors('PageForm.onFormChange', this.validationResult().errors, this.currentUser());
  }

  protected hasRole(role: RoleName): boolean {
    return hasRole(role, this.currentUser());
  }
}
