import { Component, computed, effect, input, model, output } from '@angular/core';
import { form } from '@angular/forms/signals';
import { IonButton, IonCard, IonCardContent, IonCardHeader, IonCardTitle, IonCol, IonGrid, IonIcon, IonItem, IonLabel, IonNote, IonRow } from '@ionic/angular';

import { DocumentLink } from '@okr/shared-models';
import { SvgIconPipe } from '@okr/shared-pipes';
import { Chips, ErrorNote, TextareaInputI18n, TextInput, TextInputI18n, UrlInput, UrlInputI18n } from '@okr/shared-ui';
import { validateVestTree, vestErrors } from '@okr/shared-util-angular';
import { coerceBoolean } from '@okr/shared-util-core';
import {
  LEARNING_LINK_TITLE_MAX, LEARNING_LINKS_MAX, LEARNING_NOTES_MAX, LEARNING_TITLE_MAX, LearningI18n, LearningItemFormData, learningItemValidations, parseTopics,
} from '@okr/content-learning-util';
import { RichTextInput } from '@okr/shared-ui-editor';

/** The title of an attached document, for display; the form data holds only its okey. */
export interface LearningAttachmentInfo {
  key: string;
  title: string;
}

type ItemField = 'title' | 'tags' | 'notes' | 'links' | 'attachmentKeys';

/** The editor normalises its content on load ('' → '<p></p>'); both mean «no notes». */
function normalizeNotes(html: string | undefined): string {
  const s = (html ?? '').trim();
  return s === '<p></p>' ? '' : s;
}

/**
 * Edits a learning item (spec 1.115 §5.3): title, the topics the actor curates, notes (rich text),
 * external links and attachments. Dumb: adding an attachment emits `pickAttachment`; the parent
 * picks or uploads the document and writes its key into `formData`.
 *
 * Tags outside `curatableTopics` (other topics, non-room tags) are never shown and always kept.
 * The notes are rich text (okr-rich-text-input loads its ProseMirror engine on demand, spec 1.170).
 */
