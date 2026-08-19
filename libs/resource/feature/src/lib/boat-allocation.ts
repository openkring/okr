import { AsyncPipe } from '@angular/common';
import { CdkDrag, CdkDragDrop, CdkDropList } from '@angular/cdk/drag-drop';
import { Component, computed, inject, signal } from '@angular/core';
import { IonButtons, IonContent, IonHeader, IonInput, IonMenuButton, IonSelect, IonSelectOption, IonTitle, IonToolbar } from '@ionic/angular/standalone';

import { CategoryItemModel, ResourceModel } from '@okr/shared-models';
import { TranslatePipe } from '@okr/shared-i18n';
import { EmptyList, Spinner } from '@okr/shared-ui';
import { chipMatches, getItemLabel, hasRole } from '@okr/shared-util-core';

import { boatTargetKey, getUsageForYear } from '@okr/resource-util';

import { ResourceStore } from './resource.store';

/** Only boats carrying this tag take part in the Bootseinteilung. Substring match — see chipMatches. */
const ALLOCATION_TAG = 'bstrat';

/** Years offered by the toolbar selector, relative to the current year. */
const YEAR_RANGE = 5;

/** rboat_usage items that get no column (private boats are not allocated). */
const EXCLUDED_USAGES = ['private'];

/** rboat_type items that get no row. */
const EXCLUDED_TYPES = ['b2p'];

type Cell = { usage: string; type: string };

@Component({
  selector: 'okr-boat-allocation',
  standalone: true,
  imports: [
    AsyncPipe, TranslatePipe, CdkDropList, CdkDrag,
    Spinner, EmptyList,
    IonHeader, IonToolbar, IonButtons, IonTitle, IonMenuButton, IonContent, IonInput, IonSelect, IonSelectOption
  ],
  providers: [ResourceStore],
  styles: [`
    .grid { display: grid; gap: 2px; padding: 8px; min-width: fit-content; }
    .head, .row-head { font-weight: 600; padding: 6px 8px; background: var(--ion-color-light); position: sticky; }
    .head { top: 0; z-index: 2; }
    .row-head { left: 0; z-index: 1; display: flex; flex-direction: column; gap: 4px; }
    .cell { background: var(--ion-color-light-tint); padding: 4px; border-radius: 4px; }
    .target { --padding-start: 4px; --padding-top: 0; --padding-bottom: 0; font-weight: 600; text-align: center; min-height: 28px; }
    .drop { min-height: 44px; }
    .boat { padding: 3px 6px; margin-bottom: 2px; border-radius: 4px; background: var(--ion-background-color); cursor: grab; font-size: 0.9em; }
    .cdk-drag-preview { box-shadow: 0 4px 16px rgba(0,0,0,.2); opacity: .9; }
    .cdk-drag-placeholder { opacity: .3; }
    .cdk-drop-list-dragging .boat:not(.cdk-drag-placeholder) { transition: transform 250ms cubic-bezier(0,0,.2,1); }
  `],
  template: `
  <ion-header>
    <ion-toolbar color="secondary">
      <ion-buttons slot="start"><ion-menu-button /></ion-buttons>
      <ion-title>{{ allocatedCount() }}/{{ boats().length }} {{ store.i18n.alloc_title() }}</ion-title>
      <ion-buttons slot="end">
        <ion-select [value]="year()" (ionChange)="year.set(+$event.detail.value)"
          interface="popover" [label]="store.i18n.alloc_year()" labelPlacement="start">
          @for (y of years; track y) { <ion-select-option [value]="y">{{ y }}</ion-select-option> }
        </ion-select>
      </ion-buttons>
    </ion-toolbar>
  </ion-header>

  <ion-content>
    @if (store.isLoading()) {
      <okr-spinner />
    } @else if (boats().length === 0) {
      <okr-empty-list [message]="store.i18n.alloc_empty()" />
    } @else {
      <div class="grid" [style.grid-template-columns]="gridColumns()">
        <div class="head"></div>
        @for (usage of usages(); track usage.name) {
          <div class="head">{{ usageLabel(usage.name) | translate | async }}</div>
        }

        @for (type of types(); track type.name) {
          <div class="row-head">
            {{ typeLabel(type.name) | translate | async }}
            <div class="drop"
              cdkDropList
              [id]="dropListId('', type.name)"
              [cdkDropListData]="{ usage: '', type: type.name }"
              [cdkDropListConnectedTo]="connectedTo(type.name)"
              [cdkDropListDisabled]="readOnly()"
              (cdkDropListDropped)="onDrop($event)">
              @for (boat of boatsIn('', type.name); track boat.okey) {
                <div class="boat" cdkDrag [cdkDragData]="boat">{{ boat.name }}</div>
              }
            </div>
          </div>
          @for (usage of usages(); track usage.name) {
            <div class="cell">
              <ion-input class="target" type="number" inputmode="numeric" min="0" [readonly]="readOnly()"
                [attr.aria-label]="store.i18n.alloc_target()" [title]="store.i18n.alloc_target()"
                [value]="target(usage.name, type.name)"
                (ionBlur)="onTargetChange(usage.name, type.name, $event)" />
              <div class="drop"
                cdkDropList
                [id]="dropListId(usage.name, type.name)"
                [cdkDropListData]="{ usage: usage.name, type: type.name }"
                [cdkDropListConnectedTo]="connectedTo(type.name)"
                [cdkDropListDisabled]="readOnly()"
                (cdkDropListDropped)="onDrop($event)">
                @for (boat of boatsIn(usage.name, type.name); track boat.okey) {
                  <div class="boat" cdkDrag [cdkDragData]="boat">{{ boat.name }}</div>
                }
              </div>
            </div>
          }
        }
      </div>
    }
  </ion-content>
  `
})
export class BoatAllocation {
  protected readonly store = inject(ResourceStore);

