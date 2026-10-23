import { NgTemplateOutlet } from '@angular/common';
import { Component, input, output } from '@angular/core';
import { IonCol, IonGrid, IonIcon, IonItem, IonLabel, IonList, IonRow, IonThumbnail } from '@ionic/angular';

import { averageStars, LearningI18n, stripHtml } from '@okr/content-learning-util';
import { DocumentModel } from '@okr/shared-models';
import { SvgIconPipe } from '@okr/shared-pipes';
import { EmptyList, VideoCard } from '@okr/shared-ui';

import { RatingStars } from './rating-stars';

/**
 * The video archive of a learning room (spec 1.115 §5.2, à la YouTube/nanoo): grid of poster
 * cards or a compact list. Each item shows poster, title, the average rating and two badges —
 * «Notiz» when the curators wrote notes, and a link icon with the number of links.
 * There is no duration: the document model carries none.
 *
 * Presentation only: the feature signs the posters (`posters`: docKey → signed URL, spec 1.82) and
 * decides what `open` does (the item detail with the player). A video without a poster (not yet
 * signed, not transcoded, or not available to this person) shows the neutral card with
 * «Video nicht verfügbar» but stays openable through its title, so the detail can explain why.
 */
@Component({
  selector: 'okr-learning-video-grid',
  standalone: true,
  imports: [
    NgTemplateOutlet, SvgIconPipe, VideoCard, EmptyList, RatingStars,
    IonGrid, IonRow, IonCol, IonList, IonItem, IonLabel, IonThumbnail, IonIcon,
  ],
  styles: [`
    .meta { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; font-size: 0.8rem; color: var(--ion-color-medium); }
    .title { margin: 0.35rem 0 0.15rem; font-size: 0.9rem; cursor: pointer; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .badge { display: inline-flex; align-items: center; gap: 2px; }
    .poster-thumb { width: 100%; height: 100%; object-fit: cover; border-radius: 4px; }
    ion-thumbnail { --size: 64px; width: 96px; height: 54px; }
    .placeholder { width: 100%; height: 100%; background: var(--ion-color-step-150, var(--ion-color-light)); border-radius: 4px; }
  `],
  template: `
    @if (docs().length === 0) {
      <okr-empty-list [message]="i18n().empty_videos()" />
    } @else if (view() === 'list') {
      <ion-list>
        @for (doc of docs(); track doc.okey) {
          <ion-item button (click)="open.emit(doc)">
            <ion-thumbnail slot="start">
              @if (posters()[doc.okey]; as poster) {
                <img class="poster-thumb" [src]="poster" [alt]="doc.altText || doc.title" />
              } @else {
                <div class="placeholder"></div>
              }
            </ion-thumbnail>
            <ion-label>
              <h3>{{ doc.title }}</h3>
              <ng-container [ngTemplateOutlet]="meta" [ngTemplateOutletContext]="{ $implicit: doc }" />
            </ion-label>
          </ion-item>
        }
      </ion-list>
    } @else {
      <ion-grid>
        <ion-row>
          @for (doc of docs(); track doc.okey) {
            <ion-col size="12" size-sm="6" size-md="4" size-xl="3">
              <okr-video-card
                [posterUrl]="posters()[doc.okey] ?? ''"
                [available]="!!posters()[doc.okey]"
                [unavailableLabel]="i18n().item_videoUnavailable()"
                (clicked)="open.emit(doc)" />
              <p class="title" role="button" tabindex="0" (click)="open.emit(doc)" (keydown.enter)="open.emit(doc)">{{ doc.title }}</p>
              <ng-container [ngTemplateOutlet]="meta" [ngTemplateOutletContext]="{ $implicit: doc }" />
            </ion-col>
          }
        </ion-row>
      </ion-grid>
    }

    <ng-template #meta let-doc>
      <div class="meta">
        <okr-rating-stars [value]="average(doc)" [readOnly]="true" [i18n]="i18n()" />
        @if ((doc.ratingCount ?? 0) > 0) {
          <span>({{ doc.ratingCount }})</span>
        }
        @if (hasNotes(doc)) {
          <span class="badge"><ion-icon src="{{ 'note' | svgIcon }}" aria-hidden="true" />{{ i18n().item_notes() }}</span>
        }
        @if ((doc.links ?? []).length > 0) {
          <span class="badge"><ion-icon src="{{ 'link' | svgIcon }}" aria-hidden="true" />{{ (doc.links ?? []).length }}</span>
        }
      </div>
    </ng-template>
  `
})
export class LearningVideoGrid {
  public docs = input<DocumentModel[]>([]);
  /** docKey → signed poster URL; a missing key renders the neutral «nicht verfügbar» card. */
  public posters = input<Record<string, string>>({});
  public view = input<'list' | 'grid'>('grid');
  public i18n = input.required<LearningI18n>();

  public open = output<DocumentModel>();

  protected average(doc: DocumentModel): number {
    return averageStars(doc);
  }

  /** Notes are rich text; an editor leaves '<p></p>' behind when emptied. */
  protected hasNotes(doc: DocumentModel): boolean {
    return stripHtml(doc.notes ?? '').length > 0;
  }
}