@Component({
  selector: 'okr-learning-item-form',
  standalone: true,
  imports: [
    SvgIconPipe, TextInput, UrlInput, Chips, ErrorNote, RichTextInput,
    IonCard, IonCardHeader, IonCardTitle, IonCardContent, IonGrid, IonRow, IonCol, IonItem, IonLabel, IonNote, IonButton, IonIcon,
  ],
  styles: [`
    @media (width <= 600px) { ion-card { margin: 5px;} }
    .remove { cursor: pointer; }
    .add { padding: 8px 16px; }
    .link-row { border-bottom: 1px solid var(--ion-color-step-150, #e0e0e0); }
  `],
  template: `
    @if (showForm()) {
      <form novalidate (submit)="$event.preventDefault()">
        <ion-card>
          <ion-card-content class="ion-no-padding">
            <ion-grid>
              <ion-row>
                <ion-col size="12">
                  <okr-text-input [i18n]="titleI18n()" [value]="title()" (valueChange)="onFieldChange('title', $event)"
                    [autofocus]="true" [maxLength]="titleLength" [showHelper]="true" [readOnly]="isReadOnly()" />
                  <okr-error-note [errors]="titleErrors()" />
                </ion-col>
              </ion-row>
              <ion-row>
                <ion-col size="12">
                  <ion-item lines="none">
                    <ion-label>{{ i18n().itemForm_notes_label() }}<p>{{ i18n().itemForm_notes_helper() }}</p></ion-label>
                  </ion-item>
                  <okr-rich-text-input [i18n]="notesI18n" [value]="notes()" (valueChange)="onNotesChange($event)"
                    [readOnly]="isReadOnly()" [errors]="notesErrors()" [maxLength]="notesMax" />
                </ion-col>
              </ion-row>
            </ion-grid>
          </ion-card-content>
        </ion-card>

        <!-- links -->
        <ion-card>
          <ion-card-header>
            <ion-card-title>{{ i18n().itemForm_links_title() }}</ion-card-title>
          </ion-card-header>
          <ion-card-content class="ion-no-padding">
            <ion-item lines="none">
              <ion-note>{{ i18n().itemForm_links_helper() }}</ion-note>
            </ion-item>
            @if (links().length === 0) {
              <ion-item lines="none">
                <ion-note>{{ i18n().itemForm_links_empty() }}</ion-note>
              </ion-item>
            }
            <ion-grid>
              @for (link of links(); track $index) {
                <ion-row class="link-row">
                  <ion-col size="12" size-md="5">
                    <okr-text-input [i18n]="linkTitleI18n()" [value]="link.title" (valueChange)="onLinkChange($index, 'title', $event)"
                      [maxLength]="linkTitleLength" [readOnly]="isReadOnly()" />
                    <okr-error-note [errors]="linkErrors($index, 'title')" />
                  </ion-col>
                  <ion-col size="10" size-md="6">
                    <okr-url [i18n]="linkUrlI18n()" [value]="link.url" (valueChange)="onLinkChange($index, 'url', $event)"
                      [copyable]="false" [openable]="true" [readOnly]="isReadOnly()" />
                    <okr-error-note [errors]="linkErrors($index, 'url')" />
                  </ion-col>
                  <ion-col size="2" size-md="1">
                    @if (!isReadOnly()) {
                      <ion-button fill="clear" (click)="removeLink($index)" [attr.aria-label]="i18n().form_remove()">
                        <ion-icon slot="icon-only" src="{{ 'cancel' | svgIcon }}" />
                      </ion-button>
                    }
                  </ion-col>
                </ion-row>
              }
            </ion-grid>
            <okr-error-note [errors]="linksErrors()" />
            @if (!isReadOnly() && links().length < linksMax) {
              <div class="add">
                <ion-button expand="block" fill="outline" (click)="addLink()">
                  <ion-icon slot="start" src="{{ 'add-circle' | svgIcon }}" />
                  {{ i18n().itemForm_links_add() }}
                </ion-button>
              </div>
            }
          </ion-card-content>
        </ion-card>

        <!-- attachments -->
        <ion-card>
          <ion-card-header>
            <ion-card-title>{{ i18n().itemForm_attachments_title() }}</ion-card-title>
          </ion-card-header>
          <ion-card-content class="ion-no-padding">
            <ion-item lines="none">
              <ion-note>{{ i18n().itemForm_attachments_helper() }}</ion-note>
            </ion-item>
            @for (key of attachmentKeys(); track key) {
              <ion-item lines="none">
                <ion-icon slot="start" src="{{ 'attachment' | svgIcon }}" />
                <ion-label>{{ attachmentTitle(key) }}</ion-label>
                @if (!isReadOnly()) {
                  <ion-icon class="remove" slot="end" src="{{ 'cancel' | svgIcon }}" [attr.aria-label]="i18n().form_remove()"
                    (click)="removeAttachment(key)" />
                }
              </ion-item>
            } @empty {
              <ion-item lines="none">
                <ion-note>{{ i18n().itemForm_attachments_empty() }}</ion-note>
              </ion-item>
            }
            @if (!isReadOnly()) {
              <div class="add">
                <ion-button expand="block" fill="outline" (click)="pickAttachment.emit()">
                  <ion-icon slot="start" src="{{ 'add-circle' | svgIcon }}" />
                  {{ i18n().itemForm_attachments_add() }}
                </ion-button>
              </div>
            }
          </ion-card-content>
        </ion-card>

        <!-- guarded, always last: only the topics the actor curates -->
        @if (hasCuratableTopics()) {
          <okr-chips chipName="tag" [storedChips]="curatedTags()" (storedChipsChange)="onTagsChange($event)"
            [allChips]="curatableChips()" [readOnly]="isReadOnly()" />
          <ion-item lines="none">
            <ion-note>{{ i18n().itemForm_tags_helper() }}</ion-note>
          </ion-item>
        }
      </form>
    }
  `,
})
export class LearningItemForm {

  // inputs
  public readonly i18n = input.required<LearningI18n>();
  public formData = model.required<LearningItemFormData>();
  /** the room topics the actor may curate; the only tags this form may add or remove */
  public readonly curatableTopics = input<string[]>([]);
  /** titles of the attached documents (unknown keys show the key) */
  public readonly attachments = input<LearningAttachmentInfo[]>([]);
  public readonly readOnly = input(false);
  public readonly showForm = input(true);

  // outputs
  public readonly dirty = output<boolean>();
  public readonly valid = output<boolean>();
  /** the user wants to add an attachment; the parent picks it and adds its key to formData */
  public readonly pickAttachment = output<void>();

