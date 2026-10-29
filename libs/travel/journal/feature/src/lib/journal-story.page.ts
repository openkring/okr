import { Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { Router } from '@angular/router';
import {
  ActionSheetController, AlertController, IonBackButton, IonButton, IonButtons, IonContent, IonFooter, IonHeader, IonIcon, IonTitle, IonToolbar,
  ModalController, PopoverController, ToastController,
} from '@ionic/angular';

import { AlbumSectionComponent, ArticleSectionComponent, HeroSectionComponent } from '@okr/cms-section-feature';
import { AppStore } from '@okr/shared-feature';
import { fill } from '@okr/shared-util-core';
import { FootprintEditModal, JournalReactions, ReactionComment, TextBlockEditModal } from '@okr/travel-journal-ui';
import { createActionSheetButton, createActionSheetOptions, okrPrompt } from '@okr/shared-util-angular';
import { SvgIconPipe } from '@okr/shared-pipes';
import { AlbumSection, ArticleSection, IMAGE_STYLE_SHAPE, ImageConfig } from '@okr/shared-models';
import { openImageGallery } from '@okr/shared-ui';
import { blockActions, footprintMenu, FootprintFormModel, StoryBlock, toStorySections } from '@okr/travel-journal-util';

import { JournalFileUrlService } from './journal-file-url.service';
import { showJournalError } from './journal-errors';
import { openJournalMenu } from './journal-menu-open';
import { JournalStore } from './journal.store';

/**
 * A footprint's story page (spec 1.113 §9.2): hero cover, then the text and photo blocks rendered by
 * the standalone CMS section components (not the SectionDispatcher, whose SectionStore queries
 * Firestore). Edited like a CMS content page (spec 1.126 §5): ⋮ menu with an edit-mode toggle, blocks highlighted in
 * edit mode, a tap on a block opens its ActionSheet. Phase 1: only the author of a block can edit or delete it.
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
        @for (item of story.blocks; track item.block.key) {
          <div class="block" [class.editable]="editMode() && isOwn(item)" (click)="tapBlock(item)">
            @if (asArticle(item); as article) {
              <okr-article-section [section]="article" />
            } @else if (asAlbum(item); as album) {
              <okr-album-section [section]="album" [explicitImages]="item.images" [showStyleSelect]="false"
                [emitImageClicks]="isOwn(item) && !editMode()" (imageSelected)="photoActions(item, $event)" />
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
  }

  protected asArticle(item: StoryBlock): ArticleSection | undefined {
    return item.section.type === 'article' ? item.section : undefined;
  }

  protected asAlbum(item: StoryBlock): AlbumSection | undefined {
    return item.section.type === 'album' ? item.section : undefined;
  }

  protected isOwn(item: StoryBlock): boolean {
    // only on the iPad, and only with a known author (no identity yet = nothing is «own»)
    const me = this.store.author()?.personKey;
    return this.store.native() && !!me && item.block.authorKey === me;
  }

  protected async menu(event: Event): Promise<void> {
    switch (await openJournalMenu(this.popoverController, event, this.menuItems(), this.store.i18n)) {
      case 'toggleEditMode': return this.editMode.update((on) => !on);
      case 'addBlock': return this.addBlock();
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

  /** In edit mode a tap on an own block opens its ActionSheet; outside edit mode a tap does nothing. */
  protected tapBlock(item: StoryBlock): void {
    if (this.editMode() && this.isOwn(item)) void this.blockSheet(item);
  }

  protected go(footprintKey: string | undefined): void {
    if (footprintKey) void this.router.navigate(['/journal', this.journalKey(), footprintKey], { replaceUrl: true });
  }

  private async blockSheet(item: StoryBlock): Promise<void> {
    const i18n = this.store.i18n;
    const imgix = this.appStore.services.imgixBaseUrl();
    const texts: Record<string, [string, string]> = {
      'block.edit': [i18n.block_edit_action(), 'edit'],
      'block.addphotos': [i18n.story_add_photos(), 'images'],
      'block.delete': [i18n.block_delete_action(), 'trash'],
    };
    const actions = blockActions({ kind: item.block.kind, own: this.isOwn(item) });
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
      case 'block.edit': return this.editText(item.block.key, item.block.html ?? '');
      case 'block.addphotos': return this.addPhotosToBlock(item.block.key);
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
  protected async photoActions(item: StoryBlock, image: ImageConfig): Promise<void> {
    const i18n = this.store.i18n;
    const sheet = await this.actionSheetController.create({
      header: i18n.photo_actions(),
      buttons: [
        { text: i18n.photo_view(), handler: () => void openImageGallery(this.modalController, item.images ?? [], image, IMAGE_STYLE_SHAPE) },
        { text: i18n.photo_remove(), role: 'destructive', handler: () => void this.run(() => this.store.removePhotoFromBlock(item.block.key, image.label)) },
        { text: i18n.cancel(), role: 'cancel' },
      ],
    });
    await sheet.present();
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

  private async addPhotosToBlock(blockKey: string): Promise<void> {
    await this.run(async () => this.toastResult(await this.store.addPhotosToBlock(blockKey)));
  }

  protected async addText(): Promise<void> {
    const html = await this.openTextModal('');
    if (html !== undefined) await this.run(() => this.store.addTextBlock(this.footprintKey(), html));
  }

  private async editText(blockKey: string, current: string): Promise<void> {
    const html = await this.openTextModal(current);
    if (html !== undefined) await this.run(() => this.store.updateTextBlock(blockKey, html));
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

  protected async editFootprint(): Promise<void> {
    const fp = this.footprint();
    if (!fp) return;
    const current: FootprintFormModel = {
      title: fp.title, placeName: fp.placeName, date: fp.date, time: fp.time, published: fp.publishState === 'published', transport: fp.transport ?? '',
    };
    const modal = await this.modalController.create({ component: FootprintEditModal, componentProps: { footprint: current }, cssClass: 'auto-height-modal' });
    await modal.present();
    const { data, role } = await modal.onWillDismiss<FootprintFormModel>();
    if (role === 'confirm' && data) await this.run(() => this.store.saveFootprintForm(fp.key, data));
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
