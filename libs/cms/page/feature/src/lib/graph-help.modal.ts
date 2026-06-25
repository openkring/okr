import { Component, input } from '@angular/core';
import { IonCol, IonContent, IonGrid, IonItem, IonLabel, IonList, IonListHeader, IonRow } from '@ionic/angular/standalone';

import { Header } from '@bk2/shared-ui';
import { PageI18n } from '@bk2/cms-page-util';

/**
 * Help modal for the CMS sitemap (graph page).
 * Explains every menu/node type shown in the legend and how to work with the sitemap.
 * Receives the already-resolved page i18n signals via the [i18n] input (no own store).
 */
@Component({
  selector: 'bk-graph-help-modal',
  standalone: true,
  imports: [
    Header,
    IonContent, IonList, IonListHeader, IonItem, IonLabel, IonGrid, IonRow, IonCol
  ],
  styles: [`
    .intro { padding: 12px 16px; }
    .type-item { display: flex; align-items: flex-start; gap: 8px; }
    .legend-dot {
      width: 12px;
      height: 12px;
      border-radius: 50%;
      flex-shrink: 0;
      margin-top: 5px;
    }
    .dot-menu     { background: var(--ion-color-primary); }
    .dot-navigate { background: var(--ion-color-secondary); }
    .dot-browse   { background: var(--ion-color-tertiary); }
    .dot-page     { background: var(--ion-color-success); }
    .dot-section  { background: var(--ion-color-warning); }
    .dot-neutral  { background: var(--ion-color-medium); }
    .subtitle     { font-size: 1.2rem; font-weight: bold; }
  `],
  template: `
    <bk-header [i18n]="{ title: i18n().graph_help_title() }" [isModal]="true" />
    <ion-content>
      <p class="intro ion-text-wrap">{{ i18n().graph_help_intro() }}</p>
      <ion-grid>
        <ion-row>
          <ion-col size="12" class="ion-text-wrap">
            <ion-label class="subtitle">{{ i18n().graph_help_types_title() }}</ion-label>
          </ion-col>
        </ion-row>
        <ion-row>
          <ion-col size="3">
            <div class="type-item">
              <div class="legend-dot dot-menu"></div>
              <ion-label>{{ i18n().graph_help_type_main_label() }}</ion-label>
            </div>
          </ion-col>
          <ion-col size="9">
            <ion-label>{{ i18n().graph_help_type_main_content() }}</ion-label>
          </ion-col>
        </ion-row>
        <ion-row>
          <ion-col size="3">
            <div class="type-item">
              <div class="legend-dot dot-menu"></div>
              <ion-label>{{ i18n().graph_help_type_sub_label() }}</ion-label>
            </div>
          </ion-col>
          <ion-col size="9">
            <ion-label>{{ i18n().graph_help_type_sub_content() }}</ion-label>
          </ion-col>
        </ion-row>
        <ion-row>
          <ion-col size="3">
            <div class="type-item">
              <div class="legend-dot dot-navigate"></div>
              <ion-label>{{ i18n().graph_help_type_navigate_label() }}</ion-label>
            </div>
          </ion-col>
          <ion-col size="9">
            <ion-label>{{ i18n().graph_help_type_navigate_content() }}</ion-label>
          </ion-col>
        </ion-row>
        <ion-row>
          <ion-col size="3">
            <div class="type-item">
              <div class="legend-dot dot-browse"></div>
              <ion-label>{{ i18n().graph_help_type_browse_label() }}</ion-label>
            </div>
          </ion-col>
          <ion-col size="9">
            <ion-label>{{ i18n().graph_help_type_browse_content() }}</ion-label>
          </ion-col>
        </ion-row>
        <ion-row>
          <ion-col size="3">
            <div class="type-item">
              <div class="legend-dot dot-neutral"></div>
              <ion-label>{{ i18n().graph_help_type_context_label() }}</ion-label>
            </div>
          </ion-col>
          <ion-col size="9">
            <ion-label>{{ i18n().graph_help_type_context_content() }}</ion-label>
          </ion-col>
        </ion-row>
        <ion-row>
          <ion-col size="3">
            <div class="type-item">
              <div class="legend-dot dot-neutral"></div>
              <ion-label>{{ i18n().graph_help_type_call_label() }}</ion-label>
            </div>
          </ion-col>
          <ion-col size="9">
            <ion-label>{{ i18n().graph_help_type_call_content() }}</ion-label>
          </ion-col>
        </ion-row>
        <ion-row>
          <ion-col size="3">
            <div class="type-item">
              <div class="legend-dot dot-neutral"></div>
              <ion-label>{{ i18n().graph_help_type_divider_label() }}</ion-label>
            </div>
          </ion-col>
          <ion-col size="9">
            <ion-label>{{ i18n().graph_help_type_divider_content() }}</ion-label>
          </ion-col>
        </ion-row>
        <ion-row>
          <ion-col size="3">
            <div class="type-item">
              <div class="legend-dot dot-page"></div>
              <ion-label>{{ i18n().graph_help_type_page_label() }}</ion-label>
            </div>
          </ion-col>
          <ion-col size="9">
            <ion-label>{{ i18n().graph_help_type_page_content() }}</ion-label>
          </ion-col>
        </ion-row>
        <ion-row>
          <ion-col size="3">
            <div class="type-item">
              <div class="legend-dot dot-section"></div>
              <ion-label>{{ i18n().graph_help_type_section_label() }}</ion-label>
            </div>
          </ion-col>
          <ion-col size="9">
            <ion-label>{{ i18n().graph_help_type_section_content() }}</ion-label>
          </ion-col>
        </ion-row>
      </ion-grid>

      <ion-list lines="none">
        <ion-list-header><ion-label class="subtitle">{{ i18n().graph_help_usage_title() }}</ion-label></ion-list-header>
        <ion-item>
          <ion-label class="ion-text-wrap">{{ i18n().graph_help_usage_expand() }}</ion-label>
        </ion-item>
        <ion-item><ion-label class="ion-text-wrap">{{ i18n().graph_help_usage_label() }}</ion-label></ion-item>
        <ion-item><ion-label class="ion-text-wrap">{{ i18n().graph_help_usage_edit() }}</ion-label></ion-item>
        <ion-item><ion-label class="ion-text-wrap">{{ i18n().graph_help_usage_export() }}</ion-label></ion-item>
        <ion-item><ion-label class="ion-text-wrap">{{ i18n().graph_help_usage_roles() }}</ion-label></ion-item>
      </ion-list>
    </ion-content>
  `
})
export class GraphHelpModal {
  public i18n = input.required<PageI18n>();
}
