import { ChangeDetectionStrategy, Component, computed, ElementRef, input, output, signal, viewChild } from '@angular/core';
import { IonButton, IonIcon } from '@ionic/angular/standalone';

import { WhiteboardItem, WhiteboardItemKind } from '@okr/shared-models';
import { SvgIconPipe } from '@okr/shared-pipes';
import { clampToCanvas, DEFAULT_LABEL_HEIGHT, DEFAULT_LABEL_WIDTH, DEFAULT_STICKER_HEIGHT, DEFAULT_STICKER_WIDTH, WhiteboardI18n, WhiteboardTemplate, WhiteboardZone } from '@okr/instruments-whiteboard-util';

/** A single item's new position after a drag (spec: written on pointerup, last-write-wins). */
export interface WhiteboardItemMove {
  key: string;
  x: number;
  y: number;
}

/** A request to add a new item at a canvas position (the store builds the model). */
export interface WhiteboardItemAdd {
  kind: WhiteboardItemKind;
  x: number;
  y: number;
}

interface DragState { key: string; startClientX: number; startClientY: number; origX: number; origY: number; moved: boolean; }
interface PanState { startClientX: number; startClientY: number; origPanX: number; origPanY: number; }

const MIN_ZOOM = 0.2;
const MAX_ZOOM = 3;
const DRAG_THRESHOLD = 3; // px of pointer travel before a press counts as a drag (vs a tap)

/**
 * The free-canvas whiteboard renderer — a **dumb** component (spec's hand-rolled DOM + CSS-transform
 * approach, deliberately no canvas library). A `transform: translate(pan) scale(zoom)` on a viewport
 * wrapper holds absolutely-positioned sticker/label `div`s; native pointer events drive drag & pan.
 * This buys native text rendering, a11y, CSS theming and `@for` rendering from a signal store for free.
 *
 * It owns only view state (pan / zoom / in-flight drag). During a drag ONLY local state changes; on
 * `pointerup` it emits one `itemMoved` — the parent writes it and the live stream feeds it back
 * (spec: "während des Drags nur lokalen State, erst auf pointerup schreiben"). It never touches
 * Firestore or a store; it emits intents (`itemMoved` / `itemSelected` / `itemAdded`).
 */
