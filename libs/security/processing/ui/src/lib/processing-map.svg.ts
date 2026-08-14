import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import {
  NODE_HEIGHT, NODE_WIDTH, layoutProcessingMap, PROCESSING_I18N_KEYS,
} from '@okr/security-processing-util';
import { I18nService } from '@okr/shared-i18n';
import { fill } from '@okr/shared-util-core';
import type { ProcessorEntry } from '@okr/shared-models';

/**
 * The processing map: this app in the centre, every processor the tenant actually
 * transfers to on a ring around it, each edge labelled with the data classes travelling
 * along it and each node filled by country group (CH / EEA / third country).
 *
 * Hand-rolled inline SVG — no charting dependency (repo rule: never install one without
 * asking). All geometry comes from `layoutProcessingMap`, which is pure and unit-tested;
 * this component only renders it.
 *
 * Colours come from the Ionic theme variables so the diagram reads in both light and dark,
 * and so it survives the HTML→PDF export unchanged.
 */
@Component({
  selector: 'okr-processing-map',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [`
    :host { display: block; width: 100%; }
    svg { width: 100%; height: auto; }
    .edge { stroke: var(--ion-color-medium, #92949c); stroke-width: 1; opacity: .55; }
    .edge.third { stroke: var(--ion-color-danger, #eb445a); opacity: .8; stroke-dasharray: 4 3; }
    .edge-label { font-size: 8px; fill: var(--ion-color-medium-shade, #808289); }
    .node { stroke-width: 1.5; rx: 6; }
    .node.ch { fill: var(--ion-color-success-tint, #42d77d); stroke: var(--ion-color-success-shade, #28ba62); }
    .node.eu { fill: var(--ion-color-warning-tint, #ffd534); stroke: var(--ion-color-warning-shade, #e0ac08); }
    .node.third { fill: var(--ion-color-danger-tint, #ed576b); stroke: var(--ion-color-danger-shade, #cf3c4f); }
    .node-label { font-size: 10px; font-weight: 600; fill: var(--ion-text-color, #000); }
    .node-country { font-size: 8px; fill: var(--ion-text-color, #000); opacity: .7; }
    .hub { fill: var(--ion-color-primary, #3880ff); stroke: var(--ion-color-primary-shade, #3171e0); stroke-width: 2; }
    .hub-label { font-size: 11px; font-weight: 700; fill: var(--ion-color-primary-contrast, #fff); }
    .empty { font-size: 11px; fill: var(--ion-color-medium, #92949c); }
  `],
  template: `
    <svg [attr.viewBox]="'0 0 ' + width() + ' ' + height()" role="img" [attr.aria-label]="ariaLabel()">
      @for (edge of layout().edges; track edge.key) {
        <line class="edge" [class.third]="edge.group === 'third'"
              [attr.x1]="edge.x1" [attr.y1]="edge.y1" [attr.x2]="edge.x2" [attr.y2]="edge.y2" />
        <text class="edge-label" text-anchor="middle"
              [attr.x]="(edge.x1 + edge.x2) / 2" [attr.y]="(edge.y1 + edge.y2) / 2 - 3">{{ edge.label }}</text>
      }

      <rect class="hub" [attr.x]="layout().centre.x - hubWidth / 2" [attr.y]="layout().centre.y - hubHeight / 2"
            [attr.width]="hubWidth" [attr.height]="hubHeight" rx="8" />
      <text class="hub-label" text-anchor="middle" dominant-baseline="middle"
            [attr.x]="layout().centre.x" [attr.y]="layout().centre.y">{{ appName() }}</text>

      @for (node of layout().nodes; track node.key) {
        <rect class="node" [class]="'node ' + node.group"
              [attr.x]="node.x" [attr.y]="node.y" [attr.width]="nodeWidth" [attr.height]="nodeHeight" />
        <text class="node-label" text-anchor="middle" [attr.x]="node.cx" [attr.y]="node.y + 18">{{ node.name }}</text>
        <text class="node-country" text-anchor="middle" [attr.x]="node.cx" [attr.y]="node.y + 32">{{ node.country }}</text>
      }

      @if (layout().nodes.length === 0) {
        <text class="empty" text-anchor="middle" [attr.x]="layout().centre.x" [attr.y]="height() - 16">
          Keine aktiven Empfänger
        </text>
      }
    </svg>
  `,
})
export class ProcessingMap {
  public readonly entries = input.required<readonly ProcessorEntry[]>();
  public readonly appName = input<string>('Diese App');
  public readonly width = input<number>(800);
  public readonly height = input<number>(600);

  protected readonly nodeWidth = NODE_WIDTH;
  protected readonly nodeHeight = NODE_HEIGHT;
  protected readonly hubWidth = 150;
  protected readonly hubHeight = 52;

  private readonly i18n = inject(I18nService).translateAll(PROCESSING_I18N_KEYS);

  protected readonly layout = computed(() =>
    layoutProcessingMap(this.entries(), this.width(), this.height()));

  /** A screen reader gets the list, not the picture. */
  protected readonly ariaLabel = computed(() => {
    const names = this.layout().nodes.map((n) => `${n.name} (${n.country})`);
    return names.length === 0
      ? this.i18n.map_aria_empty()
      : fill(this.i18n.map_aria_flow(), { names: names.join(', ') });
  });
}
