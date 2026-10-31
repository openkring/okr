import { Component, computed, inject, input, OnInit } from '@angular/core';
import {
  ActionSheetController, AlertController, IonButton, IonContent, IonItem, IonLabel, IonList, IonListHeader, IonProgressBar, ModalController, ToastController,
} from '@ionic/angular';

import { Header, HeaderI18n, MapView } from '@okr/shared-ui';
import { okrPrompt } from '@okr/shared-util-angular';
import { fill } from '@okr/shared-util-core';
import { JournalWorldMap, WorldMapArea } from '@okr/travel-journal-ui';
import {
  ANTARCTICA_PRESET, AreaLayer, Bbox, DetailLevel, estimateBytes, isUsable, journalTilePlan, layerDetailLevels, layerKindsFor, MapArea, MapLayerKind,
  OfflineLayerStatus, sourceFor, SUBANTARCTIC_PRESET,
} from '@okr/travel-journal-util';

import { JournalStore } from './journal.store';

const MB = 1024 * 1024;
const GB = 1024 * MB;

/** A layer of an area downloaded (or downloading) on this iPad. */
interface DeviceRow {
  key: string; area: MapArea; kind: MapLayerKind; title: string; status: OfflineLayerStatus;
  detail: string; incomplete: string; progress: string;
}
/** A layer of an area not downloaded here, with its estimate (world background included, as the run counts it). */
interface AvailableLayer { key: string; kind: MapLayerKind; text: string }
interface AvailableArea { area: MapArea; name: string; layers: AvailableLayer[]; canAddLayer: boolean }

/**
 * «Offline-Karten verwalten» (spec 1.126 phase 4 §7.3, native only): a schematic world map of the journal's areas, the
 * layers downloaded on this iPad («Aktualisieren» / «Fortsetzen», «Entfernen» = this iPad only) and the ones available
 * to download («Laden», «Ebene hinzufügen», «Gebiet löschen» = synced, both iPads; the two presets and the overview's
 * current view as new areas). One download at a time: while one runs, its progress and «Pause» are shown and the
 * actions of every other row wait. Everything here reads local state; it works offline (a download itself needs a
 * connection).
 */