@Component({
  selector: 'okr-whiteboard-canvas',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [SvgIconPipe, IonButton, IonIcon],
  styles: [`
    :host { display: block; width: 100%; height: 100%; }
    .surface {
      position: relative; width: 100%; height: 100%; overflow: hidden;
      background: var(--ion-color-step-50, #f7f7f7); touch-action: none; cursor: grab;
    }
    .surface.panning { cursor: grabbing; }
    .viewport { position: absolute; top: 0; left: 0; transform-origin: 0 0; }
    .bg { position: absolute; top: 0; left: 0; width: 100%; height: 100%; object-fit: contain; pointer-events: none; user-select: none; }
    .zone { position: absolute; box-sizing: border-box; border: 1px dashed var(--ion-color-step-300, #c4c4c4); }
    .zone-label { position: absolute; top: 6px; left: 8px; font-size: 13px; font-weight: 600; color: var(--ion-color-medium); text-transform: uppercase; letter-spacing: .04em; }
    .item {
      position: absolute; box-sizing: border-box; padding: 8px; overflow: hidden;
      font-size: 14px; line-height: 1.25; white-space: pre-wrap; word-break: break-word; cursor: pointer;
    }
    .item.sticker { border-radius: 4px; background: var(--sticker, #fff4b8); box-shadow: 0 2px 4px rgba(0,0,0,.18); }
    .item.label { background: transparent; color: var(--sticker, var(--ion-text-color)); font-weight: 600; }
    .item.selected { outline: 2px solid var(--ion-color-primary); outline-offset: 1px; }
    .item.dragging { opacity: .85; box-shadow: 0 6px 14px rgba(0,0,0,.28); }
    .item.read-only { cursor: default; }
    .placeholder { color: var(--ion-color-medium); font-style: italic; }
    .controls { position: absolute; right: 12px; bottom: 12px; display: flex; flex-direction: column; gap: 6px; }
    .controls ion-button { --padding-start: 6px; --padding-end: 6px; margin: 0; }
    .add-controls { position: absolute; left: 12px; bottom: 12px; display: flex; gap: 6px; }
    .empty-hint { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; color: var(--ion-color-medium); pointer-events: none; }
  `],
  template: `
    <div class="surface" [class.panning]="!!pan.dragging"
         #surface
         (pointerdown)="onSurfacePointerDown($event)"
         (pointermove)="onPointerMove($event)"
         (pointerup)="onPointerUp($event)"
         (pointercancel)="onPointerUp($event)"
         (wheel)="onWheel($event)">

      <div class="viewport" [style.transform]="transform()"
           [style.width.px]="template().width" [style.height.px]="template().height">

        @if (template().backgroundUrl) {
          <img class="bg" [src]="template().backgroundUrl" alt="" draggable="false" />
        }

        @for (zone of template().zones; track zone.id) {
          <div class="zone"
               [style.left.px]="zone.x" [style.top.px]="zone.y"
               [style.width.px]="zone.w" [style.height.px]="zone.h"
               [style.background]="zone.color ? 'color-mix(in srgb, ' + zone.color + ' 8%, transparent)' : 'transparent'">
            <span class="zone-label">{{ zoneLabel(zone) }}</span>
          </div>
        }

        @for (item of renderItems(); track item.key) {
          <div class="item"
               [class.sticker]="item.kind === 'sticker'"
               [class.label]="item.kind === 'label'"
               [class.selected]="item.key === selectedKey()"
               [class.dragging]="item.key === drag.dragging?.key"
               [class.read-only]="readOnly()"
               [style.left.px]="item.x" [style.top.px]="item.y"
               [style.width.px]="item.w" [style.height.px]="item.h"
               [style.--sticker]="item.color || defaultTint(item.kind)"
               (pointerdown)="onItemPointerDown($event, item)"
               (click)="onItemClick($event, item)">
            @if (item.text) { {{ item.text }} } @else { <span class="placeholder">…</span> }
          </div>
        }
      </div>

      @if (items().length === 0 && template().zones.length === 0) {
        <div class="empty-hint">{{ i18n().emptyCanvas() }}</div>
      }

      @if (!readOnly()) {
        <div class="add-controls">
          <ion-button size="small" fill="solid" (click)="addItem('sticker')" [title]="i18n().addSticker()">
            <ion-icon slot="icon-only" src="{{ 'add' | svgIcon }}" />
          </ion-button>
          <ion-button size="small" fill="outline" (click)="addItem('label')" [title]="i18n().addLabel()">
            <ion-icon slot="icon-only" src="{{ 'text' | svgIcon }}" />
          </ion-button>
        </div>
      }

      <div class="controls">
        <ion-button size="small" fill="solid" color="light" (click)="zoomByStep(1.2)" [title]="i18n().zoomIn()">
          <ion-icon slot="icon-only" src="{{ 'add' | svgIcon }}" />
        </ion-button>
        <ion-button size="small" fill="solid" color="light" (click)="zoomByStep(1/1.2)" [title]="i18n().zoomOut()">
          <ion-icon slot="icon-only" src="{{ 'remove' | svgIcon }}" />
        </ion-button>
        <ion-button size="small" fill="solid" color="light" (click)="resetView()" [title]="i18n().zoomReset()">
          <ion-icon slot="icon-only" src="{{ 'scan' | svgIcon }}" />
        </ion-button>
      </div>
    </div>
  `,
})
export class WhiteboardCanvas {
  public readonly items = input.required<WhiteboardItem[]>();
  public readonly template = input.required<WhiteboardTemplate>();
  public readonly i18n = input.required<WhiteboardI18n>();
  /** Resolved zone labels keyed by zone id (store-driven i18n); missing keys fall back to labelKey. */
  public readonly zoneLabels = input<Record<string, string>>({});
  public readonly readOnly = input(false);

  public readonly itemMoved = output<WhiteboardItemMove>();
  public readonly itemSelected = output<WhiteboardItem>();
  public readonly itemAdded = output<WhiteboardItemAdd>();

  private readonly surface = viewChild.required<ElementRef<HTMLElement>>('surface');

  protected readonly selectedKey = signal<string>('');

  // view state
  private readonly zoom = signal(1);
  private readonly panX = signal(0);
  private readonly panY = signal(0);
  protected readonly transform = computed(() => `translate(${this.panX()}px, ${this.panY()}px) scale(${this.zoom()})`);

  // in-flight drag / pan (plain fields; only dragPos drives re-render during a drag)
  protected drag: { dragging: DragState | null } = { dragging: null };
  protected pan: { dragging: PanState | null } = { dragging: null };
  private readonly dragPos = signal<{ key: string; x: number; y: number } | null>(null);

  /** Items with the in-flight drag position overlaid on the dragged item. */
  protected readonly renderItems = computed<WhiteboardItem[]>(() => {
    const pos = this.dragPos();
    if (!pos) return this.items();
    return this.items().map(item => item.key === pos.key ? { ...item, x: pos.x, y: pos.y } : item);
  });

  protected zoneLabel(zone: WhiteboardZone): string {
    return this.zoneLabels()[zone.id] ?? zone.labelKey;
  }

  protected defaultTint(kind: WhiteboardItemKind): string {
    return kind === 'sticker' ? '#fff4b8' : 'var(--ion-text-color)';
  }

