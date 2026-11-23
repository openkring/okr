import { Component, computed, DestroyRef, inject, input, model, output } from '@angular/core';
import { IonButton, IonCard, IonCardContent, IonCardHeader, IonCardTitle, IonItem, IonLabel, IonList, IonNote, ModalController } from '@ionic/angular';

import { ArticleConfig, ArticleSection, CategoryListModel, ImageConfig, isSameValue, RoleName, SectionModel, UserModel } from '@okr/shared-models';
import { Chips, DateInput, DateInputI18n, ErrorNote, TextareaInput, TextareaInputI18n } from '@okr/shared-ui';
import { fill, hasRole } from '@okr/shared-util-core';
import { ArticleEditorI18n, ArticleUpload, coverErrors, drawableImages, getFieldErrors, ImageUploadTarget, pickErrors, restErrors, SectionErrors, shownArticleFields } from '@okr/cms-section-util';

import { pickArticleImage } from './article-image-pick.modal';
import { ARTICLE_PANEL_STYLES } from './article-panel.styles';
import { ImagesConfiguration } from './images-configuration';
import { SectionConfiguration } from './section-configuration';

/**
 * The settings of the article itself (spec 1.175 §7.3), shown while no block is selected: title, subtitle and intro, who sees it, its
 * width and look, date, teaser picture, name, key, tags and notes. Every change sets `section` once; nothing is set on init.
 * Uploaded pictures go to `onUpload` instead, because they may arrive when a block is selected.
 */
@Component({
  selector: 'okr-article-panel',
  standalone: true,
  imports: [
    Chips, DateInput, ErrorNote, TextareaInput, ImagesConfiguration, SectionConfiguration,
    IonButton, IonCard, IonCardContent, IonCardHeader, IonCardTitle, IonItem, IonLabel, IonList, IonNote,
  ],
  host: { role: 'region', '[attr.aria-label]': 'i18n().article_editor_article_title()' },
  styles: [ARTICLE_PANEL_STYLES, `
    .error-card { border: 1px solid var(--ion-color-danger); }
  `],
  template: `
    @if (errorBlocks().length > 0) {
      <ion-card class="error-card">
        <ion-card-header><ion-card-title>{{ i18n().article_editor_error_title() }}</ion-card-title></ion-card-header>
        <ion-card-content class="ion-no-padding">
          <ion-list lines="none">
            @for (block of errorBlocks(); track block.id) {
              <ion-item button [detail]="true" [attr.aria-label]="selectLabel(block.label)" (click)="selectBlock.emit(block.id)"><ion-label>{{ block.label }}</ion-label></ion-item>
            }
          </ion-list>
        </ion-card-content>
      </ion-card>
    }
    <!-- an error that no field below shows (e.g. too many blocks), so that a missing save banner is never unexplained -->
    @for (error of rest(); track error.field) { <okr-error-note [errors]="error.messages" /> }

    <div class="panel-head"><h2>{{ i18n().article_editor_article_title() }}</h2></div>
    @for (note of outdatedNotes(); track note) { <ion-note class="note outdated">{{ note }}</ion-note> }
    <okr-section-config part="content" [formData]="section()" (formDataChange)="set($event)" [currentUser]="currentUser()"
      [roles]="roles()" [states]="states()" [showAdvanced]="true" [readOnly]="false" [i18n]="i18n()" [errors]="fieldErrors()" />

    <ion-card>
      <ion-card-header><ion-card-title>{{ i18n().article_editor_article_cover_title() }}</ion-card-title></ion-card-header>
      <ion-card-content class="ion-no-padding">
        <okr-images-config [images]="covers()" (imagesChange)="setCover($event[0])" [multiple]="false" [embedded]="true" [uniqueNames]="true"
          [uploads]="uploads()" [uploadTarget]="uploadTarget()" [emptyText]="i18n().article_editor_article_cover_empty()"
          [storagePath]="storagePath()" [currentUser]="currentUser()" [readOnly]="false" [i18n]="i18n()" [errors]="coverErrors()" />
        <div class="actions">
          @if (choices().length > 0) {
            <ion-button size="small" fill="outline" (click)="pick()">{{ i18n().article_editor_image_fromArticle() }}</ion-button>
          }
        </div>
        @if (!uploads()) { <ion-note class="note">{{ i18n().article_editor_image_noUpload() }}</ion-note> }
        <ion-note class="note">{{ i18n().article_editor_article_cover_helper() }}</ion-note>
      </ion-card-content>
    </ion-card>

    <ion-card>
      <ion-card-content class="ion-no-padding">
        <okr-date-input [i18n]="dateI18n()" [storeDate]="date()" (storeDateChange)="setDate($event)" [readOnly]="false" />
      </ion-card-content>
    </ion-card>

    <okr-section-config part="appearance" [headerTitle]="i18n().article_editor_article_settings()" [formData]="section()" (formDataChange)="set($event)"
      [currentUser]="currentUser()" [roles]="roles()" [states]="states()" [showAdvanced]="true" [readOnly]="false" [i18n]="i18n()" [errors]="fieldErrors()" />

    @if (hasRole('privileged')) {
      <okr-chips chipName="tag" [storedChips]="section().tags ?? ''" (storedChipsChange)="setField('tags', $event)" [allChips]="allTags()" [readOnly]="false" />
      <okr-error-note [errors]="errorsFor('tags')" />
    }
    @if (hasRole('admin')) {
      <okr-textarea-input variant="card" [i18n]="notesI18n()" [value]="section().notes ?? ''" (valueChange)="setField('notes', $event)" [errors]="errorsFor('notes')" [readOnly]="false" />
    }
  `,
})
export class ArticlePanel {
  private readonly modalController = inject(ModalController);
  private readonly destroyRef = inject(DestroyRef);

