import { Component, computed, DestroyRef, effect, inject, input, signal, untracked } from '@angular/core';
import { Router } from '@angular/router';
import {
  ActionSheetController, AlertController, IonBackButton, IonButton, IonButtons, IonContent, IonFooter, IonHeader, IonIcon, IonTitle, IonToolbar,
  ModalController, PopoverController, ToastController,
} from '@ionic/angular';

import { AlbumSectionComponent, ArticleSectionComponent, HeroSectionComponent } from '@okr/cms-section-feature';
import { AppStore } from '@okr/shared-feature';
import { fill } from '@okr/shared-util-core';
import { FootprintEditModal, JournalBlockSortModal, JournalReactions, ReactionComment, TextBlockEditModal } from '@okr/travel-journal-ui';
import { createActionSheetButton, createActionSheetOptions, okrPrompt } from '@okr/shared-util-angular';
import { SvgIconPipe } from '@okr/shared-pipes';
import { AlbumSection, ArticleSection, IMAGE_STYLE_SHAPE, ImageConfig } from '@okr/shared-models';
import { openImageGallery } from '@okr/shared-ui';
import { blockActions, footprintMenu, FootprintFormModel, htmlToPlainText, lostValueText, StoryBlock, toStorySections } from '@okr/travel-journal-util';

import { JournalFileUrlService } from './journal-file-url.service';
import { showJournalError } from './journal-errors';
import { openJournalMenu } from './journal-menu-open';
import { JournalStore } from './journal.store';

/**
 * A footprint's story page (spec 1.113 §9.2): hero cover, then the text and photo blocks rendered by
 * the standalone CMS section components (not the SectionDispatcher, whose SectionStore queries
 * Firestore). Edited like a CMS content page (spec 1.126 §5): ⋮ menu with an edit-mode toggle, blocks highlighted in
 * edit mode, a tap on a block opens its ActionSheet. Phase 2: every author edits every block; an edit takes a lock first (released in `finally`, and
 * on page destroy), conflict copies and overwritten footprint values are flagged until resolved.
 */
