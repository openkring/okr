import { Component, computed, inject, input } from '@angular/core';
import { ActionSheetController, AlertController, IonButton, ToastController } from '@ionic/angular';

import { MapView } from '@okr/shared-ui';
import { okrPrompt } from '@okr/shared-util-angular';
import { fill } from '@okr/shared-util-core';
import {
  ANTARCTICA_PRESET, SUBANTARCTIC_PRESET, areaTilePlan, Bbox, DetailLevel, detailLevels, estimateBytes, journalTilePlan, MapArea, sourceFor,
} from '@okr/travel-journal-util';

import { JournalStore } from './journal.store';

const MB = 1024 * 1024;

/**
 * The journal's offline map (spec 1.113 §9.4, plans 6 and 6b): which areas it covers, how big it is, the
 * download state — and the «Gebiete» sheet to remove an area, add the map's current view or add the
 * Antarctica expedition preset.
 */
@Component({
  selector: 'okr-journal-offline-map',
  imports: [IonButton],
  styles: [`
    :host { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin: 4px 0 8px;
      font-size: 0.8rem; color: var(--ion-color-medium); }
    .buttons { display: flex; flex: none; }
  `],
  template: `
    <span>{{ text() }}</span>
    <div class="buttons">
      @switch (status().state) {
        @case ('loading') {
          <ion-button size="small" fill="clear" (click)="store.cancelOfflineMap()">{{ i18n.map_cancel() }}</ion-button>
        }
        @default {
          @if (areas().length > 0) {
            <ion-button size="small" fill="clear" (click)="store.downloadOfflineMap(journalKey())">{{ actionLabel() }}</ion-button>
          }
          <ion-button size="small" fill="clear" (click)="manageAreas()">{{ i18n.map_areas() }}</ion-button>
        }
      }
    </div>
  `,
})
export class JournalOfflineMap {
  protected readonly store = inject(JournalStore);
  private readonly actionSheetController = inject(ActionSheetController);
  private readonly alertController = inject(AlertController);
  private readonly toastController = inject(ToastController);

  public readonly journalKey = input.required<string>();
  /** What the overview map shows right now — the candidate for «Kartenausschnitt hinzufügen». */
  public readonly view = input<MapView | undefined>(undefined);

  protected readonly i18n = this.store.i18n;
  protected readonly areas = computed(() => this.store.mapAreas(this.journalKey()));
  protected readonly status = computed(() => this.store.offlineMap(this.journalKey()));
  private readonly positions = computed(() => this.store.footprints(this.journalKey())
    .filter((f) => f.latitude !== undefined && f.longitude !== undefined)
    .map((f) => ({ lat: f.latitude as number, lng: f.longitude as number })));
  private readonly megabytes = computed(() => Math.max(1, Math.round(estimateBytes(journalTilePlan(this.areas(), this.positions())) / MB)));
  /** Areas added after the last download are not offline yet. */
  private readonly stale = computed(() => {
    const loaded = new Set(this.status().areaIds);
    return this.areas().some((a) => !loaded.has(a.id));
  });

  protected readonly actionLabel = computed(() => {
    const state = this.status().state;
    if (state === 'partial') return this.i18n.map_resume();
    return state === 'ready' && !this.stale() ? this.i18n.map_update() : this.i18n.map_load();
  });

  protected readonly text = computed(() => {
    const status = this.status();
    if (this.areas().length === 0) return this.i18n.map_none();
    switch (status.state) {
      case 'loading':
        return fill(this.i18n.map_progress(), { done: status.done, total: status.total });
      case 'partial':
        return fill(this.i18n.map_partial(), { failed: status.failed });
      case 'ready':
        return this.stale()
          ? this.i18n.map_stale()
          : fill(this.i18n.map_ready(), { date: status.at.slice(0, 10).split('-').reverse().join('.') });
      default:
        return fill(this.i18n.map_summary(), { count: this.areas().length, mb: this.megabytes() });
    }
  });