  // inputs
  public readonly section = model.required<ArticleSection>();
  /** the errors of the article itself: `articleOwnErrors(errors, blocks)` */
  public readonly errors = input<SectionErrors>({});
  /** the blocks with errors in reading order (`blockIdsWithErrors`), to be listed; a click selects one */
  public readonly errorBlocks = input<{ id: string; label: string }[]>([]);
  /** path → languages whose translation is outdated: the result of `outdatedPaths`; only the header fields are shown here */
  public readonly outdated = input<Record<string, string[]>>({});
  /** «Aus diesem Artikel»: `articleImageChoices(section)` */
  public readonly articleImages = input<ImageConfig[]>([]);
  /** false in trial mode: no file is uploaded */
  public readonly uploads = input(true);
  /** takes uploaded pictures (apply them with `withUpload`); may be called when the panel is gone */
  public readonly onUpload = input.required<(upload: ArticleUpload) => void>();
  public readonly roles = input.required<CategoryListModel>();
  public readonly states = input.required<CategoryListModel>();
  public readonly allTags = input('');
  public readonly currentUser = input<UserModel | undefined>();
  public readonly storagePath = input.required<string>();
  public readonly i18n = input.required<ArticleEditorI18n>();

  // outputs
  public readonly selectBlock = output<string>();

  // teaser picture
  protected readonly covers = computed<ImageConfig[]>(() => drawableImages([this.section().properties?.cover]));
  protected readonly choices = computed(() => this.articleImages().filter((image) => image.url !== this.covers()[0]?.url));
  protected readonly coverErrors = computed(() => coverErrors(this.errors()));
  protected readonly uploadTarget = computed<ImageUploadTarget>(() => {
    const send = this.onUpload();
    return { added: (images) => send({ kind: 'images', place: 'cover', images }), details: (details) => send({ kind: 'details', details }) };
  });

  // date
  protected readonly date = computed(() => this.section().properties?.datePublished ?? '');
  protected readonly dateI18n = computed<DateInputI18n>(() => ({
    name: 'datePublished', label: this.i18n().article_editor_article_date_label(),
    placeholder: this.i18n().article_editor_article_date_placeholder(), helper: this.i18n().article_editor_article_date_helper(),
  }));

  protected readonly notesI18n = computed(() => ({ name: 'notes', label: this.i18n().notes_label(), placeholder: this.i18n().notes_placeholder() } as TextareaInputI18n));
  private readonly shown = computed(() => shownArticleFields(this.section(), { admin: this.hasRole('admin'), privileged: this.hasRole('privileged') }));
  /** for the fields; what is not among them is in `rest`, so that every error stands in exactly one place */
  protected readonly fieldErrors = computed(() => pickErrors(this.errors(), this.shown()));
  protected readonly rest = computed(() => restErrors(this.errors(), this.shown()));
  protected readonly outdatedNotes = computed(() => {
    const i18n = this.i18n();
    const fields: [string, string][] = [
      ['titleI18n', i18n.section_config_title_label()], ['subTitleI18n', i18n.section_config_subTitle_label()], ['introI18n', i18n.section_config_intro_label()],
    ];
    return fields.filter(([path]) => this.outdated()[path]?.length > 0).map(([path, field]) =>
      fill(i18n.article_editor_outdatedField(), { field, languages: this.outdated()[path].map((l) => l.toUpperCase()).join(', ') }));
  });

  /************************************** changes *********************************************** */
  protected set(section: SectionModel): void {
    if (!isSameValue(section, this.section())) this.section.set(section as ArticleSection);
  }

  protected setField(field: 'tags' | 'notes', value: string): void {
    this.set({ ...this.section(), [field]: value });
  }

  /** Sets a property, or removes it. */
  private setProperty<K extends 'cover' | 'datePublished'>(key: K, value: ArticleConfig[K]): void {
    const properties = { ...this.section().properties };
    if (value === undefined) delete properties[key];
    else properties[key] = value;
    this.set({ ...this.section(), properties });
  }

  protected setCover(cover: ImageConfig | undefined): void {
    this.setProperty('cover', cover);
  }

  protected setDate(date: string): void {
    this.setProperty('datePublished', date === '' ? undefined : date);
  }

  protected async pick(): Promise<void> {
    const image = await pickArticleImage(this.modalController, this.choices(), this.i18n());
    if (image && !this.destroyRef.destroyed) this.setCover(image);
  }

  protected selectLabel(block: string): string {
    return fill(this.i18n().article_editor_error_select(), { block });
  }

  protected hasRole(role: RoleName): boolean {
    return hasRole(role, this.currentUser());
  }

  /** messages of a single field, for the inline <okr-error-note> */
  protected errorsFor(field: string): string[] {
    return getFieldErrors(this.fieldErrors(), field);
  }
}
