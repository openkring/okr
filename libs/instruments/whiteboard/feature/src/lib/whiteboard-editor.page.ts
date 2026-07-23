import { ChangeDetectionStrategy, Component, computed, effect, inject } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { IonBackButton, IonButton, IonButtons, IonContent, IonHeader, IonIcon, IonTitle, IonToolbar } from '@ionic/angular/standalone';

import { I18nService } from '@okr/shared-i18n';
import { SvgIconPipe } from '@okr/shared-pipes';
import { hasRole } from '@okr/shared-util-core';

import { WhiteboardCanvas, WhiteboardItemAdd, WhiteboardItemMove } from '@okr/instruments-whiteboard-ui';
import { WHITEBOARD_TEMPLATES } from '@okr/instruments-whiteboard-util';
import type { WhiteboardItem } from '@okr/shared-models';

import { WhiteboardStore } from './whiteboard.store';

/**
 * Full-page canvas editor for one whiteboard. Reads `:whiteboardKey` from the route, streams the
 * board live from the store and hosts the dumb `WhiteboardCanvas`, translating its intents into
 * store writes: a move → `moveItem` (single position write on pointerup), a tap → `editItem`
 * (per-item modal), the add buttons → `addItem`. Store is component-provided (DI contract).
 */
@Component({
  selector: 'okr-whiteboard-editor-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [WhiteboardStore],
  imports: [
    SvgIconPipe, WhiteboardCanvas,
    IonHeader, IonToolbar, IonButtons, IonBackButton, IonButton, IonIcon, IonTitle, IonContent,
  ],
  styles: [`
    .stage { position: absolute; inset: 0; }
  `],
  template: `
    <ion-header>
      <ion-toolbar color="secondary">
        <ion-buttons slot="start">
          <ion-back-button defaultHref="/whiteboard/all/whiteboard-context" />
        </ion-buttons>
        <ion-title>{{ board()?.name || store.i18n.whiteboard() }}</ion-title>
        @if (!readOnly() && board(); as b) {
          <ion-buttons slot="end">
            <ion-button (click)="store.editMeta(b, false)" [title]="store.i18n.edit_label()">
              <ion-icon slot="icon-only" src="{{ 'create' | svgIcon }}" />
            </ion-button>
          </ion-buttons>
        }
      </ion-toolbar>
    </ion-header>

    <ion-content [scrollY]="false">
      <div class="stage">
        @if (board(); as b) {
          <okr-whiteboard-canvas
            [items]="b.items"
            [template]="store.template()"
            [i18n]="store.i18n"
            [zoneLabels]="zoneLabels()"
            [readOnly]="readOnly()"
            (itemMoved)="onItemMoved($event)"
            (itemAdded)="onItemAdded($event)"
            (itemSelected)="onItemSelected($event)"
          />
        }
      </div>
    </ion-content>
  `,
})
export class WhiteboardEditorPage {
  protected readonly store = inject(WhiteboardStore);
  private readonly route = inject(ActivatedRoute);
  private readonly zoneLabelSignals = inject(I18nService).translateAll(
    Object.fromEntries(WHITEBOARD_TEMPLATES.flatMap(t => t.zones.map(z => [z.id, z.labelKey]))),
  );

  protected readonly board = computed(() => this.store.whiteboard());
  protected readonly readOnly = computed(() =>
    !hasRole('contentAdmin', this.store.currentUser()) && !hasRole('privileged', this.store.currentUser()));

  /** Resolved zone labels for the open board's template, keyed by zone id (store-driven i18n). */
  protected readonly zoneLabels = computed<Record<string, string>>(() => {
    const out: Record<string, string> = {};
    for (const zone of this.store.template().zones) {
      out[zone.id] = this.zoneLabelSignals[zone.id]?.() ?? zone.labelKey;
    }
    return out;
  });

  constructor() {
    effect(() => {
      const key = this.route.snapshot.paramMap.get('whiteboardKey');
      if (key) this.store.setWhiteboardKey(key);
    });
  }

  protected onItemMoved(move: WhiteboardItemMove): void {
    void this.store.moveItem(move.key, move.x, move.y);
  }

  protected onItemAdded(add: WhiteboardItemAdd): void {
    void this.store.addItem(add.kind, add.x, add.y);
  }

  protected onItemSelected(item: WhiteboardItem): void {
    void this.store.editItem(item, this.readOnly());
  }
}
