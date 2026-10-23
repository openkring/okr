import { Component, input, model } from '@angular/core';
import { IonChip, IonLabel, IonSearchbar, IonSegment, IonSegmentButton, IonToolbar } from '@ionic/angular';

import { LearningFilter, LearningI18n, LearningTab } from '@okr/content-learning-util';

/**
 * The sticky filter bar of a learning room (spec 1.115 §5.2): search, then the tabs
 * Dateien · Videos · Bilder (each with its count), then the room's topic chips («Alle» = topic '').
 *
 * Presentation only: every change is written into the two-way `filter` model; the feature
 * filters the documents (filterLearningDocs) and computes the per-tab `counts`.
 */
@Component({
  selector: 'okr-learning-toolbar',
  standalone: true,
  imports: [IonToolbar, IonSearchbar, IonSegment, IonSegmentButton, IonChip, IonLabel],
  styles: [`
    :host { display: block; position: sticky; top: 0; z-index: 10; background: var(--ion-background-color); }
    .chips { display: flex; flex-wrap: wrap; gap: 4px; padding: 4px 8px 8px; }
    .count { margin-left: 4px; color: var(--ion-color-medium); }
  `],
  template: `
    <ion-toolbar>
      <ion-searchbar
        [value]="filter().query"
        (ionInput)="onSearch($event)"
        [placeholder]="i18n().search_placeholder()"
        debounce="300"
      />
    </ion-toolbar>
    <ion-toolbar>
      <ion-segment [value]="filter().tab" (ionChange)="onTab($event)">
        @for (tab of tabs; track tab) {
          <ion-segment-button [value]="tab">
            <ion-label>{{ tabLabel(tab) }}<span class="count">{{ counts()[tab] ?? 0 }}</span></ion-label>
          </ion-segment-button>
        }
      </ion-segment>
    </ion-toolbar>
    @if (topics().length > 0) {
      <div class="chips">
        <ion-chip [color]="filter().topic === '' ? 'primary' : 'medium'" (click)="selectTopic('')">
          <ion-label>{{ i18n().topic_all() }}</ion-label>
        </ion-chip>
        @for (topic of topics(); track topic) {
          <ion-chip [color]="filter().topic === topic ? 'primary' : 'medium'" (click)="selectTopic(topic)">
            <ion-label>{{ topic }}</ion-label>
          </ion-chip>
        }
      </div>
    }
  `
})
export class LearningToolbar {
  public topics = input<string[]>([]);
  public counts = input<Record<LearningTab, number>>({ files: 0, videos: 0, images: 0 });
  public i18n = input.required<LearningI18n>();
  public filter = model.required<LearningFilter>();

  protected readonly tabs: LearningTab[] = ['files', 'videos', 'images'];

  protected tabLabel(tab: LearningTab): string {
    switch (tab) {
      case 'videos': return this.i18n().tab_videos();
      case 'images': return this.i18n().tab_images();
      default: return this.i18n().tab_files();
    }
  }

  protected onSearch(event: Event): void {
    const query = String((event as CustomEvent).detail?.value ?? '');
    this.filter.update(f => ({ ...f, query }));
  }

  protected onTab(event: Event): void {
    const value = (event as CustomEvent).detail?.value;
    if (value === 'files' || value === 'videos' || value === 'images') {
      this.filter.update(f => ({ ...f, tab: value }));
    }
  }

  protected selectTopic(topic: string): void {
    this.filter.update(f => ({ ...f, topic }));
  }
}