@Component({
  selector: 'okr-journal-story-page',
  imports: [
    JournalReactions,
    IonHeader, IonToolbar, IonButtons, IonBackButton, IonTitle, IonContent, IonFooter, IonButton, IonIcon, SvgIconPipe,
    HeroSectionComponent, ArticleSectionComponent, AlbumSectionComponent,
  ],
  styles: [`
    .plain-title { padding: 16px; }
    .plain-title h1 { margin: 0; }
    .plain-title p { margin: 4px 0 0; color: var(--ion-color-medium); }
    .block { position: relative; }
    /* the CMS edit-mode highlight (content.page .section-wrapper.editable) */
    .block.editable { border: 3px solid var(--ion-color-primary); border-radius: 8px; margin: 8px; padding: 4px; cursor: pointer; }
    .note { font-size: 0.8rem; margin: 4px 8px; color: var(--ion-color-warning-shade); }
    .banner { margin: 8px; padding: 8px 12px; border-radius: 8px; background: var(--ion-color-warning-tint); display: flex; align-items: center; gap: 8px; }
    .banner p { margin: 0; flex: 1; }
    .badge { font-size: 0.75rem; padding: 2px 8px; border-radius: 8px; background: var(--ion-color-light); }
  `],
  template: `
    <ion-header>
      <ion-toolbar color="secondary">
        <ion-buttons slot="start"><ion-back-button [defaultHref]="'/journal/' + journalKey()" /></ion-buttons>
        <ion-title>{{ footprint()?.title || store.i18n.untitled() }}</ion-title>
        <ion-buttons slot="end">
          <span class="badge">{{ footprint()?.publishState === 'published' ? store.i18n.story_published() : store.i18n.story_draft() }}</span>
          @if (menuItems().length > 0) {
            <ion-button (click)="menu($event)" [attr.aria-label]="store.i18n.menu_open()"><ion-icon slot="icon-only" src="{{ 'ellipsis-vertical' | svgIcon }}" /></ion-button>
          }
        </ion-buttons>
      </ion-toolbar>
    </ion-header>
    <ion-content>
      @if (story(); as story) {
        @if (story.hero; as hero) {
          <okr-hero-section [section]="hero" />
        } @else {
          <div class="plain-title">
            <h1>{{ footprint()?.title || store.i18n.untitled() }}</h1>
            <p>{{ footprint()?.placeName }}</p>
          </div>
        }
        @if (canEdit()) {
          @for (lost of footprint()?.lostValues ?? []; track lost.hlc + lost.field) {
            <div class="banner">
              <p>{{ overwritten(lost.field, lost.value) }}</p>
              <ion-button size="small" fill="outline" (click)="act(store.dismissFootprintConflict(footprintKey(), lost.hlc))">{{ store.i18n.conflict_done() }}</ion-button>
            </div>
          }
        }
        @for (item of story.blocks; track item.block.key) {
          @if (canEdit() && item.block.conflict) {
            <p class="note">{{ store.i18n.block_conflict() }}</p>
          }
          @if (editMode() && lockedBy(item); as name) {
            <p class="note">{{ fillName(name) }}</p>
          }
          <div class="block" [class.editable]="editMode() && canEdit()" (click)="tapBlock(item)">
            @if (asArticle(item); as article) {
              <okr-article-section [section]="article" [editMode]="editMode()" />
            } @else if (asAlbum(item); as album) {
              <okr-album-section [section]="album" [explicitImages]="item.images" [showStyleSelect]="false" [editMode]="editMode()"
                [emitImageClicks]="canEdit() && !editMode()" (imageSelected)="photoActions(item, $event)" />
            }
          </div>
        }
        <okr-journal-reactions [likes]="likes().length" [liked]="liked()" [comments]="comments()" [i18n]="store.i18n" [readOnly]="!store.native()"
          (likeToggled)="act(store.toggleLike(footprintKey()))" (writeClicked)="writeComment()" (deleteClicked)="act(store.archiveComment($event))" />
      }
    </ion-content>
    <ion-footer>
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-button [disabled]="!previousKey()" (click)="go(previousKey())">{{ store.i18n.story_previous() }}</ion-button>
          <ion-button [disabled]="!nextKey()" (click)="go(nextKey())">{{ store.i18n.story_next() }}</ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-footer>
  `,
})
export class JournalStoryPage {
  protected readonly store = inject(JournalStore);
  private readonly appStore = inject(AppStore);
  private readonly fileUrl = inject(JournalFileUrlService);
  private readonly router = inject(Router);
  private readonly modalController = inject(ModalController);
  private readonly actionSheetController = inject(ActionSheetController);
  private readonly toastController = inject(ToastController);
  private readonly alertController = inject(AlertController);
  private readonly popoverController = inject(PopoverController);

  public readonly journalKey = input.required<string>();
  public readonly footprintKey = input.required<string>();

  protected readonly editMode = signal(false);
  protected readonly menuItems = computed(() => footprintMenu({ native: this.store.native(), editMode: this.editMode() }));

  protected readonly likes = computed(() => this.store.likes(this.footprintKey()));
  protected readonly liked = computed(() => this.likes().includes(this.store.author()?.personKey ?? ''));
  protected readonly comments = computed<ReactionComment[]>(() => this.store.comments(this.footprintKey())
    .map((c) => ({ ...c, mine: c.authorKey === this.store.author()?.personKey })));

  protected async writeComment(): Promise<void> {
    const i18n = this.store.i18n;
    const text = await okrPrompt(this.alertController, i18n.comment_write(), i18n.comment_prompt(), i18n.comment_send(), i18n.cancel());
    if (text?.trim()) await this.act(this.store.addComment(this.footprintKey(), text));
  }

  protected async act(action: Promise<unknown>): Promise<void> {
    try {
      await action;
    } catch (error) {
      await showJournalError(this.toastController, this.store.i18n, error);
    }
  }