@Component({
  selector: 'okr-journal-offline-maps-modal',
  imports: [Header, IonButton, IonContent, IonItem, IonLabel, IonList, IonListHeader, IonProgressBar, JournalWorldMap],
  styles: [`
    .progress { margin: 0 0 12px; font-size: 0.85rem; }
    .progress-row { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
    .incomplete { color: var(--ion-color-warning-shade); }
    .layer { --padding-start: 32px; }
    okr-journal-world-map { margin-bottom: 8px; }
  `],
  template: `
    <okr-header [i18n]="headerI18n()" [isModal]="true" />
    <ion-content class="ion-padding">
      @if (running(); as run) {
        <div class="progress">
          <div class="progress-row">
            <span>{{ run.label }}</span>
            <ion-button size="small" fill="clear" (click)="store.pauseDownload()">{{ i18n.offline_pause() }}</ion-button>
          </div>
          <ion-progress-bar [value]="run.value" />
        </div>
      }

      <okr-journal-world-map [areas]="worldAreas()" [places]="places()" [label]="i18n.offline_maps_title()" />

      <ion-list>
        <ion-list-header><ion-label>{{ i18n.offline_on_device() }}</ion-label></ion-list-header>
        @for (row of onDevice(); track row.key) {
          <ion-item lines="full">
            <ion-label class="ion-text-wrap">
              <h3>{{ row.title }}</h3>
              @if (row.status.state === 'loading') {
                <p>{{ row.progress }}</p>
              } @else {
                <p>{{ row.detail }}</p>
                @if (row.incomplete) { <p class="incomplete">{{ row.incomplete }}</p> }
              }
            </ion-label>
            @if (row.status.state === 'loading') {
              <ion-button slot="end" size="small" fill="clear" (click)="store.pauseDownload()">{{ i18n.offline_pause() }}</ion-button>
            } @else {
              <ion-button slot="end" size="small" fill="clear" [disabled]="busy()" (click)="download(row.area.id, row.kind)">
                {{ row.status.state === 'partial' ? i18n.offline_resume() : i18n.offline_update() }}
              </ion-button>
              <ion-button slot="end" size="small" fill="clear" color="danger" [disabled]="busy()" (click)="confirmRemove(row)">{{ i18n.offline_remove() }}</ion-button>
            }
          </ion-item>
        } @empty {
          <ion-item lines="none"><ion-label color="medium" class="ion-text-wrap">{{ i18n.offline_none_on_device() }}</ion-label></ion-item>
        }
      </ion-list>

      <ion-list>
        <ion-list-header><ion-label>{{ i18n.offline_available() }}</ion-label></ion-list-header>
        @for (entry of available(); track entry.area.id) {
          <ion-item lines="none">
            <ion-label class="ion-text-wrap"><h3>{{ entry.name }}</h3></ion-label>
            @if (entry.canAddLayer) {
              <ion-button slot="end" size="small" fill="clear" (click)="addLayer(entry.area)">{{ i18n.offline_add_layer() }}</ion-button>
            }
            <ion-button slot="end" size="small" fill="clear" color="danger" [disabled]="busy()" (click)="confirmDeleteArea(entry.area, entry.name)">
              {{ i18n.offline_delete_area() }}
            </ion-button>
          </ion-item>
          @for (layer of entry.layers; track layer.key) {
            <ion-item class="layer" lines="none">
              <ion-label class="ion-text-wrap"><p>{{ layer.text }}</p></ion-label>
              <ion-button slot="end" size="small" fill="clear" [disabled]="busy()" (click)="download(entry.area.id, layer.kind)">{{ i18n.map_load() }}</ion-button>
            </ion-item>
          }
        }
        @if (!hasAntarctica()) {
          <ion-item button [detail]="false" lines="full" (click)="addPreset(antarctica)">{{ i18n.map_add_antarctica() }}</ion-item>
        }
        @if (!hasSubantarctic()) {
          <ion-item button [detail]="false" lines="full" (click)="addPreset(subantarctic)">{{ i18n.map_add_subantarctic() }}</ion-item>
        }
        <ion-item button [detail]="false" lines="full" [disabled]="!view()" (click)="addView()">{{ i18n.map_add_view() }}</ion-item>
      </ion-list>
    </ion-content>
  `,
})
export class JournalOfflineMapsModal implements OnInit {
  protected readonly store = inject(JournalStore);
  private readonly actionSheetController = inject(ActionSheetController);
  private readonly alertController = inject(AlertController);
  private readonly toastController = inject(ToastController);

  public readonly journalKey = input.required<string>();
  /** The overview map's view when the modal opened — the candidate for «Kartenausschnitt hinzufügen». */
  public readonly view = input<MapView | undefined>(undefined);

  protected readonly i18n = this.store.i18n;
  protected readonly antarctica = ANTARCTICA_PRESET;
  protected readonly subantarctic = SUBANTARCTIC_PRESET;
  protected readonly headerI18n = computed<HeaderI18n>(() => ({ title: this.i18n.offline_maps_title() }));

  protected readonly areas = computed(() => this.store.mapAreas(this.journalKey()));
  protected readonly places = computed(() => this.store.mapPlacesFor(this.journalKey()));
  protected readonly hasAntarctica = computed(() => this.areas().some((a) => a.preset === 'antarctica-expedition'));
  protected readonly hasSubantarctic = computed(() => this.areas().some((a) => a.preset === 'subantarctic-islands'));

  private readonly positions = computed(() => this.store.footprints(this.journalKey())
    .filter((f) => f.latitude !== undefined && f.longitude !== undefined)
    .map((f) => ({ lat: f.latitude as number, lng: f.longitude as number })));

