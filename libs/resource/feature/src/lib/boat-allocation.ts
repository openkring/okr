import { AsyncPipe } from '@angular/common';
import { CdkDrag, CdkDragDrop, CdkDropList } from '@angular/cdk/drag-drop';
import { Component, computed, inject, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { IonButton, IonButtons, IonCheckbox, IonContent, IonHeader, IonIcon, IonInput, IonMenuButton, IonPopover, IonTitle, IonToolbar } from '@ionic/angular/standalone';

import { Menu } from '@okr/cms-menu-feature';
import { FirestoreService } from '@okr/shared-data-access';
import { BOAT_SLOT_NO_COLOR, BoatSlotLabel, BoatStrategyType, CategoryItemModel, OwnershipCollection, OwnershipModel, ResourceModel } from '@okr/shared-models';
import { TranslatePipe } from '@okr/shared-i18n';
import { SvgIconPipe } from '@okr/shared-pipes';
import { EmptyList, ListFilter, Spinner } from '@okr/shared-ui';
import { error, exportCsv, getExportFileName } from '@okr/shared-util-angular';
import { chipMatches, DateFormat, getImgixUrlWithAutoParams, getItemLabel, getSystemQuery, getTodayStr, hasRole, nameMatches } from '@okr/shared-util-core';

import { BoatLabelRef, boatLabelKey, boatTargetKey, getBoatBudget, getBoatSuffix, getPrivateBoatKeys, getUsageForYear, parseBoatLabelKey } from '@okr/resource-util';

import { ResourceStore } from './resource.store';

/** Only boats carrying this tag take part in the Bootseinteilung. Substring match — see chipMatches. */
const ALLOCATION_TAG = 'bstrat';

/** Years offered by the toolbar selector, relative to the current year. */
const YEAR_RANGE = 5;

/** rboat_usage items that get no column (private boats are not allocated). */
const EXCLUDED_USAGES = ['private'];

/** rboat_type items that get no row. */
const EXCLUDED_TYPES = ['b2p'];

/** Years covered by the Bootsstrategie table, starting at the selected one. */
const STRATEGY_YEARS = 5;

type Cell = { usage: string; type: string };
type StrategyLine = { type: string; text: string; flags: string; price: number; swisslos: number; donations: number };

@Component({
  selector: 'okr-boat-allocation',
  standalone: true,
  imports: [
    AsyncPipe, TranslatePipe, SvgIconPipe, CdkDropList, CdkDrag,
    Menu, Spinner, EmptyList, ListFilter,
    IonHeader, IonToolbar, IonButtons, IonButton, IonCheckbox, IonIcon, IonPopover, IonTitle, IonMenuButton, IonContent, IonInput
  ],
  providers: [ResourceStore],
  styles: [`
    .grid { display: grid; gap: 2px; padding: 8px; min-width: fit-content; }
    .head, .row-head { font-weight: 600; padding: 6px 8px; background: #A3C0E1; color: #000; position: sticky; }
    .head { top: 0; z-index: 2; }
    .row-head { left: 0; z-index: 1; display: flex; flex-direction: column; gap: 2px; }
    .cell { padding: 0; }
    .drop { min-height: 28px; }
    .target { --background: #CEDCEB; --color: #000; --padding-start: 4px; --padding-top: 0; --padding-bottom: 0;
      font-weight: 600; text-align: center; min-height: 26px; }
    .slot { display: flex; justify-content: space-between; gap: 6px; min-height: 26px; padding: 3px 6px;
      margin-top: 2px; border-radius: 4px; font-size: 0.9em; color: #000; }
    .flags { opacity: .7; }
    .in-target { background: #E7E9EC; }
    .empty { cursor: pointer; }
    .boat { cursor: pointer; }
    .match { background: var(--ion-color-warning); font-weight: 600; }
    .strategy { padding: 8px 12px; overflow-x: auto; }
    .strategy h3 { font-size: 1em; font-weight: 600; margin: 0 0 4px 0; }
    /* columns size to their content and the wrapper scrolls, rather than squeezing to fit */
    .strategy table { border-collapse: collapse; width: max-content; min-width: 100%; }
    .strategy th, .strategy td { border: 1px solid var(--ion-color-medium); padding: 3px 8px; text-align: left; vertical-align: top; min-width: 7rem; }
    .strategy thead th, .strategy tbody th { background: #A3C0E1; color: #000; white-space: nowrap; }
    .strategy .line { display: flex; justify-content: space-between; gap: 12px; }
    .strategy ion-checkbox { --size: 16px; font-weight: 400; font-size: 0.9em; }
    .strategy .budget-input { --background: transparent; --padding-start: 0; --padding-top: 0; --padding-bottom: 0;
      min-height: 0; font-size: inherit; }
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
        <ion-button (click)="store.showBoatAllocationInfo()">
          <ion-icon slot="icon-only" src="{{ 'info-circle' | svgIcon }}" />
        </ion-button>
        <ion-button id="c_rballoc">
          <ion-icon slot="icon-only" src="{{ 'ellipsis-vertical' | svgIcon }}" />
        </ion-button>
        <ion-popover trigger="c_rballoc" triggerAction="click" [showBackdrop]="true" [dismissOnSelect]="true" (ionPopoverDidDismiss)="onPopoverDismiss($event)">
          <ng-template>
            <ion-content>
              <!-- the shared 'editmode-toggle' doc is roleNeeded 'registered'; only a resourceAdmin
                   can actually edit here, so hide the row for everyone else -->
              <okr-menu menuName="c-rballoc" [excludeNames]="excludedMenuNames()" [toggleStates]="{ toggleEditMode: editMode() }" />
            </ion-content>
          </ng-template>
        </ion-popover>
      </ion-buttons>
    </ion-toolbar>
    <okr-list-filter
      [years]="years" [selectedYear]="year()" [yearLabel]="store.i18n.alloc_year()" [showAllYears]="false"
      (yearChanged)="year.set($event)"
      (searchTermChanged)="searchTerm.set($event)" />
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
            <div class="drop" cdkDropList
              [id]="dropListId('', type.name)"
              [cdkDropListData]="{ usage: '', type: type.name }"
              [cdkDropListConnectedTo]="connectedTo(type.name)"
              [cdkDropListDisabled]="readOnly()"
              (cdkDropListDropped)="onDrop($event)">
              @for (boat of boatsIn('', type.name); track boat.okey) {
                <div class="slot boat" [class.match]="isMatch(boat)"
                  [style.background]="slotBackground(boatRef(boat))"
                  [style.color]="slotForeground(boatRef(boat))"
                  cdkDrag [cdkDragData]="boat"
                  (cdkDragEnded)="onDragEnded()" (click)="onBoatClick(boat)">
                  <span>{{ boat.name }}</span><span class="flags">{{ boatFlags(boat) }}</span>
                </div>
              }
            </div>
          </div>
          @for (usage of usages(); track usage.name) {
            <div class="cell">
              <ion-input class="target" type="number" inputmode="numeric" min="0" [readonly]="readOnly()"
                [attr.aria-label]="store.i18n.alloc_target()" [title]="store.i18n.alloc_target()"
                [value]="target(usage.name, type.name)"
                (ionBlur)="onTargetChange(usage.name, type.name, $event)" />
              <div class="drop" cdkDropList
                [id]="dropListId(usage.name, type.name)"
                [cdkDropListData]="{ usage: usage.name, type: type.name }"
                [cdkDropListConnectedTo]="connectedTo(type.name)"
                [cdkDropListDisabled]="readOnly()"
                (cdkDropListDropped)="onDrop($event)">
                @for (boat of boatsIn(usage.name, type.name); track boat.okey; let i = $index) {
                  <div class="slot boat" [class.in-target]="i < (target(usage.name, type.name) ?? 0)"
                    [class.match]="isMatch(boat)"
                    [style.background]="slotBackground(boatRef(boat))"
                    [style.color]="slotForeground(boatRef(boat))"
                    cdkDrag [cdkDragData]="boat"
                    (cdkDragEnded)="onDragEnded()" (click)="onBoatClick(boat)">
                    <span>{{ boat.name }}</span><span class="flags">{{ boatFlags(boat) }}</span>
                  </div>
                }
                <!-- free slots: shaded up to the target, white beyond it — all of them labellable -->
                @for (slot of emptySlots(usage.name, type.name); track slot) {
                  <div class="slot empty"
                    [class.in-target]="boatsIn(usage.name, type.name).length + slot < (target(usage.name, type.name) ?? 0)"
                    [style.background]="slotBackground(slotRef(usage.name, type.name, slot))"
                    [style.color]="slotForeground(slotRef(usage.name, type.name, slot))"
                    (click)="onSlotClick(slotRef(usage.name, type.name, slot))">
                    <span>{{ label(slotRef(usage.name, type.name, slot)).text }}</span>
                  </div>
                }
              </div>
            </div>
          }
        }
      </div>

      <!-- Bootsstrategie: the strategy-flagged slots of the next few seasons, as money -->
      <div class="strategy">
        <h3>{{ store.i18n.strategy_title() }}</h3>
        <table>
          <thead>
            <tr>
              <th>
                <ion-checkbox labelPlacement="end" [checked]="showPastYears()"
                  (ionChange)="showPastYears.set($event.detail.checked)">{{ store.i18n.strategy_past() }}</ion-checkbox>
              </th>
              @for (y of strategyYears(); track y) { <th>{{ y }}</th> }
            </tr>
          </thead>
          <tbody>
            <!-- the season's budget; an untouched year shows the one it inherits (getBoatBudget) -->
            <tr>
              <th>{{ store.i18n.strategy_budget() }}</th>
              @for (y of strategyYears(); track y) {
                <td>
                  <ion-input class="budget-input" type="number" inputmode="numeric" min="0" [readonly]="readOnly()"
                    [attr.aria-label]="store.i18n.strategy_budget()" [title]="store.i18n.strategy_budget()"
                    [value]="budget(y)"
                    (ionBlur)="onBudgetChange(y, $event)" />
                </td>
              }
            </tr>
            @for (row of buyRows(); track $index; let first = $first) {
              <tr>
                <th>{{ first ? store.i18n.strategy_buy() : '' }}</th>
                @for (line of row; track $index) {
                  <td>@if (line) {
                    <div class="line">
                      <span>{{ typeLabel(line.type) | translate | async }} {{ line.text }}</span><span class="flags">{{ line.flags }}</span>
                    </div>
                    <div>{{ money(line.price) }}</div>
                  }</td>
                }
              </tr>
            }
            @for (row of sellRows(); track $index; let first = $first) {
              <tr>
                <th>{{ first ? store.i18n.strategy_sell() : '' }}</th>
                @for (line of row; track $index) {
                  <td>@if (line) {
                    <div class="line">
                      <span>{{ typeLabel(line.type) | translate | async }} {{ line.text }}</span><span class="flags">{{ line.flags }}</span>
                    </div>
                    <div>{{ money(line.price) }}</div>
                  }</td>
                }
              </tr>
            }
            <tr>
              <th>{{ store.i18n.strategy_saldo() }}</th>
              @for (y of strategyYears(); track y) {
                <td [style.background]="saldoBackground(y)" [style.color]="saldoForeground(y)">{{ money(saldo(y)) }}</td>
              }
            </tr>
            <tr>
              <th>{{ store.i18n.strategy_swisslos() }}</th>
              @for (y of strategyYears(); track y) { <td>{{ money(swisslos(y)) }}</td> }
            </tr>
            <tr>
              <th>{{ store.i18n.strategy_donations() }}</th>
              @for (y of strategyYears(); track y) { <td>{{ money(donations(y)) }}</td> }
            </tr>
            <tr>
              <th>{{ store.i18n.strategy_effective() }}</th>
              @for (y of strategyYears(); track y) { <td>{{ money(effectiveCost(y)) }}</td> }
            </tr>
          </tbody>
        </table>
      </div>

    }
  </ion-content>
  `
})
export class BoatAllocation {
  protected readonly store = inject(ResourceStore);
  private readonly firestoreService = inject(FirestoreService);

  protected readonly years = Array.from({ length: 2 * YEAR_RANGE + 1 }, (_, i) => new Date().getFullYear() - YEAR_RANGE + i);
  protected readonly year = signal(new Date().getFullYear());
  protected readonly searchTerm = signal('');

  private readonly usageCategory = computed(() => this.store.appStore.getCategory('rboat_usage'));
  private readonly typeCategory  = computed(() => this.store.appStore.getCategory('rboat_type'));

  protected readonly usages = computed(() => (this.usageCategory()?.items ?? []).filter(item => !EXCLUDED_USAGES.includes(item.name)));
  protected readonly types  = computed(() => (this.typeCategory()?.items ?? []).filter(item => !EXCLUDED_TYPES.includes(item.name)));

  /**
   * Edit mode is off by default — every user, resourceAdmin included, first gets the read-only
   * view (tap a boat → detail modal). Switching it on (context menu) unlocks drag & drop,
   * the target numbers and the slot labels, but only for a resourceAdmin.
   */
  protected readonly editMode = signal(false);
  protected readonly excludedMenuNames = computed(() => hasRole('resourceAdmin', this.store.currentUser()) ? [] : ['editmode-toggle']);
  protected readonly readOnly = computed(() => !this.editMode() || !hasRole('resourceAdmin', this.store.currentUser()));

  /** All rowing boats that take part in the allocation, regardless of the year. */
  protected readonly boats = computed(() => this.store.rboats().filter(boat => chipMatches(boat.tags, ALLOCATION_TAG)));

  /** Ownerships tell club boats from private ones — the club org's okey is the tenantId. */
  private readonly ownershipResource = rxResource({
    params: () => ({ tenantId: this.store.tenantId() }),
    stream: ({ params }) => this.firestoreService.searchData<OwnershipModel>(
      OwnershipCollection, getSystemQuery(params.tenantId), 'validFrom', 'desc'),
  });

  /** Boats owned by someone other than the club in `year` — see getPrivateBoatKeys. */
  private privateKeysIn(year: number): Set<string> {
    return getPrivateBoatKeys(this.ownershipResource.value() ?? [], this.store.tenantId(), year);
  }

  private readonly privateBoatKeys = computed(() => this.privateKeysIn(this.year()));

  /**
   * boat → the cell it belongs to in `year`. A boat with no allocation for that season is not
   * part of the table at all (getUsageForYear → undefined) and is skipped; one whose usage is
   * empty or hidden (private) lands in the unassigned column.
   */
  private allocationIn(year: number): Map<string, ResourceModel[]> {
    const visible = new Set(this.usages().map(item => item.name));
    const byCell = new Map<string, ResourceModel[]>();
    for (const boat of this.boats()) {
      const usage = getUsageForYear(boat.usage, year);
      if (usage === undefined) continue;
      const key = `${visible.has(usage) ? usage : ''}|${boat.subType}`;
      byCell.set(key, [...(byCell.get(key) ?? []), boat]);
    }
    return byCell;
  }

  private readonly allocation = computed(() => this.allocationIn(this.year()));

  /** How many of the tagged boats actually landed in a cell — the rest have no usage for this year. */
  protected readonly allocatedCount = computed(() =>
    [...this.allocation().entries()].reduce((sum, [key, list]) => sum + (key.startsWith('|') ? 0 : list.length), 0));

  /** true while the click synthesised by a finished drag is still pending — see onDragEnded. */
  private dragged = false;

  /******************************** Bootsstrategie ******************************************* */
  protected readonly showPastYears = signal(false);

  /**
   * The current season and the four that follow it — one column each. Deliberately NOT tied to
   * the grid's year selector: the strategy is a fixed five-year outlook, and each column reads
   * the slots stored for its own year anyway. Ticking «Vergangene Jahre anzeigen» widens it to
   * every season that carries strategy data, however far back.
   */
  private readonly outlookYears = Array.from({ length: STRATEGY_YEARS }, (_, i) => new Date().getFullYear() + i);

  /**
   * Every season the Bootseinteilung holds anything for — a label or a target count. Deriving
   * this from the strategy lines alone made the checkbox look dead: only a season carrying a
   * strategy-FLAGGED label would have widened the table, and those live in the outlook anyway.
   */
  private readonly configuredYears = computed(() => [
    ...Object.keys(this.store.boatLabels()),
    ...Object.keys(this.store.boatTargets()),
  ].map(key => Number(key.split('|')[0])).filter(year => Number.isInteger(year)));

  protected readonly strategyYears = computed(() => {
    if (!this.showPastYears()) return this.outlookYears;
    // A contiguous range, empty seasons included: the checkbox always reaches YEAR_RANGE back so
    // it visibly does something even before anything is planned there, and further still if an
    // older season does carry data.
    const first = Math.min(this.outlookYears[0] - YEAR_RANGE, ...this.configuredYears());
    const last = this.outlookYears[this.outlookYears.length - 1];
    return Array.from({ length: last - first + 1 }, (_, i) => first + i);
  });

  /** Every strategy-flagged slot label, grouped by year and kind — the slot's own year, not the selected one. */
  private readonly strategyLines = computed(() => {
    const byYear = new Map<string, StrategyLine[]>();
    const boats = new Map(this.boats().map(boat => [boat.okey, boat]));
    for (const [key, label] of Object.entries(this.store.boatLabels())) {
      if (label?.isStrategyRelevant !== true) continue;
      const ref = parseBoatLabelKey(key);
      if (!ref) continue;
      const boat = ref.kind === 'boat' ? boats.get(ref.boatKey) : undefined;
      // The boat class is the grid ROW: for a free slot that is the key's rboat_type, for a boat
      // its own subType — the grid places it in exactly that row.
      const type = ref.kind === 'boat' ? boat?.subType ?? '' : ref.type;
      const price = Number(label.price) || 0;
      const group = `${ref.year}|${label.strategyType ?? 'buy'}`;
      byYear.set(group, [...(byYear.get(group) ?? []), {
        type,
        // a boat label is named after its boat, a free slot carries its note
        text: boat ? boat.name : label.text ?? '',
        flags: boat ? getBoatSuffix(boat.load, this.privateKeysIn(ref.year).has(boat.okey)) : '',
        price,
        // legacy labels predate the funding fields — see the model defaults
        swisslos: Math.round(price * (Number(label.swisslos) || 0) / 100),
        donations: Number(label.donations) || 0,
      }]);
    }
    return byYear;
  });

  private linesOf(year: number, kind: BoatStrategyType): StrategyLine[] {
    return this.strategyLines().get(`${year}|${kind}`) ?? [];
  }

  /** One table row per line index, one cell per year — the tallest year decides the row count. */
  private rowsOf(kind: BoatStrategyType): (StrategyLine | undefined)[][] {
    const years = this.strategyYears();
    const height = Math.max(1, ...years.map(year => this.linesOf(year, kind).length));
    return Array.from({ length: height }, (_, row) => years.map(year => this.linesOf(year, kind)[row]));
  }

  protected readonly buyRows = computed(() => this.rowsOf('buy'));
  protected readonly sellRows = computed(() => this.rowsOf('sell'));

  private sumOf(year: number, kind: BoatStrategyType, field: keyof StrategyLine = 'price'): number {
    return this.linesOf(year, kind).reduce((sum, line) => sum + (line[field] as number), 0);
  }

  /** Swisslos is a percentage per purchase; the row shows the francs it adds up to. */
  protected swisslos(year: number): number {
    return this.sumOf(year, 'buy', 'swisslos');
  }

  protected donations(year: number): number {
    return this.sumOf(year, 'buy', 'donations');
  }

  /** What the season's purchases cost net of its sales — measured against the budget row. */
  protected saldo(year: number): number {
    return this.sumOf(year, 'buy') - this.sumOf(year, 'sell');
  }

  protected effectiveCost(year: number): number {
    return this.saldo(year) - this.swisslos(year) - this.donations(year);
  }

  /** The budget of the season — its own entry, else the nearest earlier one. */
  protected budget(year: number): number {
    return getBoatBudget(this.store.boatBudgets(), year);
  }

  /** Over the season's budget is red, within it green. */
  private saldoColor(year: number): string {
    return this.saldo(year) > this.budget(year) ? 'danger' : 'success';
  }

  protected saldoBackground(year: number): string {
    return `var(--ion-color-${this.saldoColor(year)})`;
  }

  protected saldoForeground(year: number): string {
    return `var(--ion-color-${this.saldoColor(year)}-contrast)`;
  }

  protected money(amount: number): string {
    return amount.toLocaleString('de-CH');
  }


  protected readonly gridColumns = computed(() => `minmax(7rem, auto) repeat(${this.usages().length}, minmax(9rem, 1fr))`);

  /******************************** getters ******************************************* */
  protected boatsIn(usage: string, type: string): ResourceModel[] {
    return this.allocation().get(`${usage}|${type}`) ?? [];
  }

  /**
   * The free slots of a cell, numbered among the FREE slots only — never counting the boats, so
   * a season with a different boat count still addresses the same label. Every cell of a row is
   * padded to the row's tallest cell, so the row lines up.
   */
  protected emptySlots(usage: string, type: string): number[] {
    const free = this.rowHeight(type) - this.boatsIn(usage, type).length;
    return Array.from({ length: Math.max(0, free) }, (_, i) => i);
  }

  /**
   * Slots per cell in one rboat_type row: the tallest cell of that row — boats, target, or the
   * boats plus enough free slots to reach the highest LABELLED one. Without that last term a
   * label propagated into a season with fewer boats would sit past the last rendered row.
   */
  private rowHeight(type: string): number {
    return this.usages().reduce((max, usage) => Math.max(
      max,
      this.boatsIn(usage.name, type).length,
      this.target(usage.name, type) ?? 0,
      this.boatsIn(usage.name, type).length + this.labelledSlots(usage.name, type),
    ), 1);
  }

  /** How many free slots of a cell carry a label — i.e. the highest labelled index plus one. */
  private labelledSlots(usage: string, type: string): number {
    const year = this.year();
    return [...Object.keys(this.store.boatLabels())]
      .map(key => parseBoatLabelKey(key))
      .filter(ref => ref?.kind === 'slot' && ref.year === year && ref.usage === usage && ref.type === type)
      .reduce((max, ref) => Math.max(max, (ref as { slot: number }).slot + 1), 0);
  }

  protected target(usage: string, type: string): number | null {
    return this.store.boatTargets()[boatTargetKey(this.year(), usage, type)] ?? null;
  }

  /** The label of a free slot of the selected season. */
  protected slotRef(usage: string, type: string, slot: number): BoatLabelRef {
    return { kind: 'slot', year: this.year(), usage, type, slot };
  }

  /** The label of a boat, wherever it is allocated — it travels with the boat, not with the cell. */
  protected boatRef(boat: ResourceModel): BoatLabelRef {
    return { kind: 'boat', year: this.year(), boatKey: boat.okey };
  }

  protected label(ref: BoatLabelRef): BoatSlotLabel {
    return this.store.boatLabels()[boatLabelKey(ref)] ?? new BoatSlotLabel();
  }

  /**
   * The Ionic color a slot is painted with, '' if it keeps the .in-target shading (or the white
   * background). A label with an empty text still paints, so a boat can be flagged for
   * Beschaffung/Verkauf without a note.
   */
  private slotColorName(ref: BoatLabelRef): string {
    const color = this.store.boatLabels()[boatLabelKey(ref)]?.color;
    return color && color !== BOAT_SLOT_NO_COLOR ? color : '';
  }

  protected slotBackground(ref: BoatLabelRef): string {
    const color = this.slotColorName(ref);
    return color ? `var(--ion-color-${color})` : '';
  }

  /** Ionic ships a readable foreground per color (black on light, white on dark) — use it. */
  protected slotForeground(ref: BoatLabelRef): string {
    const color = this.slotColorName(ref);
    return color ? `var(--ion-color-${color}-contrast)` : '';
  }

  /** 'l' / 's' / 'p', right-aligned behind the boat name — see getBoatSuffix. */
  protected boatFlags(boat: ResourceModel): string {
    return getBoatSuffix(boat.load, this.privateBoatKeys().has(boat.okey));
  }

  protected isMatch(boat: ResourceModel): boolean {
    return this.searchTerm().length > 0 && nameMatches(boat.index, this.searchTerm());
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
  public async onPopoverDismiss($event: CustomEvent): Promise<void> {
    const selectedMethod = $event.detail.data;
    if (!selectedMethod) return; // dismissed without choosing an item (backdrop/escape) — not an error
    switch (selectedMethod) {
      case 'toggleEditMode': this.editMode.set(!this.editMode()); break;
      case 'exportRaw': await this.export(); break;
      case 'print': await this.print(); break;
      default: error(undefined, `BoatAllocation.call: unknown method ${selectedMethod}`);
    }
  }

  /**
   * A drop is followed by a synthetic click on the dragged element. Swallow that one: it would
   * open the detail modal on the PRE-drop copy of the boat, and saving it would write the old
   * `usage` back over the allocation the drop just made. Cleared on the next macrotask, so a
   * browser that fires no click does not swallow the following real one.
   */
  protected onDragEnded(): void {
    this.dragged = true;
    setTimeout(() => (this.dragged = false), 0);
  }

  /**
   * A tap that did not turn into a drag. Read-only: the boat's detail modal. Edit mode: the
   * slot's label modal — an occupied slot carries the same text + color as a free one, only
   * the text stays hidden behind the boat name (tap again to read it).
   */
  protected async onBoatClick(boat: ResourceModel): Promise<void> {
    if (this.dragged) return;
    if (this.readOnly()) {
      await this.store.edit(boat, false, true);
      return;
    }
    await this.onSlotClick(this.boatRef(boat), boat.name);
  }

  protected async onSlotClick(ref: BoatLabelRef, boatName = ''): Promise<void> {
    await this.store.editBoatLabel(ref, this.label(ref), this.readOnly(), boatName);
  }

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

  /**
   * Store the budget of one season. An unchanged field writes nothing — that is what keeps an
   * inherited value inherited rather than pinning a copy of it to every column on first blur.
   */
  protected async onBudgetChange(year: number, event: Event): Promise<void> {
    const raw = (event.target as HTMLIonInputElement).value;
    const amount = Math.max(0, Math.trunc(Number(raw)));
    if (!Number.isFinite(amount) || amount === this.budget(year)) return;
    await this.store.setBoatBudget(year, amount, this.readOnly());
  }

  /******************************** export & print ******************************************* */
  /**
   * The grid as a matrix, laid out exactly like the table on screen: one header row of
   * rboat_usage columns, then per rboat_type a target row and a row per slot.
   */
  private async buildMatrix(): Promise<{ header: string[]; rows: { type: string; targets: string[]; slots: string[][] }[] }> {
    const [usageLabel, typeLabel] = await Promise.all([
      this.store.i18nService.createLabelResolver(this.usageCategory()),
      this.store.i18nService.createLabelResolver(this.typeCategory()),
    ]);
    const columns = ['', ...this.usages().map(item => item.name)];
    return {
      header: ['', ...this.usages().map(item => usageLabel(item.name))],
      rows: this.types().map(type => ({
        type: typeLabel(type.name),
        targets: ['', ...this.usages().map(usage => String(this.target(usage.name, type.name) ?? ''))],
        slots: Array.from({ length: this.rowHeight(type.name) }, (_, row) => columns.map(usage => {
          const boats = this.boatsIn(usage, type.name);
          if (boats[row]) return `${boats[row].name} ${this.boatFlags(boats[row])}`.trim();
          return usage ? this.label(this.slotRef(usage, type.name, row - boats.length)).text : '';
        })),
      })),
    };
  }

  private async export(): Promise<void> {
    const { header, rows } = await this.buildMatrix();
    const table = [header];
    for (const row of rows) {
      table.push([row.type, ...row.targets.slice(1)]);
      for (const slot of row.slots) table.push(slot);
    }
    await exportCsv(table, getExportFileName(`allocation-${this.year()}`, 'csv'));
  }

  /**
   * Print via a standalone landscape document rather than the live page: the app shell
   * (side menu, toolbars) and the horizontal scroller would otherwise clip columns.
   */
  private async print(): Promise<void> {
    const { header, rows } = await this.buildMatrix();
    const appConfig = this.store.appStore.appConfig();
    const logoUrl = `${this.store.appStore.env.services.imgixBaseUrl}/${getImgixUrlWithAutoParams(appConfig.logoUrl)}`;
    // The print document carries no Ionic stylesheet, so `var(--ion-color-*)` would resolve to
    // nothing there — read the tenant's actual values off the live page instead of duplicating
    // the palette. `-contrast` is Ionic's own readable foreground for that color.
    const styles = getComputedStyle(document.body);
    const ionColor = (name: string, suffix = ''): string => styles.getPropertyValue(`--ion-color-${name}${suffix}`).trim();
    const cell = (usage: string, type: string, row: number, value: string): string => {
      const shaded = row < (this.target(usage, type) ?? 0);
      const boats = this.boatsIn(usage, type);
      const ref = boats[row] ? this.boatRef(boats[row]) : this.slotRef(usage, type, row - boats.length);
      const color = usage ? this.slotColorName(ref) : '';
      const background = color ? ionColor(color) : usage && shaded ? '#E7E9EC' : '#FFF';
      const foreground = color ? ionColor(color, '-contrast') : '#000';
      return `<td style="background:${background};color:${foreground}">${escapeHtml(value)}</td>`;
    };
    const columns = ['', ...this.usages().map(item => item.name)];
    const body = rows.map((row, index) => {
      const type = this.types()[index].name;
      const targets = `<tr><th>${escapeHtml(row.type)}</th>${row.targets.slice(1).map(t => `<td class="target">${escapeHtml(t)}</td>`).join('')}</tr>`;
      const slots = row.slots.map((values, slot) =>
        `<tr><th></th>${values.slice(1).map((value, i) => cell(columns[i + 1], type, slot, value)).join('')}</tr>`).join('');
      return targets + slots;
    }).join('');

    const html = `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(this.store.i18n.alloc_title())} ${this.year()}</title>
      <style>
        @page { size: A4 landscape; margin: 10mm; }
        body { font-family: system-ui, sans-serif; font-size: 10px; margin: 0; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        .top { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; }
        .top img { max-height: 40px; }
        table { border-collapse: collapse; width: 100%; }
        th, td { border: 1px solid #A3C0E1; padding: 2px 4px; text-align: left; }
        thead th { background: #A3C0E1; }
        tbody th { background: #A3C0E1; white-space: nowrap; }
        td.target { background: #CEDCEB; font-weight: 600; text-align: center; }
      </style></head>
      <body onload="window.print()">
        <div class="top"><div>${getTodayStr(DateFormat.ViewDate)}</div><img src="${logoUrl}" alt="" /></div>
        <table>
          <thead><tr>${header.map(label => `<th>${escapeHtml(label)}</th>`).join('')}</tr></thead>
          <tbody>${body}</tbody>
        </table>
      </body></html>`;

    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      error(undefined, 'BoatAllocation.print: the browser blocked the print window.');
      return;
    }
    // `body onload` (not printWindow.onload) fires reliably after a document.write and
    // waits for the logo, so the dialog never opens on a half-rendered page.
    printWindow.document.write(html);
    printWindow.document.close();
  }
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[char] ?? char));
}
