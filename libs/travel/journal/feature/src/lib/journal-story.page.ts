import { Component, computed, inject, input } from '@angular/core';
import { Router } from '@angular/router';
import {
  ActionSheetController, IonBackButton, IonButton, IonButtons, IonContent, IonFooter, IonHeader, IonTitle, IonToolbar,
  ModalController, ToastController,
} from '@ionic/angular';

import { AlbumSectionComponent, ArticleSectionComponent, HeroSectionComponent } from '@okr/cms-section-feature';
import { AppStore } from '@okr/shared-feature';
import { fill } from '@okr/shared-util-core';
import { FootprintEditModal, TextBlockEditModal } from '@okr/travel-journal-ui';
import { AlbumSection, ArticleSection } from '@okr/shared-models';
import { FootprintFormModel, StoryBlock, toStorySections } from '@okr/travel-journal-util';

import { JournalFileUrlService } from './journal-file-url.service';
import { showJournalError } from './journal-errors';
import { JournalStore } from './journal.store';

/**
 * A footprint's story page (spec 1.113 §9.2): hero cover, then the text and photo blocks rendered by
 * the standalone CMS section components (not the SectionDispatcher, whose SectionStore queries
 * Firestore). Only the author of a block can edit or delete it.
 */
@Component({
  selector: 'okr-journal-story-page',
  imports: [
    IonHeader, IonToolbar, IonButtons, IonBackButton, IonTitle, IonContent, IonFooter, IonButton,
    HeroSectionComponent, ArticleSectionComponent, AlbumSectionComponent,
  ],
  styles: [`
    .plain-title { padding: 16px; }
    .plain-title h1 { margin: 0; }
    .plain-title p { margin: 4px 0 0; color: var(--ion-color-medium); }
    .block { position: relative; }
    .block-meta { display: flex; justify-content: space-between; align-items: center; padding: 0 16px; font-size: 0.8rem; color: var(--ion-color-medium); }
    .badge { font-size: 0.75rem; padding: 2px 8px; border-radius: 8px; background: var(--ion-color-light); }
  `],
  template: `
    <ion-header>
      <ion-toolbar>
        <ion-buttons slot="start"><ion-back-button [defaultHref]="'/journal/' + journalKey()" /></ion-buttons>
        <ion-title>{{ footprint()?.title || store.i18n.untitled() }}</ion-title>
        <ion-buttons slot="end">
          <span class="badge">{{ footprint()?.publishState === 'published' ? store.i18n.story_published() : store.i18n.story_draft() }}</span>
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
          <div class="block">
            <div class="block-meta">
              <span>{{ authorLabel(item) }}</span>
              @if (isOwn(item)) { <ion-button fill="clear" size="small" (click)="blockActions(item)">{{ store.i18n.block_actions() }}</ion-button> }
            </div>
            @if (asArticle(item); as article) {
              <okr-article-section [section]="article" />
            } @else if (asAlbum(item); as album) {
              <okr-album-section [section]="album" [explicitImages]="item.images" [showStyleSelect]="false" />
            }
          </div>
        }
      }
    </ion-content>
    <ion-footer>
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-button [disabled]="!previousKey()" (click)="go(previousKey())">{{ store.i18n.story_previous() }}</ion-button>
          <ion-button [disabled]="!nextKey()" (click)="go(nextKey())">{{ store.i18n.story_next() }}</ion-button>
        </ion-buttons>
        <ion-buttons slot="end">
          <ion-button (click)="addText()">{{ store.i18n.story_add_text() }}</ion-button>
          <ion-button (click)="addPhotos()">{{ store.i18n.story_add_photos() }}</ion-button>
          <ion-button (click)="editFootprint()">{{ store.i18n.story_edit_footprint() }}</ion-button>
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

  public readonly journalKey = input.required<string>();
  public readonly footprintKey = input.required<string>();

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
  }

  protected asArticle(item: StoryBlock): ArticleSection | undefined {
    return item.section.type === 'article' ? item.section : undefined;
  }

  protected asAlbum(item: StoryBlock): AlbumSection | undefined {
    return item.section.type === 'album' ? item.section : undefined;
  }

  protected isOwn(item: StoryBlock): boolean {
    return item.block.authorKey === this.store.author()?.personKey;
  }

  protected authorLabel(item: StoryBlock): string {
    if (this.isOwn(item)) return this.store.i18n.story_by_you();
    // other authors' names arrive with the journal's author list (plan 5/6); until then no name
    return '';
  }

  protected go(footprintKey: string | undefined): void {
    if (footprintKey) void this.router.navigate(['/journal', this.journalKey(), footprintKey], { replaceUrl: true });
  }

  protected async blockActions(item: StoryBlock): Promise<void> {
    const i18n = this.store.i18n;
    const buttons = [
      ...(item.block.kind === 'text' ? [{ text: i18n.block_edit(), handler: () => void this.editText(item.block.key, item.block.html ?? '') }] : []),
      { text: i18n.block_delete(), role: 'destructive', handler: () => void this.run(() => this.store.archiveBlock(item.block.key)) },
      { text: i18n.cancel(), role: 'cancel' },
    ];
    const sheet = await this.actionSheetController.create({ header: i18n.block_delete_confirm(), buttons });
    await sheet.present();
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
      const { added, skipped } = await this.store.addPhotoBlock(this.journalKey(), this.footprintKey());
      const parts = [];
      if (added > 0) parts.push(fill(this.store.i18n.photos_added(), { count: added }));
      if (skipped.length > 0) parts.push(fill(this.store.i18n.photos_skipped(), { count: skipped.length }));
      if (parts.length > 0) {
        const toast = await this.toastController.create({ message: parts.join(' · '), duration: 3000, position: 'bottom' });
        await toast.present();
      }
    });
  }

  protected async editFootprint(): Promise<void> {
    const fp = this.footprint();
    if (!fp) return;
    const current: FootprintFormModel = { title: fp.title, placeName: fp.placeName, date: fp.date, time: fp.time, published: fp.publishState === 'published' };
    const modal = await this.modalController.create({ component: FootprintEditModal, componentProps: { footprint: current } });
    await modal.present();
    const { data, role } = await modal.onWillDismiss<FootprintFormModel>();
    if (role === 'confirm' && data) await this.run(() => this.store.saveFootprintForm(fp.key, data));
  }

  private async openTextModal(html: string): Promise<string | undefined> {
    const modal = await this.modalController.create({ component: TextBlockEditModal, componentProps: { html } });
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
