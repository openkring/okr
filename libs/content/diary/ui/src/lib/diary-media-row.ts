import { Component, input, output, signal } from '@angular/core';
import { IonIcon, IonSkeletonText } from '@ionic/angular';

import { SvgIconPipe } from '@okr/shared-pipes';
import { DiaryMediaFile, diaryFileIconName } from '@okr/content-diary-util';

/** Placeholder tiles shown while the folder listing itself is still loading. */
const LOADING_TILES = [0, 1, 2, 3];

/**
 * One horizontal strip of a diary day's Drive files (spec 1.106 §2.3) — images or documents.
 * Every tile is a fixed-size placeholder first (skeleton, or the file-type icon for a document),
 * so the layout never jumps. The thumbnail arrives inline as a `data:` URL (the Drive files are
 * private; see DiaryMediaFile) and only replaces the placeholder once its `load` event fired; a
 * missing or failing thumbnail simply leaves the placeholder.
 */
@Component({
  selector: 'okr-diary-media-row',
  standalone: true,
  imports: [SvgIconPipe, IonIcon, IonSkeletonText],
  styles: [`
    .strip { display: flex; gap: 8px; overflow-x: auto; padding: 8px 16px; }
    .tile { position: relative; flex: 0 0 96px; width: 96px; height: 96px; border-radius: 6px; overflow: hidden;
      background: var(--ion-color-light); cursor: pointer; display: flex; flex-direction: column; align-items: center; justify-content: center; }
    .tile ion-skeleton-text { position: absolute; inset: 0; margin: 0; width: 100%; height: 100%; }
    .tile img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; opacity: 0; transition: opacity .2s; }
    .tile img.loaded { opacity: 1; }
    .tile ion-icon { font-size: 36px; }
    .name { font-size: 11px; max-width: 88px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; padding: 0 4px; }
  `],
  template: `
    <div class="strip">
      @if (files(); as list) {
        @for (file of list; track file.id; let i = $index) {
          <div class="tile" role="button" [attr.aria-label]="file.name" [title]="file.name" (click)="opened.emit(i)">
            @if (!isLoaded(file.id)) {
              @if (kind() === 'image') {
                <ion-skeleton-text [animated]="!!file.thumbnail && !hasFailed(file.id)" />
              } @else {
                <ion-icon src="{{ fileIcon(file) | svgIcon: 'filetypes' }}" />
                <span class="name">{{ file.name }}</span>
              }
            }
            @if (file.thumbnail && !hasFailed(file.id)) {
              <img [src]="file.thumbnail" [alt]="file.name" [class.loaded]="isLoaded(file.id)"
                (load)="markLoaded(file.id)" (error)="markFailed(file.id)" />
            }
          </div>
        }
      } @else {
        @for (n of loadingTiles; track n) {
          <div class="tile"><ion-skeleton-text [animated]="true" /></div>
        }
      }
    </div>
  `,
})
export class DiaryMediaRow {
  /** undefined while the folder listing is loading */
  public readonly files = input<DiaryMediaFile[] | undefined>();
  public readonly kind = input.required<'image' | 'document'>();
  /** index of the tapped tile in `files` */
  public readonly opened = output<number>();

  protected readonly loadingTiles = LOADING_TILES;
  private readonly loaded = signal<ReadonlySet<string>>(new Set());
  private readonly failed = signal<ReadonlySet<string>>(new Set());

  protected fileIcon(file: DiaryMediaFile): string {
    return diaryFileIconName(file.mimeType);
  }

  protected isLoaded(id: string): boolean {
    return this.loaded().has(id);
  }

  protected hasFailed(id: string): boolean {
    return this.failed().has(id);
  }

  protected markLoaded(id: string): void {
    this.loaded.update(set => new Set(set).add(id));
  }

  protected markFailed(id: string): void {
    this.failed.update(set => new Set(set).add(id));
  }
}
