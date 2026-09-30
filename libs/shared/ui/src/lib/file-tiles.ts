import { Component, input, output } from '@angular/core';

/** One tile: `imageUrl` is a thumbnail of the file itself or, for non-images, a file-type logo. */
export interface FileTile { key: string; name: string; imageUrl: string; isLogo: boolean; }

/**
 * A wrapping row of clickable file tiles (thumbnail + name), as used for expense receipts and
 * vouchers. Presentational only: the parent decides what a click does.
 */
@Component({
  selector: 'okr-file-tiles',
  standalone: true,
  styles: [`
    .tiles { display: flex; flex-wrap: wrap; gap: 12px; padding: 8px 16px 16px; }
    .tile {
      width: 120px; cursor: pointer; border-radius: 6px; overflow: hidden;
      border: 1px solid var(--ion-color-step-150, #d7d8da); background: var(--ion-color-light);
    }
    .tile:focus-visible { outline: 2px solid var(--ion-color-primary); }
    .tile img { display: block; width: 120px; height: 120px; object-fit: cover; background: #fff; }
    .tile img.logo { object-fit: contain; padding: 24px; box-sizing: border-box; }
    .tile .name {
      display: block; padding: 4px 6px; font-size: 0.75rem; color: var(--ion-color-medium-shade);
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    }
  `],
  template: `
    <div class="tiles">
      @for (tile of tiles(); track tile.key) {
        <div class="tile" tabindex="0" role="button" [attr.aria-label]="tile.name" [title]="tile.name"
          (click)="tileSelected.emit(tile)" (keyup.enter)="tileSelected.emit(tile)">
          <img [src]="tile.imageUrl" [alt]="tile.name" [class.logo]="tile.isLogo" loading="lazy" />
          <span class="name">{{ tile.name }}</span>
        </div>
      }
    </div>
  `,
})
export class FileTiles {
  public readonly tiles = input.required<FileTile[]>();
  public readonly tileSelected = output<FileTile>();
}