  protected readonly years = Array.from({ length: 2 * YEAR_RANGE + 1 }, (_, i) => new Date().getFullYear() - YEAR_RANGE + i);
  protected readonly year = signal(new Date().getFullYear());

  private readonly usageCategory = computed(() => this.store.appStore.getCategory('rboat_usage'));
  private readonly typeCategory  = computed(() => this.store.appStore.getCategory('rboat_type'));

  protected readonly usages = computed(() => (this.usageCategory()?.items ?? []).filter(item => !EXCLUDED_USAGES.includes(item.name)));
  protected readonly types  = computed(() => (this.typeCategory()?.items ?? []).filter(item => !EXCLUDED_TYPES.includes(item.name)));

  protected readonly readOnly = computed(() => !hasRole('resourceAdmin', this.store.currentUser()));

  /** All rowing boats that take part in the allocation, regardless of the year. */
  protected readonly boats = computed(() => this.store.rboats().filter(boat => chipMatches(boat.tags, ALLOCATION_TAG)));

  /** boat → the cell it belongs to in the selected year; boats without a visible usage land in the unassigned column. */
  private readonly allocation = computed(() => {
    const year = this.year();
    const visible = new Set(this.usages().map(item => item.name));
    const byCell = new Map<string, ResourceModel[]>();
    for (const boat of this.boats()) {
      const usage = getUsageForYear(boat.usage, year);
      const key = `${visible.has(usage) ? usage : ''}|${boat.subType}`;
      byCell.set(key, [...(byCell.get(key) ?? []), boat]);
    }
    return byCell;
  });

  /** How many of the tagged boats actually landed in a cell — the rest have no usage for this year. */
  protected readonly allocatedCount = computed(() =>
    [...this.allocation().entries()].reduce((sum, [key, list]) => sum + (key.startsWith('|') ? 0 : list.length), 0));

  protected readonly gridColumns = computed(() => `minmax(7rem, auto) repeat(${this.usages().length}, minmax(9rem, 1fr))`);

  /******************************** getters ******************************************* */
  protected boatsIn(usage: string, type: string): ResourceModel[] {
    return this.allocation().get(`${usage}|${type}`) ?? [];
  }

  protected target(usage: string, type: string): number | null {
    return this.store.boatTargets()[boatTargetKey(this.year(), usage, type)] ?? null;
  }

  protected dropListId(usage: string, type: string): string {
    return `ba-${type}-${usage}`;
  }

  /** Horizontal only: a boat may be dropped into the lists of its OWN rboat_type row and nowhere else. */
  protected connectedTo(type: string): string[] {
    return ['', ...this.usages().map((usage: CategoryItemModel) => usage.name)].map(usage => this.dropListId(usage, type));
  }

  protected usageLabel(name: string): string {
    const category = this.usageCategory();
    return category ? getItemLabel(category, name) : name;
  }

  protected typeLabel(name: string): string {
    const category = this.typeCategory();
    return category ? getItemLabel(category, name) : name;
  }

  /******************************** actions ******************************************* */
  protected async onDrop(event: CdkDragDrop<Cell>): Promise<void> {
    if (event.previousContainer === event.container) return;
    await this.store.setBoatUsage(event.item.data as ResourceModel, this.year(), event.container.data.usage, this.readOnly());
  }

  protected async onTargetChange(usage: string, type: string, event: Event): Promise<void> {
    const raw = (event.target as HTMLIonInputElement).value;
    const count = Math.max(0, Math.trunc(Number(raw)));
    if (!Number.isFinite(count) || count === (this.target(usage, type) ?? 0)) return;
    await this.store.setBoatTarget(this.year(), usage, type, count, this.readOnly());
  }
}
