import { Component, computed, input, output } from '@angular/core';
import { CdkDrag, CdkDragPlaceholder, CdkDragPreview, CdkDropList } from '@angular/cdk/drag-drop';
import { IonIcon, IonNote } from '@ionic/angular';

import { ARTICLE_BLOCK_TYPES, MAIL_BLOCK_TYPES, MailBlockType } from '@okr/shared-models';
import { SvgIconPipe } from '@okr/shared-pipes';
import { fill } from '@okr/shared-util-core';
import { ARTICLE_BLOCK_ICONS, ARTICLE_BLOCKS_MAX, ArticleEditorI18n, blockTypeLabel } from '@okr/cms-section-util';

import { ARTICLE_PANEL_STYLES } from './article-panel.styles';

/** What a dragged entry of the library carries (`cdkDragData`), in an article or a mail. */
export interface NewBlockDrag { newType: MailBlockType }

/**
 * «Blöcke» (spec 1.175 §7.3): the block types of an article or a mail. A click adds one at the end; with a mouse an entry can be dragged into it.
 * A connected drop list whose entries are copied: sorting is off and nothing can be dropped here.
 */
@Component({
  selector: 'okr-article-block-library',
  standalone: true,
  imports: [CdkDrag, CdkDragPlaceholder, CdkDragPreview, CdkDropList, IonIcon, IonNote, SvgIconPipe],
  host: { role: 'region', '[attr.aria-label]': 'i18n().article_editor_library_title()' },
  styles: [ARTICLE_PANEL_STYLES, `
    .entries { display: grid; grid-template-columns: repeat(auto-fill, minmax(92px, 1fr)); gap: 8px; padding: 8px 16px; }
    /* keeps its place while its entry is dragged over the article */
    .cell { min-height: 72px; }
    .entry { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 6px; width: 100%; height: 72px; padding: 4px;
             border: 1px solid var(--ion-color-light-shade); border-radius: 8px; background: var(--ion-item-background, var(--ion-background-color, #fff));
             color: var(--ion-text-color, #000); font: inherit; font-size: 0.8rem; text-align: center; cursor: pointer; }
    .entry ion-icon { font-size: 1.4rem; }
    .entry:hover:not(:disabled) { border-color: var(--ion-color-primary); }
    .entry:focus-visible { outline: 2px solid var(--ion-color-primary); outline-offset: 2px; }
    .entry:disabled { opacity: 0.4; cursor: not-allowed; }
    .preview { padding: 10px 16px; border-radius: 8px; background: var(--ion-color-primary); color: var(--ion-color-primary-contrast); font-size: 0.85rem; box-shadow: 0 4px 16px rgba(0, 0, 0, 0.3); }
    .place { box-sizing: border-box; width: 100%; height: 40px; border: 2px dashed var(--ion-color-primary); border-radius: 8px; }
  `],
  template: `
    <div class="panel-head"><h2>{{ i18n().article_editor_library_title() }}</h2></div>
    <ion-note class="note">{{ hint() }}</ion-note>
    <div class="entries" cdkDropList [cdkDropListSortingDisabled]="true" [cdkDropListEnterPredicate]="nothingEnters" [cdkDropListConnectedTo]="dropLists()" [cdkDropListDisabled]="!canDrag()">
      @for (type of types(); track type) {
        <div class="cell">
          <button type="button" class="entry" cdkDrag [cdkDragData]="dataOf(type)" [cdkDragDisabled]="!canDrag()" [disabled]="disabled()" [attr.aria-label]="addLabel(type)" (click)="add.emit(type)">
            <ion-icon src="{{ icons[type] | svgIcon }}" aria-hidden="true" />
            <span>{{ label(type) }}</span>
            <div *cdkDragPreview class="preview">{{ label(type) }}</div>
            <div *cdkDragPlaceholder class="place"></div>
          </button>
        </div>
      }
    </div>
  `,
})
export class ArticleBlockLibrary {
  // inputs
  /** the types that may be added at the end: `profile.types` */
  public readonly allowed = input<readonly MailBlockType[]>(ARTICLE_BLOCK_TYPES);
  /** the article is full (`!canAddBlock(blocks)`) */
  public readonly disabled = input(false);
  /** false on a phone: entries are only clicked */
  public readonly dragEnabled = input(true);
  /** the drop lists of the canvas (or their ids), the inner ones first; not needed inside a `cdkDropListGroup` */
  public readonly dropLists = input<(CdkDropList | string)[]>([]);
  public readonly i18n = input.required<ArticleEditorI18n>();

  // outputs
  public readonly add = output<MailBlockType>();

  protected readonly icons = ARTICLE_BLOCK_ICONS;
  protected readonly types = computed(() => MAIL_BLOCK_TYPES.filter((type) => this.allowed().includes(type)));
  protected readonly canDrag = computed(() => this.dragEnabled() && !this.disabled());
  protected readonly hint = computed(() => {
    const i18n = this.i18n();
    if (this.disabled()) return fill(i18n.article_editor_library_full(), { max: ARTICLE_BLOCKS_MAX });
    return this.dragEnabled() ? i18n.article_editor_library_hint() : i18n.article_editor_library_hintTap();
  });
  protected readonly nothingEnters = (): boolean => false;

  protected dataOf(type: MailBlockType): NewBlockDrag { return { newType: type }; }
  protected label(type: MailBlockType): string { return blockTypeLabel(this.i18n(), type); }
  protected addLabel(type: MailBlockType): string { return fill(this.i18n().article_editor_library_add(), { block: this.label(type) }); }
}
