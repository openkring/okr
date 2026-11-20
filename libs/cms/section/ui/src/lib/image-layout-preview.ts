import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

import { ImageLayoutId, imageLayoutTiles } from '@okr/cms-section-util';

interface PreviewRect { x: number; y: number; width: number; height: number; mountain: string }

/** One grid cell is CELL units; the SVG viewBox is columns × rows cells. */
const CELL = 10;
/** Space left around each tile so neighbours do not touch. */
const GAP = 1.2;
/** Tiles with a shorter side below this (in units) get no silhouette. */
const MIN_FOR_MOUNTAIN = 18;

/** Mountain silhouette centred in a tile, sized to its shorter side. */
function mountainPath(x: number, y: number, width: number, height: number): string {
  if (Math.min(width, height) < MIN_FOR_MOUNTAIN) return '';
  const s = Math.min(width, height) * 0.28;
  const cx = x + width / 2;
  const cy = y + height / 2;
  return `M${cx - s * 1.4} ${cy + s * 0.8} L${cx - s * 0.4} ${cy - s * 0.6} L${cx + s * 0.2} ${cy + s * 0.2} `
    + `L${cx + s * 0.7} ${cy - s * 0.2} L${cx + s * 1.4} ${cy + s * 0.8} Z`;
}

/**
 * Schematic picture of an article image layout: grey tiles with a small mountain on white, drawn
 * from the same tile table the renderer uses (`imageLayoutTiles`), so it cannot disagree with what
 * renders. Inline SVG, so it works offline. `slider` draws one large tile with dots and arrows.
 */
@Component({
  selector: 'okr-image-layout-preview',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [`
    :host { display: block; }
    svg { display: block; width: 100%; height: auto; background: #fff; border-radius: 4px; }
    .tile { fill: #d4d7dc; }
    .mountain { fill: #9aa0a8; }
    .ui { fill: #6b7078; }
    .ui-line { stroke: #6b7078; stroke-width: 1.6; stroke-linecap: round; stroke-linejoin: round; fill: none; }
  `],
  template: `
    <svg [attr.viewBox]="'0 0 ' + width() + ' ' + height()" role="img" [attr.aria-label]="label()" focusable="false">
      @if (layout() === 'slider') {
        <rect class="tile" x="4" y="4" width="112" height="62" rx="4" />
        <path class="mountain" d="M42 50 L56 24 L66 42 L74 34 L88 50 Z" />
        <circle class="ui" cx="54" cy="73" r="1.8" />
        <circle class="ui" cx="60" cy="73" r="1.8" opacity="0.4" />
        <circle class="ui" cx="66" cy="73" r="1.8" opacity="0.4" />
        <path class="ui-line" d="M13 30 L9 35 L13 40" />
        <path class="ui-line" d="M107 30 L111 35 L107 40" />
      } @else {
        @for (r of rects(); track $index) {
          <rect class="tile" [attr.x]="r.x" [attr.y]="r.y" [attr.width]="r.width" [attr.height]="r.height" rx="2" />
          @if (r.mountain) { <path class="mountain" [attr.d]="r.mountain" /> }
          @if (captioned()) { <rect class="ui" [attr.x]="r.x + r.width * 0.2" [attr.y]="r.y + r.height + 3" [attr.width]="r.width * 0.6" height="2.5" rx="1.2" /> }
        }
      }
    </svg>
  `,
})
export class ImageLayoutPreview {
  // inputs
  public readonly layout = input.required<ImageLayoutId>();
  public readonly count = input.required<number>();
  /** accessible name of the picture, e.g. the layout's label */
  public readonly label = input('');

  // derived
  private readonly grid = computed(() => imageLayoutTiles(this.layout(), this.count()));
  protected readonly rects = computed<PreviewRect[]>(() =>
    this.grid().tiles.map(t => {
      const x = (t.column - 1) * CELL + GAP;
      const y = (t.row - 1) * CELL + GAP;
      const width = t.colSpan * CELL - 2 * GAP;
      const height = t.rowSpan * CELL - 2 * GAP;
      return { x, y, width, height, mountain: mountainPath(x, y, width, height) };
    }));
  /** side-by-side: a caption line under every image */
  protected readonly captioned = computed(() => this.layout() === 'side-by-side');
  protected readonly width = computed(() => this.layout() === 'slider' ? 120 : this.grid().columns * CELL);
  protected readonly height = computed(() => {
    if (this.layout() === 'slider') return 80;
    const rows = this.grid().tiles.reduce((max, t) => Math.max(max, t.row - 1 + t.rowSpan), 0);
    return (Math.max(rows, 1) + (this.captioned() ? 1 : 0)) * CELL;
  });
}
