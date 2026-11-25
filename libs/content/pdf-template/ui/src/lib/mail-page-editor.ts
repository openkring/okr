// libs/content/pdf-template/ui/src/lib/mail-page-editor.ts
//
// «Seite» of a Versand (spec 1.172 §7.2): the mail as a list of sections, Mailchimp-style. The open article is
// typed into directly (the everyday case: two lines, send); every other section is a card with its summary,
// up/down/remove and «Bearbeiten». «Abschnitt hinzufügen» offers the mail section types.
//
// Unused since 1.176 (removed with its Task 15). The sections and their writes live in `MailPageSectionsDraft`, provided by the composer: this component is destroyed
// whenever the composer leaves its «Editor» segment, the draft is not.
import { Component, computed, effect, inject, input, output, signal, untracked } from '@angular/core';
import { ActionSheetController, IonButton, IonCard, IonIcon, IonItem, IonLabel, IonNote, ModalController } from '@ionic/angular';

import { SvgIconPipe } from '@okr/shared-pipes';
import { Spinner, TextareaInputI18n } from '@okr/shared-ui';
import { RichTextInput } from '@okr/shared-ui-editor';
import { MAIL_SECTION_TYPES, MailSectionType, SectionModel } from '@okr/shared-models';
import { APP_STORE_MIN } from '@okr/shared-data-access';
import { createSection } from '@okr/cms-section-util';
import { EmailComposerI18n, sectionSummary } from '@okr/content-pdf-template-util';

import { MailPageSectionsDraft } from './mail-page-sections-draft';

const TYPE_ICONS: Record<string, string> = { article: 'document', button: 'link', events: 'calendar' };

@Component({
  selector: 'okr-mail-page-editor',
  standalone: true,
  imports: [SvgIconPipe, RichTextInput, Spinner, IonButton, IonCard, IonIcon, IonItem, IonLabel, IonNote],
  styles: [`
    :host { display: block; }
    ion-card { margin: 0 0 8px; box-shadow: none; border: 1px solid var(--ion-border-color, #d0d7de); border-radius: 8px; }
    .actions { display: flex; justify-content: flex-end; gap: 2px; padding: 0 4px 4px; }
    .summary { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .add { display: flex; justify-content: flex-start; }
    .note { display: block; padding: 4px 0; }
  `],
  template: `
    @if (draft.createFailed()) {
      <ion-note color="danger" class="note">{{ i18n().page_draft_error() }}</ion-note>
    } @else if (!draft.loaded()) {
      <okr-spinner />
    } @else {
      @for (section of sections(); track section.okey; let first = $first; let last = $last) {
        <ion-card>
          @if (section.okey === openKey() && section.type === 'article') {
            <okr-rich-text-input [i18n]="articleI18n" [value]="openHtml()" (valueChange)="onArticleChange(section, $event)"
              [readOnly]="false" [copyable]="true" [autofocus]="autofocus() || chosenKey() === section.okey" />
          } @else {
            <ion-item lines="none" [button]="section.type === 'article'" [detail]="false" (click)="open(section)">
              <ion-icon slot="start" src="{{ typeIcon(section.type) | svgIcon }}" />
              <ion-label>
                @if (summary(section); as text) {
                  <div class="summary">{{ text }}</div>
                } @else {
                  <ion-note>{{ i18n().page_empty() }}</ion-note>
                }
              </ion-label>
            </ion-item>
          }
          <div class="actions">
            <!-- a page of one section has nothing to order or remove: only «Bearbeiten» (title, images) -->
            @if (sections().length > 1) {
              <ion-button fill="clear" size="small" [disabled]="first" (click)="move(section, -1)" [title]="i18n().page_up()" [attr.aria-label]="i18n().page_up()">
                <ion-icon slot="icon-only" src="{{ 'chevron-up' | svgIcon }}" />
              </ion-button>
              <ion-button fill="clear" size="small" [disabled]="last" (click)="move(section, 1)" [title]="i18n().page_down()" [attr.aria-label]="i18n().page_down()">
                <ion-icon slot="icon-only" src="{{ 'chevron-down' | svgIcon }}" />
              </ion-button>
              <ion-button fill="clear" size="small" (click)="remove(section)" [title]="i18n().page_delete()" [attr.aria-label]="i18n().page_delete()">
                <ion-icon slot="icon-only" src="{{ 'trash' | svgIcon }}" />
              </ion-button>
            }
            <ion-button fill="clear" size="small" (click)="edit(section)">
              <ion-icon slot="start" src="{{ 'edit' | svgIcon }}" />
              {{ i18n().page_edit() }}
            </ion-button>
          </div>
        </ion-card>
      }
      @if (draft.saveFailed()) {
        <ion-note color="danger" class="note">{{ i18n().page_save_error() }}</ion-note>
      }
      <div class="add">
        <ion-button fill="outline" size="small" (click)="add()">
          <ion-icon src="{{ 'add' | svgIcon }}" slot="start" />
          {{ i18n().page_add() }}
        </ion-button>
      </div>
    }
  `,
})
export class MailPageEditor {
  protected readonly draft = inject(MailPageSectionsDraft);
  private readonly appStore = inject(APP_STORE_MIN);
  private readonly modalController = inject(ModalController);
  private readonly actionSheetController = inject(ActionSheetController);