  /** The running download of ANY journal (the store runs one at a time): its key and status. */
  private readonly runningEntry = computed(() => Object.entries(this.store.offlineLayers()).find(([, s]) => s.state === 'loading'));
  /** While a download runs, «Laden», «Aktualisieren», «Entfernen» and «Gebiet löschen» wait (the store would ignore them). */
  protected readonly busy = computed(() => this.runningEntry() !== undefined);

  protected readonly running = computed(() => {
    const entry = this.runningEntry();
    if (!entry) return undefined;
    const [key, status] = entry;
    const progress = fill(this.i18n.map_progress(), { done: status.done, total: status.total });
    const row = this.onDevice().find((r) => r.key === key); // undefined when another journal's layer is downloading
    return {
      label: row ? `${row.title} · ${progress}` : progress,
      value: status.total > 0 ? (status.done + status.failed) / status.total : 0,
    };
  });

  /** Tiles and MB of each area layer, from the plan a run downloads (world background GIBS z0–4 included). */
  private readonly estimates = computed(() => {
    const positions = this.positions();
    const out = new Map<string, { tiles: number; mb: number }>();
    for (const area of this.areas()) {
      for (const layer of area.layers) out.set(this.key(area.id, layer.kind), this.estimate(area, layer, positions));
    }
    return out;
  });

  protected readonly worldAreas = computed<WorldMapArea[]>(() => this.areas().map((area) => ({
    id: area.id, bbox: area.bbox, filled: area.layers.some((l) => isUsable(this.store.offlineLayer(this.journalKey(), area.id, l.kind))),
  })));

  protected readonly onDevice = computed<DeviceRow[]>(() => {
    const journalKey = this.journalKey();
    return this.areas().flatMap((area) => area.layers.flatMap((layer) => {
      const status = this.store.offlineLayer(journalKey, area.id, layer.kind);
      if (status.state === 'none') return [];
      return [{
        key: this.key(area.id, layer.kind), area, kind: layer.kind, status,
        title: `${this.areaLabel(area)} · ${this.layerLabel(layer.kind)}`,
        detail: fill(this.i18n.offline_layer_status(), { tiles: this.number(status.tiles), size: this.size(status.bytes), date: this.date(status.at) }),
        incomplete: status.state === 'partial' && status.failed > 0 ? fill(this.i18n.offline_incomplete(), { failed: this.number(status.failed) }) : '',
        progress: fill(this.i18n.map_progress(), { done: status.done, total: status.total }),
      }];
    }));
  });

  protected readonly available = computed<AvailableArea[]>(() => {
    const journalKey = this.journalKey();
    const estimates = this.estimates();
    return this.areas().map((area) => ({
      area,
      name: this.areaLabel(area),
      canAddLayer: this.addableKinds(area).length > 0,
      layers: area.layers
        .filter((layer) => this.store.offlineLayer(journalKey, area.id, layer.kind).state === 'none')
        .map((layer) => {
          const key = this.key(area.id, layer.kind);
          const estimate = estimates.get(key) ?? { tiles: 0, mb: 0 };
          return { key, kind: layer.kind, text: `${this.layerLabel(layer.kind)} · ${this.estimateText(area, layer, estimate)}` };
        }),
    }));
  });

  public ngOnInit(): void {
    void this.store.refreshTileStats(this.journalKey()); // sizes on disk (native tileStats; never throws)
  }

  protected download(areaId: string, kind: MapLayerKind): void {
    if (this.busy()) return;
    void this.store.downloadAreaLayer(this.journalKey(), areaId, kind);
  }

  protected async confirmRemove(row: DeviceRow): Promise<void> {
    if (!(await this.confirm(this.i18n.offline_remove_confirm(), this.i18n.offline_remove()))) return;
    await this.store.freeAreaLayer(this.journalKey(), row.area.id, row.kind);
  }