  protected readonly footprints = computed(() => this.store.footprints(this.journalKey()));
  protected readonly footprint = computed(() => this.footprints().find((f) => f.key === this.footprintKey()));
  protected readonly story = computed(() => {
    const fp = this.footprint();
    return fp ? toStorySections(fp, this.store.images(this.journalKey()), (p) => this.fileUrl.url(p), this.appStore.tenantId()) : undefined;
  });
  private readonly index = computed(() => this.footprints().findIndex((f) => f.key === this.footprintKey()));
  protected readonly previousKey = computed(() => (this.index() > 0 ? this.footprints()[this.index() - 1].key : undefined));
  protected readonly nextKey = computed(() => {
    const i = this.index();
    return i >= 0 && i < this.footprints().length - 1 ? this.footprints()[i + 1].key : undefined;
  });

  public constructor() {
    void this.store.init();
    // the journal on screen is the one the other iPad syncs with (P2P, plan 5)
    effect(() => {
      const journalKey = this.journalKey();
      untracked(() => void this.store.openJournal(journalKey));
    });
    // the store is a root singleton: a lock's heartbeat keeps running until released, also when the page goes while a modal is open
    inject(DestroyRef).onDestroy(() => {
      for (const entityKey of this.heldLocks) void this.store.releaseLock(this.journalKey(), entityKey);
      this.heldLocks.clear();
    });
  }

  /** Entities this page holds a lock on right now. */
  private readonly heldLocks = new Set<string>();

  /**
   * One block/footprint interaction at a time — sheet, editor and save. A fast double tap would otherwise
   * stack two sheets, and two saves from the same opened state would make the first one a conflict copy.
   */
  private busy = false;