  /*-------------------------- item drag --------------------------------*/

  protected onItemPointerDown(event: PointerEvent, item: WhiteboardItem): void {
    if (this.readOnly()) return;
    event.stopPropagation(); // don't also start a surface pan
    (event.target as HTMLElement).setPointerCapture?.(event.pointerId);
    this.drag.dragging = { key: item.key, startClientX: event.clientX, startClientY: event.clientY, origX: item.x, origY: item.y, moved: false };
  }

  protected onItemClick(event: MouseEvent, item: WhiteboardItem): void {
    // A click that concluded a real drag must not also open the editor.
    if (this.suppressNextClick) { this.suppressNextClick = false; return; }
    if (this.readOnly()) { this.selectedKey.set(item.key); return; }
    this.selectedKey.set(item.key);
    this.itemSelected.emit(item);
  }

  private suppressNextClick = false;

  /*-------------------------- surface pan --------------------------------*/

  protected onSurfacePointerDown(event: PointerEvent): void {
    this.pan.dragging = { startClientX: event.clientX, startClientY: event.clientY, origPanX: this.panX(), origPanY: this.panY() };
    (event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId);
  }

  protected onPointerMove(event: PointerEvent): void {
    const d = this.drag.dragging;
    if (d) {
      const dx = (event.clientX - d.startClientX) / this.zoom();
      const dy = (event.clientY - d.startClientY) / this.zoom();
      if (!d.moved && Math.hypot(event.clientX - d.startClientX, event.clientY - d.startClientY) > DRAG_THRESHOLD) d.moved = true;
      if (d.moved) this.dragPos.set({ key: d.key, x: d.origX + dx, y: d.origY + dy });
      return;
    }
    const p = this.pan.dragging;
    if (p) {
      this.panX.set(p.origPanX + (event.clientX - p.startClientX));
      this.panY.set(p.origPanY + (event.clientY - p.startClientY));
    }
  }

  protected onPointerUp(_event: PointerEvent): void {
    const d = this.drag.dragging;
    if (d) {
      const pos = this.dragPos();
      if (d.moved && pos) {
        const item = this.items().find(i => i.key === d.key);
        const clamped = item ? clampToCanvas(this.template(), { ...item, x: pos.x, y: pos.y }) : { x: pos.x, y: pos.y };
        this.itemMoved.emit({ key: d.key, x: clamped.x, y: clamped.y });
        this.suppressNextClick = true; // the trailing click is the end of a drag, not a tap
      }
      this.drag.dragging = null;
      this.dragPos.set(null);
    }
    this.pan.dragging = null;
  }

  /*-------------------------- zoom --------------------------------*/

  protected onWheel(event: WheelEvent): void {
    event.preventDefault();
    const rect = this.surface().nativeElement.getBoundingClientRect();
    this.zoomAround(event.deltaY < 0 ? 1.1 : 1 / 1.1, event.clientX - rect.left, event.clientY - rect.top);
  }

  protected zoomByStep(factor: number): void {
    const rect = this.surface().nativeElement.getBoundingClientRect();
    this.zoomAround(factor, rect.width / 2, rect.height / 2);
  }

  /** Zoom by `factor` keeping the surface point (sx, sy) visually fixed. */
  private zoomAround(factor: number, sx: number, sy: number): void {
    const oldZoom = this.zoom();
    const newZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, oldZoom * factor));
    if (newZoom === oldZoom) return;
    // keep the canvas point under (sx,sy) fixed: pan' = s - (s - pan) * (new/old)
    const ratio = newZoom / oldZoom;
    this.panX.set(sx - (sx - this.panX()) * ratio);
    this.panY.set(sy - (sy - this.panY()) * ratio);
    this.zoom.set(newZoom);
  }

  protected resetView(): void {
    this.zoom.set(1);
    this.panX.set(0);
    this.panY.set(0);
  }

  /*-------------------------- add --------------------------------*/

  protected addItem(kind: WhiteboardItemKind): void {
    const rect = this.surface().nativeElement.getBoundingClientRect();
    // canvas coords of the surface centre, offset so the new item is centred there
    const cx = (rect.width / 2 - this.panX()) / this.zoom();
    const cy = (rect.height / 2 - this.panY()) / this.zoom();
    const w = kind === 'label' ? DEFAULT_LABEL_WIDTH : DEFAULT_STICKER_WIDTH;
    const h = kind === 'label' ? DEFAULT_LABEL_HEIGHT : DEFAULT_STICKER_HEIGHT;
    const spot = clampToCanvas(this.template(), { x: cx - w / 2, y: cy - h / 2, w, h } as WhiteboardItem);
    this.itemAdded.emit({ kind, x: spot.x, y: spot.y });
  }
}