  protected async confirmDeleteArea(area: MapArea, name: string): Promise<void> {
    if (!(await this.confirm(`${name}: ${this.i18n.offline_delete_area_confirm()}`, this.i18n.offline_delete_area()))) return;
    await this.store.deleteArea(this.journalKey(), area.id);
  }

  protected async addPreset(preset: MapArea): Promise<void> {
    const name = preset.preset === 'antarctica-expedition' ? this.i18n.map_preset_antarctica() : this.i18n.map_preset_subantarctic();
    await this.store.addMapArea(this.journalKey(), { ...preset, name });
  }

  /** «Ebene hinzufügen»: a layer kind the area does not have yet, then its detail level; edits the synced area. */
  protected async addLayer(area: MapArea): Promise<void> {
    const kind = await this.pickKind(this.addableKinds(area));
    if (!kind) return;
    const maxZoom = await this.pickLevel(area, kind);
    if (maxZoom === undefined) return;
    try {
      await this.store.addAreaLayer(this.journalKey(), area.id, { kind, maxZoom });
    } catch (error) {
      console.error('journal: adding a map layer failed', error);
    }
  }

  /** «Kartenausschnitt hinzufügen»: the overview map's view as a new area — layer, detail level, then a name. */
  protected async addView(): Promise<void> {
    const view = this.view();
    if (!view) return;
    const bbox: Bbox = view.bounds;
    const kinds = layerKindsFor(bbox).filter((kind) => layerDetailLevels(kind, bbox).length > 0);
    if (kinds.length === 0) {
      const toast = await this.toastController.create({ message: this.i18n.map_too_large(), duration: 3000, position: 'bottom' });
      await toast.present();
      return;
    }
    const draft: MapArea = { id: crypto.randomUUID(), name: '', source: sourceFor(bbox), bbox, maxZoom: 0, layers: [] };
    const kind = await this.pickKind(kinds);
    if (!kind) return;
    const maxZoom = await this.pickLevel(draft, kind);
    if (maxZoom === undefined) return;
    const name = await okrPrompt(this.alertController, this.i18n.map_name_prompt(), this.i18n.map_name_prompt(), this.i18n.save(), this.i18n.cancel());
    if (!name?.trim()) return;
    try {
      await this.store.addMapArea(this.journalKey(), { ...draft, name: name.trim(), maxZoom, layers: [{ kind, maxZoom }] });
    } catch (error) {
      console.error('journal: adding a map area failed', error);
    }
  }

  /** Layer kinds offered for the area's region that it does not have yet (presets keep their fixed plan). */
  private addableKinds(area: MapArea): MapLayerKind[] {
    if (area.preset !== undefined) return [];
    return layerKindsFor(area.bbox).filter((kind) => !area.layers.some((l) => l.kind === kind) && layerDetailLevels(kind, area.bbox).length > 0);
  }

  /** The layer choice; a single kind is taken without asking. */
  private async pickKind(kinds: MapLayerKind[]): Promise<MapLayerKind | undefined> {
    if (kinds.length <= 1) return kinds[0];
    return this.pick<MapLayerKind>(this.i18n.offline_layer_choice(), kinds.map((kind) => ({ text: this.layerLabel(kind), value: kind })));
  }

  /** The detail choice of a layer, each level with its tiles and MB (world background included). */
  private async pickLevel(area: MapArea, kind: MapLayerKind): Promise<number | undefined> {
    const positions = this.positions();
    const options = layerDetailLevels(kind, area.bbox).map((level) => {
      const estimate = this.estimate(area, { kind, maxZoom: level.maxZoom }, positions);
      return { text: fill(this.levelLabel(level.key), { tiles: this.number(estimate.tiles), mb: estimate.mb }), value: level.maxZoom };
    });
    return this.pick<number>(this.i18n.map_level_title(), options);
  }