  private async exclusive(interaction: () => Promise<void>): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    try {
      await interaction();
    } finally {
      this.busy = false;
    }
  }

  protected asArticle(item: StoryBlock): ArticleSection | undefined {
    return item.section.type === 'article' ? item.section : undefined;
  }

  protected asAlbum(item: StoryBlock): AlbumSection | undefined {
    return item.section.type === 'album' ? item.section : undefined;
  }

  /** Every author edits every block (spec 1.126 §5) — but only on the iPad and with a known author. */
  protected canEdit(): boolean {
    return this.store.native() && !!this.store.author()?.personKey;
  }

  /** The name of the person editing this block right now, if somebody else is. */
  protected lockedBy(item: StoryBlock): string | undefined {
    return this.store.lockOf(item.block.key)?.name;
  }

  protected fillName(name: string): string {
    return fill(this.store.i18n.block_locked(), { name });
  }

  protected overwritten(field: string, value: unknown): string {
    return fill(this.store.i18n.footprint_overwritten(), lostValueText(field, value, this.store.i18n));
  }

  private async toastText(message: string): Promise<void> {
    const toast = await this.toastController.create({ message, duration: 3000, position: 'bottom' });
    await toast.present();
  }

  /**
   * Runs an edit under the lock on `entityKey`. A refused lock shows who is editing and runs nothing;
   * a taken lock is released afterwards whatever happens (save, cancel or error).
   */
  private async withLock(entityKey: string, edit: () => Promise<unknown>): Promise<void> {
    const other = await this.store.acquireLock(this.journalKey(), entityKey);
    if (other) {
      await this.toastText(this.fillName(other.name));
      return;
    }
    this.heldLocks.add(entityKey);
    try {
      await edit();
    } finally {
      this.heldLocks.delete(entityKey);
      await this.store.releaseLock(this.journalKey(), entityKey);
    }
  }

  protected async menu(event: Event): Promise<void> {
    switch (await openJournalMenu(this.popoverController, event, this.menuItems(), this.store.i18n)) {
      case 'toggleEditMode': return this.editMode.update((on) => !on);
      case 'addBlock': return this.addBlock();
      case 'sortBlocks': return this.sortBlocks();
      case 'editFootprint': return this.editFootprint();
      case 'deleteFootprint': return this.confirmDeleteFootprint();
    }
  }

  private async addBlock(): Promise<void> {
    const i18n = this.store.i18n;
    const imgix = this.appStore.services.imgixBaseUrl();
    const options = createActionSheetOptions(i18n.add_block_title());
    options.buttons.push(
      createActionSheetButton('block.text', i18n.story_add_text(), imgix, 'text'),
      createActionSheetButton('block.photos', i18n.story_add_photos(), imgix, 'images'),
      createActionSheetButton('cancel', i18n.cancel(), imgix, 'cancel'),
    );
    const sheet = await this.actionSheetController.create(options);
    await sheet.present();
    const { data } = await sheet.onDidDismiss<{ action: string }>();
    if (data?.action === 'block.text') await this.addText();
    else if (data?.action === 'block.photos') await this.addPhotos();
  }

  /** In edit mode a tap on a block opens its ActionSheet (unless somebody else is editing it); outside edit mode a tap does nothing. */
  protected tapBlock(item: StoryBlock): void {
    if (!this.editMode() || !this.canEdit()) return;
    const name = this.lockedBy(item);
    if (name) void this.toastText(this.fillName(name));
    else void this.exclusive(() => this.blockSheet(item));
  }

  private async sortBlocks(): Promise<void> {
    const fp = this.footprint();
    if (!fp || fp.blocks.length < 2) return;
    const blocks = fp.blocks.map((b) => ({
      key: b.key,
      label: b.kind === 'text'
        ? htmlToPlainText(b.html ?? '').slice(0, 40)
        : fill(this.store.i18n.block_photos_label(), { count: b.imageKeys?.length ?? 0 }),
    }));
    const modal = await this.modalController.create({ component: JournalBlockSortModal, componentProps: { blocks } });
    await modal.present();
    const { data, role } = await modal.onWillDismiss<string[]>();
    if (role === 'confirm' && data) await this.run(() => this.store.reorderBlocks(fp.key, data));
  }

  protected go(footprintKey: string | undefined): void {
    if (footprintKey) void this.router.navigate(['/journal', this.journalKey(), footprintKey], { replaceUrl: true });
  }

  private async blockSheet(item: StoryBlock): Promise<void> {
    // what the author sees now is what the edit builds on (spec 1.126 §6.1), not what the store holds at save time
    const seen = { ...item.block.hlcs };
    const i18n = this.store.i18n;
    const imgix = this.appStore.services.imgixBaseUrl();
    const texts: Record<string, [string, string]> = {
      'block.edit': [i18n.block_edit_action(), 'edit'],
      'block.addphotos': [i18n.story_add_photos(), 'images'],
      'block.delete': [i18n.block_delete_action(), 'trash'],
    };
    const actions = blockActions({ kind: item.block.kind, editable: this.canEdit() });
    if (actions.length === 0) return;
    const options = createActionSheetOptions(i18n.block_edit_action());
    options.buttons.push(
      ...actions.map((a) => createActionSheetButton(a, texts[a][0], imgix, texts[a][1])),
      createActionSheetButton('cancel', i18n.cancel(), imgix, 'cancel'),
    );
    const sheet = await this.actionSheetController.create(options);
    await sheet.present();
    const { data } = await sheet.onDidDismiss<{ action: string }>();
    switch (data?.action) {
      case 'block.edit': return this.withLock(item.block.key, () => this.editText(item.block.key, item.block.html ?? '', seen));
      case 'block.addphotos': return this.addPhotosToBlock(item.block.key, seen);
      case 'block.delete': return this.confirmDeleteBlock(item.block.key);
    }
  }

  private async confirmDeleteBlock(blockKey: string): Promise<void> {
    const i18n = this.store.i18n;
    const sheet = await this.actionSheetController.create({
      header: i18n.block_delete_confirm(),
      buttons: [
        { text: i18n.block_delete_action(), role: 'destructive', handler: () => void this.run(() => this.store.archiveBlock(blockKey)) },
        { text: i18n.cancel(), role: 'cancel' },
      ],
    });
    await sheet.present();
  }

  /** Own photo block: view the photo in the gallery, or remove it from the block. */
  protected photoActions(item: StoryBlock, image: ImageConfig): Promise<void> {
    return this.exclusive(async () => {
      const seen = { ...item.block.hlcs };
      const i18n = this.store.i18n;
      const sheet = await this.actionSheetController.create({
        header: i18n.photo_actions(),
        buttons: [
          { text: i18n.photo_view(), handler: () => void openImageGallery(this.modalController, item.images ?? [], image, IMAGE_STYLE_SHAPE) },
          { text: i18n.photo_remove(), role: 'destructive', data: { action: 'remove' } },
          { text: i18n.cancel(), role: 'cancel' },
        ],
      });
      await sheet.present();
      const { data } = await sheet.onDidDismiss<{ action: string }>();
      if (data?.action === 'remove') await this.run(() => this.store.removePhotoFromBlock(item.block.key, image.label, seen));
    });
  }

  private async confirmDeleteFootprint(): Promise<void> {
    const i18n = this.store.i18n;
    const footprintKey = this.footprintKey();
    const sheet = await this.actionSheetController.create({
      header: i18n.story_footprint_delete_confirm(),
      buttons: [
        {
          text: i18n.story_footprint_delete(), role: 'destructive',
          handler: () => void this.run(async () => {
            await this.store.archiveFootprint(footprintKey);
            await this.router.navigate(['/journal', this.journalKey()], { replaceUrl: true });
          }),
        },
        { text: i18n.cancel(), role: 'cancel' },
      ],
    });
    await sheet.present();
  }

  private async addPhotosToBlock(blockKey: string, seen: Record<string, string>): Promise<void> {
    await this.run(async () => this.toastResult(await this.store.addPhotosToBlock(blockKey, seen)));
  }

  protected async addText(): Promise<void> {
    const html = await this.openTextModal('');
    if (html !== undefined) await this.run(() => this.store.addTextBlock(this.footprintKey(), html));
  }

  private async editText(blockKey: string, current: string, seen: Record<string, string>): Promise<void> {
    const html = await this.openTextModal(current);
    if (html !== undefined) await this.run(() => this.store.updateTextBlock(blockKey, html, seen));
  }

  protected async addPhotos(): Promise<void> {
    await this.run(async () => {
      await this.toastResult(await this.store.addPhotoBlock(this.journalKey(), this.footprintKey()));
    });
  }

  private async toastResult({ added, skipped }: { added: number; skipped: unknown[] }): Promise<void> {
    const parts: string[] = [];
    if (added > 0) parts.push(fill(this.store.i18n.photos_added(), { count: added }));
    if (skipped.length > 0) parts.push(fill(this.store.i18n.photos_skipped(), { count: skipped.length }));
    if (parts.length === 0) return;
    const toast = await this.toastController.create({ message: parts.join(' · '), duration: 3000, position: 'bottom' });
    await toast.present();
  }

  protected editFootprint(): Promise<void> {
    return this.exclusive(async () => {
      // the footprint as the modal shows it: the baseline of the changed fields and of their bases
      const fp = this.footprint();
      if (!fp) return;
      const current: FootprintFormModel = {
        title: fp.title, placeName: fp.placeName, date: fp.date, time: fp.time, published: fp.publishState === 'published', transport: fp.transport ?? '',
      };
      await this.withLock(fp.key, async () => {
        const modal = await this.modalController.create({ component: FootprintEditModal, componentProps: { footprint: current }, cssClass: 'auto-height-modal' });
        await modal.present();
        const { data, role } = await modal.onWillDismiss<FootprintFormModel>();
        if (role === 'confirm' && data) await this.run(() => this.store.saveFootprintForm(fp.key, data, fp));
      });
    });
  }

  private async openTextModal(html: string): Promise<string | undefined> {
    const modal = await this.modalController.create({ component: TextBlockEditModal, componentProps: { html }, cssClass: 'auto-height-modal' });
    await modal.present();
    const { data, role } = await modal.onWillDismiss<{ html: string }>();
    return role === 'confirm' && data ? data.html : undefined;
  }

  private async run(action: () => Promise<unknown>): Promise<void> {
    try {
      await action();
    } catch (error) {
      await showJournalError(this.toastController, this.store.i18n, error);
    }
  }
}