  // inputs
  public readonly i18n = input.required<EmailComposerI18n>();
  /** The open article takes the focus when it loads (the composer's subject is already filled in). */
  public readonly autofocus = input(false);

  // outputs
  /** Whether the page shows anything (`mailPageHasContent`): the composer only offers «Senden» then. */
  public readonly hasContent = output<boolean>();

  /** the article has no label of its own: the subject above introduces it */
  protected readonly articleI18n: TextareaInputI18n = { name: 'body', label: '', placeholder: '' };

  protected readonly sections = this.draft.sections;
  /** The article typed into directly; by default the first article of the page. */
  /** An article the sender opened by tapping it: it takes the focus. */
  protected readonly chosenKey = signal<string | undefined>(undefined);
  protected readonly openKey = computed(() => {
    const sections = this.sections();
    const chosen = this.chosenKey();
    if (chosen && sections.some((s) => s.okey === chosen)) return chosen;
    return sections.find((s) => s.type === 'article')?.okey;
  });
  /**
   * The HTML handed to the open article, set once when it opens (or after «Bearbeiten» changed it). Typing is not
   * fed back: the editor keeps its own state, and a stored copy arriving later must not reset the cursor.
   */
  protected readonly openHtml = signal('');

  constructor() {
    effect(() => this.hasContent.emit(this.draft.hasContent()));
    // seed the open article whenever a different one opens
    let seededKey: string | undefined;
    effect(() => {
      const key = this.openKey();
      if (key === seededKey) return;
      seededKey = key;
      untracked(() => this.openHtml.set(this.sections().find((s) => s.okey === key)?.content?.htmlContent ?? ''));
    });
  }

  protected typeIcon(type: string): string {
    return TYPE_ICONS[type] ?? 'document';
  }

  protected summary(section: SectionModel): string {
    return sectionSummary(section);
  }

  protected open(section: SectionModel): void {
    if (section.type === 'article') this.chosenKey.set(section.okey);
  }

  protected onArticleChange(section: SectionModel, html: string): void {
    const current = this.sections().find((s) => s.okey === section.okey) ?? section;
    if ((current.content?.htmlContent ?? '') === html) return;
    this.draft.scheduleSave({ ...current, content: { ...current.content, htmlContent: html } } as SectionModel);
  }

  protected async move(section: SectionModel, dir: -1 | 1): Promise<void> {
    await this.draft.move(section.okey, dir).catch(() => undefined);
  }

  protected async remove(section: SectionModel): Promise<void> {
    await this.draft.delete(section.okey).catch(() => undefined);
  }

  /** «Bearbeiten»: the section form in a modal; the result is written at once. */
  protected async edit(section: SectionModel): Promise<void> {
    await this.draft.flush();
    const current = this.sections().find((s) => s.okey === section.okey) ?? section;
    const edited = await this.openEditor(current);
    if (!edited) return;
    const key = await this.draft.save(edited).catch(() => undefined);
    if (key && key === this.openKey()) this.openHtml.set(edited.content?.htmlContent ?? '');
  }

  /** «Abschnitt hinzufügen»: choose a type; an article opens for typing, the others in their editor first. */
  protected async add(): Promise<void> {
    const type = await this.chooseType();
    if (!type) return;
    const section = createSection(type, this.appStore.tenantId());
    section.okey = '';
    if (type === 'article') {
      const key = await this.draft.save(section).catch(() => undefined);
      if (key) this.chosenKey.set(key);
      return;
    }
    const edited = await this.openEditor(section);
    if (edited) await this.draft.save({ ...edited, okey: '' } as SectionModel).catch(() => undefined);
  }

  private async chooseType(): Promise<MailSectionType | undefined> {
    const i18n = this.i18n();
    const labels: Record<MailSectionType, string> = {
      article: i18n.page_type_article(), button: i18n.page_type_button(), events: i18n.page_type_events(),
    };
    let chosen: MailSectionType | undefined;
    const sheet = await this.actionSheetController.create({
      header: i18n.page_add_header(),
      buttons: [
        ...MAIL_SECTION_TYPES.map((type) => ({ text: labels[type], handler: () => { chosen = type; } })),
        { text: i18n.page_cancel(), role: 'cancel' },
      ],
    });
    await sheet.present();
    await sheet.onDidDismiss();
    return chosen;
  }

  private async openEditor(section: SectionModel): Promise<SectionModel | undefined> {
    // dynamic: the section form and its configurations stay out of the composer's chunk
    const { MailSectionEditModal } = await import('./mail-section-edit.modal');
    const modal = await this.modalController.create({
      component: MailSectionEditModal,
      componentProps: { section, i18n: this.i18n() },
      cssClass: 'modal-wide',
    });
    await modal.present();
    const { data, role } = await modal.onWillDismiss<SectionModel>();
    return role === 'confirm' && data ? data : undefined;
  }
}