  protected async manageAreas(): Promise<void> {
    const journalKey = this.journalKey();
    const areas = this.areas();
    const sheet = await this.actionSheetController.create({
      header: this.i18n.map_areas_title(),
      buttons: [
        ...areas.map((area) => ({ text: this.areaLabel(area), handler: () => void this.confirmRemove(journalKey, area) })),
        { text: this.i18n.map_add_view(), handler: () => void this.addView(journalKey) },
        ...(areas.some((a) => a.preset === 'antarctica-expedition') ? [] : [{
          text: this.i18n.map_add_antarctica(),
          handler: () => void this.store.addMapArea(journalKey, { ...ANTARCTICA_PRESET, name: this.i18n.map_preset_antarctica() }),
        }]),
        ...(areas.some((a) => a.preset === 'subantarctic-islands') ? [] : [{
          text: this.i18n.map_add_subantarctic(),
          handler: () => void this.store.addMapArea(journalKey, { ...SUBANTARCTIC_PRESET, name: this.i18n.map_preset_subantarctic() }),
        }]),
        ...(this.status().state === 'ready' || this.status().state === 'partial'
          ? [{ text: this.i18n.map_free(), role: 'destructive', handler: () => void this.confirmFree(journalKey) }] : []),
        { text: this.i18n.cancel(), role: 'cancel' },
      ],
    });
    await sheet.present();
  }

  private async confirmFree(journalKey: string): Promise<void> {
    const sheet = await this.actionSheetController.create({
      header: this.i18n.map_free_confirm(),
      buttons: [
        { text: this.i18n.map_free(), role: 'destructive', handler: () => void this.store.freeOfflineMap(journalKey) },
        { text: this.i18n.cancel(), role: 'cancel' },
      ],
    });
    await sheet.present();
  }

  private areaLabel(area: MapArea): string {
    switch (area.preset) {
      case 'antarctica-expedition': return this.i18n.map_preset_antarctica();
      case 'subantarctic-islands': return this.i18n.map_preset_subantarctic();
      default: return area.name;
    }
  }

  private async confirmRemove(journalKey: string, area: MapArea): Promise<void> {
    const sheet = await this.actionSheetController.create({
      header: fill(this.i18n.map_remove_confirm(), { name: this.areaLabel(area) }),
      buttons: [
        { text: this.i18n.map_remove(), role: 'destructive', handler: () => void this.store.removeMapArea(journalKey, area.id) },
        { text: this.i18n.cancel(), role: 'cancel' },
      ],
    });
    await sheet.present();
  }

  /** The map's current view as a new area: detail level with its size, then a name. */
  private async addView(journalKey: string): Promise<void> {
    const view = this.view();
    if (!view) return;
    const bbox: Bbox = view.bounds;
    const source = sourceFor(bbox);
    const levels = detailLevels(source, bbox);
    if (levels.length === 0) {
      const toast = await this.toastController.create({ message: this.i18n.map_too_large(), duration: 3000, position: 'bottom' });
      await toast.present();
      return;
    }
    const labels: Record<DetailLevel, () => string> = {
      overview: this.i18n.map_level_overview, detail: this.i18n.map_level_detail, hiking: this.i18n.map_level_hiking,
    };
    const sheet = await this.actionSheetController.create({
      header: this.i18n.map_level_title(),
      buttons: [
        ...levels.map((level) => {
          const draft: MapArea = {
            id: crypto.randomUUID(), name: '', source, bbox, maxZoom: level.maxZoom,
            layers: [{ kind: source === 'antarctica' ? 'satellite' : source, maxZoom: level.maxZoom }],
          };
          const mb = Math.max(1, Math.round(estimateBytes(areaTilePlan(draft, [])) / MB));
          return { text: fill(labels[level.key](), { mb }), handler: () => void this.nameAndAdd(journalKey, draft) };
        }),
        { text: this.i18n.cancel(), role: 'cancel' },
      ],
    });
    await sheet.present();
  }

  private async nameAndAdd(journalKey: string, draft: MapArea): Promise<void> {
    const name = await okrPrompt(this.alertController, this.i18n.map_name_prompt(), this.i18n.map_name_prompt(), this.i18n.save(), this.i18n.cancel());
    if (!name?.trim()) return;
    await this.store.addMapArea(journalKey, { ...draft, name: name.trim() });
  }
}