  private async pick<T>(header: string, options: { text: string; value: T }[]): Promise<T | undefined> {
    const sheet = await this.actionSheetController.create({
      header,
      buttons: [...options.map((o) => ({ text: o.text, data: { value: o.value } })), { text: this.i18n.cancel(), role: 'cancel' }],
    });
    await sheet.present();
    const { data, role } = await sheet.onDidDismiss<{ value: T }>();
    return role === 'cancel' || role === 'backdrop' ? undefined : data?.value;
  }

  private async confirm(header: string, action: string): Promise<boolean> {
    const sheet = await this.actionSheetController.create({
      header,
      buttons: [{ text: action, role: 'destructive' }, { text: this.i18n.cancel(), role: 'cancel' }],
    });
    await sheet.present();
    return (await sheet.onDidDismiss()).role === 'destructive';
  }

  /** The tiles a run of this one layer downloads: the layer's plan plus the world background, each path once. */
  private estimate(area: MapArea, layer: AreaLayer, positions: { lat: number; lng: number }[]): { tiles: number; mb: number } {
    const jobs = journalTilePlan([{ ...area, layers: [layer] }], positions);
    return { tiles: jobs.length, mb: Math.max(1, Math.round(estimateBytes(jobs) / MB)) };
  }

  /** «Detail · 1 234 Kacheln · etwa 56 MB» for an area's own level; presets (fixed plans) show tiles and MB only. */
  private estimateText(area: MapArea, layer: AreaLayer, estimate: { tiles: number; mb: number }): string {
    const params = { tiles: this.number(estimate.tiles), mb: estimate.mb };
    const level = area.preset === undefined ? layerDetailLevels(layer.kind, area.bbox).find((l) => l.maxZoom === layer.maxZoom) : undefined;
    return fill(level ? this.levelLabel(level.key) : this.i18n.offline_estimate(), params);
  }

  private key(areaId: string, kind: MapLayerKind): string {
    return `${this.journalKey()}:${areaId}:${kind}`; // the store's offlineLayers key
  }

  private areaLabel(area: MapArea): string {
    switch (area.preset) {
      case 'antarctica-expedition': return this.i18n.map_preset_antarctica();
      case 'subantarctic-islands': return this.i18n.map_preset_subantarctic();
      default: return area.name;
    }
  }

  private layerLabel(kind: MapLayerKind): string {
    switch (kind) {
      case 'osm': return this.i18n.layer_osm();
      case 'satellite': return this.i18n.layer_satellite();
      case 'swisstopo': return this.i18n.layer_swisstopo();
    }
  }

  private levelLabel(key: DetailLevel): string {
    switch (key) {
      case 'overview': return this.i18n.map_level_overview();
      case 'detail': return this.i18n.map_level_detail();
      case 'hiking': return this.i18n.map_level_hiking();
    }
  }

  private lang(): string {
    return this.store.i18nService.getActiveLang() || 'de';
  }

  private number(n: number): string {
    return n.toLocaleString(this.lang());
  }

  /** Size on disk in the language's units; «–» while unknown (an older plugin without tileStats). */
  private size(bytes: number): string {
    if (bytes <= 0) return '–';
    const unit = bytes >= GB ? 'gigabyte' : 'megabyte';
    const value = bytes / (bytes >= GB ? GB : MB);
    return new Intl.NumberFormat(this.lang(), { style: 'unit', unit, maximumFractionDigits: value < 10 ? 1 : 0 }).format(value);
  }

  private date(at: string): string {
    const d = at ? new Date(at) : undefined;
    return d && !Number.isNaN(d.getTime()) ? d.toLocaleDateString(this.lang()) : '–';
  }
}

export async function openOfflineMapsModal(modalController: ModalController, journalKey: string, view: MapView | undefined): Promise<void> {
  const modal = await modalController.create({ component: JournalOfflineMapsModal, componentProps: { journalKey, view } });
  await modal.present();
}
