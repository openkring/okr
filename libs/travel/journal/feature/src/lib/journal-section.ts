import { Component, computed, input, output } from '@angular/core';

import { AlbumSectionComponent, ArticleSectionComponent, HeroSectionComponent } from '@okr/cms-section-feature';
import type { HeroOverlayText } from '@okr/cms-section-util';
import { AlbumSection, ArticleSection, HeroSection, ImageConfig, SectionModel } from '@okr/shared-models';
import { JournalVideoBlock, VideoClip } from '@okr/travel-journal-ui';

/**
 * One section of a footprint (spec 1.154 §2), rendered by the standalone CMS section components — not the
 * SectionDispatcher, whose SectionStore queries Firestore. Presentational: the parent turns the change-log view
 * into a `SectionModel` (`sectionModelOf`), resolves every image `url` from its journal key (`label`) and passes
 * the video clips; nothing here reads the journal or Firestore, so the guest page renders with it too.
 *
 * Phase 2 knows four of the six journal types: hero, article, album, video. A hero draws `overlayText` over its
 * cover; the page passes it to the footprint's first hero only.
 *
 * Lives in the feature lib, not in `travel-journal-ui`: the CMS section components are in `cms-section-feature`,
 * which a ui lib must not import (module boundaries).
 */
@Component({
  selector: 'okr-journal-section',
  standalone: true,
  imports: [HeroSectionComponent, ArticleSectionComponent, AlbumSectionComponent, JournalVideoBlock],
  styles: [`
    :host { display: block; }
    .title { margin: 8px 16px 0; font-size: 1.2rem; font-weight: 600; }
  `],
  template: `
    @switch (section().type) {
      @case ('hero') {
        <okr-hero-section [section]="hero()" [overlayText]="overlayText()" [chipIcon]="chipIcon()" />
      }
      @case ('article') {
        <okr-article-section [section]="article()" [editMode]="editMode()" [imageBadges]="imageBadges()" [emitImageClicks]="emitImageClicks()"
          (imageSelected)="imageSelected.emit($event)" />
      }
      @case ('album') {
        @if (section().title) { <div class="title">{{ section().title }}</div> }
        <okr-album-section [section]="album()" [explicitImages]="albumImages()" [showStyleSelect]="false" [editMode]="editMode()"
          [imageBadges]="imageBadges()" [emitImageClicks]="emitImageClicks()" (imageSelected)="imageSelected.emit($event)" />
      }
      @case ('video') {
        @if (section().title) { <div class="title">{{ section().title }}</div> }
        <okr-journal-video-block [clips]="clips()" [i18n]="{ notLoaded: notLoaded() }" />
      }
    }
  `,
})
export class JournalSection {
  /** The section with every image `url` resolved (images that cannot be shown are left out by the parent). */
  public readonly section = input.required<SectionModel>();
  /** video: the clips with their poster and mp4 urls */
  public readonly clips = input<VideoClip[]>([]);
  /** hero: the footprint's lines over the cover; undefined draws the CMS hero card */
  public readonly overlayText = input<HeroOverlayText | undefined>(undefined);
  /** hero: an icon in front of the chip with exactly this text (the weather chip) */
  public readonly chipIcon = input<{ chip: string; name: string; set: string } | undefined>(undefined);
  public readonly editMode = input(false);
  /** video: the note on a clip whose mp4 is not on this device yet */
  public readonly notLoaded = input('');
  /** article, album: the badge per image, by journal image key (`label`) — «❤ n · 💬 n» (spec 1.154 §7) */
  public readonly imageBadges = input<Record<string, string>>({});
  /** article, album: a tap on an image goes to `imageSelected` (its feedback sheet) instead of the image's own action */
  public readonly emitImageClicks = input(false);
  public readonly imageSelected = output<ImageConfig>();

  protected readonly hero = computed(() => this.section() as HeroSection);
  protected readonly article = computed(() => this.section() as ArticleSection);
  protected readonly album = computed(() => this.section() as AlbumSection);
  protected readonly albumImages = computed<ImageConfig[]>(() => (this.section() as AlbumSection).properties.images ?? []);
}
