import { Component, computed, input, model } from '@angular/core';
import { IonCard, IonCardContent, IonCardHeader, IonCardTitle, IonCol, IonGrid, IonRow } from '@ionic/angular';

import { Checkbox, CheckboxI18n, ErrorNote, NumberInput, NumberInputI18n, StringSelect, StringSelectI18n } from '@okr/shared-ui';
import { getFieldErrors, JOURNAL_MAP_LAYER_IDS, JOURNAL_MAP_ZOOM_MAX, JOURNAL_MAP_ZOOM_MIN, SectionErrors, SectionI18n } from '@okr/cms-section-util';
import { MapConfig } from '@okr/shared-models';
import { coerceBoolean } from '@okr/shared-util-core';

/**
 * The map card of the travel journal's section form (spec 1.154 phase 5): the zoom, the base layer and whether the
 * journal route is drawn. The map is centred on the footprint, so the centre inputs of the CMS map stay hidden.
 * The form cannot know which base layers a device offers, so it offers every id; the renderer falls back when one is
 * not available. «Standard» clears `layer` (absent = the journal's selected layer).
 */
@Component({
  selector: 'okr-journal-map-config',
  standalone: true,
  imports: [IonGrid, IonRow, IonCol, IonCard, IonCardHeader, IonCardTitle, IonCardContent, NumberInput, StringSelect, Checkbox, ErrorNote],
  styles: [`@media (width <= 600px) { ion-card { margin: 5px;} }`],
  template: `
    <ion-card>
      <ion-card-header>
        <ion-card-title>{{ i18n().journal_map_title() }}</ion-card-title>
      </ion-card-header>
      <ion-card-content>
        <ion-grid>
          <ion-row>
            <ion-col size="12" size-md="6">
              <okr-number-input [i18n]="zoomI18n()" [value]="zoom()" (valueChange)="onZoomChange($event)"
                [maxLength]="2" [integer]="true" [min]="zoomMin" [max]="zoomMax" [showHelper]="true" [readOnly]="isReadOnly()" />
              <okr-error-note [errors]="errorsFor('zoom')" />
            </ion-col>
            <ion-col size="12" size-md="6">
              <okr-string-select [i18n]="layerI18n()" [stringList]="layerIds" [labels]="layerLabels()"
                [selectedString]="layer()" (selectedStringChange)="onLayerChange($event)" [readOnly]="isReadOnly()" />
              <okr-error-note [errors]="errorsFor('layer')" />
            </ion-col>
            <ion-col size="12">
              <okr-checkbox [i18n]="showRouteI18n()" [checked]="showRoute()" (checkedChange)="onShowRouteChange($event)"
                [toggle]="true" [showHelper]="true" [readOnly]="isReadOnly()" />
            </ion-col>
          </ion-row>
        </ion-grid>
      </ion-card-content>
    </ion-card>
  `
})
export class JournalMapConfiguration {
  public readonly formData = model.required<MapConfig>();
  public readonly i18n = input.required<SectionI18n>();
  /** vest field name -> messages of the running section suite (see section.form.ts) */
  public readonly errors = input<SectionErrors>({});
  public readonly readOnly = input(true);

  protected readonly isReadOnly = computed(() => coerceBoolean(this.readOnly()));
  protected readonly zoomMin = JOURNAL_MAP_ZOOM_MIN;
  protected readonly zoomMax = JOURNAL_MAP_ZOOM_MAX;
  /** '' (= «Standard», `layer` absent) first, then every base layer id of the journal */
  protected readonly layerIds: string[] = ['', ...JOURNAL_MAP_LAYER_IDS];

  protected readonly zoom = computed(() => this.formData().zoom);
  protected readonly layer = computed(() => this.formData().layer ?? '');
  protected readonly showRoute = computed(() => this.formData().showRoute ?? false);

  protected readonly zoomI18n = computed<NumberInputI18n>(() => ({
    name: 'zoom', label: this.i18n().map_zoom_label(), placeholder: this.i18n().map_zoom_placeholder(), helper: this.i18n().journal_map_zoom_helper(),
  }));
  protected readonly layerI18n = computed<StringSelectI18n>(() => ({
    name: 'layer', label: this.i18n().journal_map_layer_label(), helper: this.i18n().journal_map_layer_helper(),
  }));
  protected readonly layerLabels = computed(() => {
    const t = this.i18n();
    return [
      t.journal_map_layer_default(), t.journal_map_layer_google_roadmap(), t.journal_map_layer_google_satellite(),
      t.journal_map_layer_swisstopo_live(), t.journal_map_layer_offline_osm(), t.journal_map_layer_offline_satellite(),
      t.journal_map_layer_offline_swisstopo(), t.journal_map_layer_world(),
    ];
  });
  protected readonly showRouteI18n = computed<CheckboxI18n>(() => ({
    name: 'showRoute', label: this.i18n().journal_map_show_route_label(), helper: this.i18n().journal_map_show_route_helper(),
  }));

  /************************************** actions *********************************************** */
  // each handler writes only on a real change, so opening the form never makes it dirty
  protected onZoomChange(zoom: number): void {
    const value = Number(zoom);
    if (Object.is(value, this.formData().zoom)) return;
    this.formData.update((vm) => ({ ...vm, zoom: value }));
  }

  protected onLayerChange(layer: string): void {
    if (layer === this.layer()) return;
    // «Standard» clears the layer (undefined, never '')
    this.formData.update((vm) => ({ ...vm, layer: layer === '' ? undefined : layer }));
  }

  protected onShowRouteChange(showRoute: boolean): void {
    if (showRoute === this.showRoute()) return;
    this.formData.update((vm) => ({ ...vm, showRoute }));
  }

  /** messages of a single field, for the inline <okr-error-note> */
  protected errorsFor(field: string): string[] {
    return getFieldErrors(this.errors(), field);
  }
}