  protected readonly itemForm = form(this.formData, (path) =>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    validateVestTree(path, learningItemValidations as any));
  private readonly validationResult = vestErrors(this.itemForm);
  protected readonly titleErrors = computed(() => this.validationResult().getErrors('title'));
  protected readonly notesErrors = computed(() => this.validationResult().getErrors('notes'));
  protected readonly linksErrors = computed(() => this.validationResult().getErrors('links'));
  protected linkErrors(index: number, field: keyof DocumentLink): string[] {
    return this.validationResult().getErrors(`links[${index}].${field}`);
  }

  // kept in step with the caps the Vest suite enforces
  protected readonly titleLength = LEARNING_TITLE_MAX;
  protected readonly linkTitleLength = LEARNING_LINK_TITLE_MAX;
  protected readonly linksMax = LEARNING_LINKS_MAX;

  // fields
  protected readonly isReadOnly = computed(() => coerceBoolean(this.readOnly()));
  protected readonly title = computed(() => this.formData()?.title ?? '');
  protected readonly notes = computed(() => this.formData()?.notes ?? '');
  protected readonly links = computed(() => this.formData()?.links ?? []);
  protected readonly attachmentKeys = computed(() => this.formData()?.attachmentKeys ?? []);
  private readonly curatable = computed(() => parseTopics(this.curatableTopics().join(',')));
  protected readonly hasCuratableTopics = computed(() => this.curatable().length > 0);
  protected readonly curatableChips = computed(() => this.curatable().join(','));
  /** the item's tags the actor may touch */
  protected readonly curatedTags = computed(() =>
    parseTopics(this.formData()?.tags ?? '').filter(t => this.curatable().includes(t)).join(','));

  protected readonly titleI18n = computed(() => ({
    name: 'title',
    label: this.i18n().itemForm_title_label(),
    placeholder: this.i18n().itemForm_title_placeholder(),
    helper: this.i18n().itemForm_title_helper(),
  } as TextInputI18n));
  protected readonly linkTitleI18n = computed(() => ({
    name: 'linkTitle',
    label: this.i18n().itemForm_link_title_label(),
    placeholder: this.i18n().itemForm_link_title_placeholder(),
    helper: '',
  } as TextInputI18n));
  protected readonly linkUrlI18n = computed(() => ({
    name: 'linkUrl',
    label: this.i18n().itemForm_link_url_label(),
    placeholder: this.i18n().itemForm_link_url_placeholder(),
  } as UrlInputI18n));

  // lazy notes editor (Pattern A): the type-only import above carries no runtime edge
  /** the label row above names the field; the editor carries none of its own */
  protected readonly notesI18n: TextareaInputI18n = { name: 'notes', label: '', placeholder: '' };
  /** kept in step with the cap learningItemValidations enforces on notes (visible characters) */
  protected readonly notesMax = LEARNING_NOTES_MAX;

  constructor() {
    effect(() => this.valid.emit(this.itemForm().valid()));
  }

  /******************************* actions *************************************** */
  protected onFieldChange(fieldName: ItemField, fieldValue: string | string[] | DocumentLink[]): void {
    this.dirty.emit(true);
    this.formData.update(vm => ({ ...vm, [fieldName]: fieldValue }));
  }

  /** Only a real edit marks the form dirty — the editor echoes its normalised content on load. */
  protected onNotesChange(html: string): void {
    if (normalizeNotes(html) === normalizeNotes(this.notes())) return;
    this.onFieldChange('notes', html);
  }

  /** Writes the curated topics back; every other tag of the item is kept as it was. */
  protected onTagsChange(chips: string): void {
    const kept = parseTopics(this.formData()?.tags ?? '').filter(t => !this.curatable().includes(t));
    this.onFieldChange('tags', parseTopics([...kept, ...parseTopics(chips)].join(',')).join(','));
  }

  protected addLink(): void {
    if (this.links().length >= LEARNING_LINKS_MAX) return;
    this.onFieldChange('links', [...this.links(), { title: '', url: '' }]);
  }

  protected removeLink(index: number): void {
    this.onFieldChange('links', this.links().filter((_, i) => i !== index));
  }

  protected onLinkChange(index: number, field: keyof DocumentLink, value: string): void {
    this.onFieldChange('links', this.links().map((l, i) => (i === index ? { ...l, [field]: value } : l)));
  }

  protected attachmentTitle(key: string): string {
    return this.attachments().find(a => a.key === key)?.title || key;
  }

  protected removeAttachment(key: string): void {
    this.onFieldChange('attachmentKeys', this.attachmentKeys().filter(k => k !== key));
  }
}
