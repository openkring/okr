import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import {
  IonButton, IonButtons, IonCol, IonContent, IonGrid, IonHeader, IonIcon, IonItem, IonItemDivider,
  IonItemGroup, IonLabel, IonList, IonMenuButton, IonNote, IonRow, IonSegment, IonSegmentButton,
  IonTitle, IonToolbar, ModalController,
} from '@ionic/angular/standalone';

import { AppStore } from '@okr/shared-feature';
import { I18nService } from '@okr/shared-i18n';
import { SvgIconPipe } from '@okr/shared-pipes';
import { ListFilter } from '@okr/shared-ui';
import { AlertService, copyToClipboard } from '@okr/shared-util-angular';
import { fill } from '@okr/shared-util-core';
import type { CategoryListModel, FeatureRolloutModel, MenuItemModel } from '@okr/shared-models';
import {
  FEATURE_BLOCKS, FEATURE_BUNDLES, FEATURE_PICKER_I18N_KEYS, FEATURE_PROFILES, effectiveFeatures,
  findStructuralDrift, holdersOf, indexMenuDocsByName, isEmptyPlan, menuOutlineOf, pinnedFieldsOf,
  resolveAvailability, resolveWithDeps, summarizePlanConsequences,
} from '@okr/tenant-util';
import type {
  ApplyFeatureResponse, ApplyPlanPreview, AvailabilityVerdict, FeatureBlock, FeatureProfile,
  MenuSpec, PlanEntry, StructuralField,
} from '@okr/tenant-util';
import { FeatureRolloutService, FeatureSelectionService } from '@okr/tenant-data-access';
import { MenuService } from '@okr/cms-menu-data-access';
import type { BlockEnableResult } from '@okr/tenant-ui';
import { BlockEnableModal, MenuCompareModal, PickerHelpModal } from '@okr/tenant-ui';

import { buildMenuTree, filterMenuRows } from './menu-tree.util';
import type { MenuTreeRow } from './menu-tree.util';
import { actionableFieldsOf, patchNoteFor } from './menu-row-actions.util';

/** Which of the two `IonSegment` tabs is showing. */
type PickerSegment = 'blocks' | 'rows';

/**
 * The admin-facing feature picker — `/tenant/features` — split into two segments: which
 * catalogue BLOCKS are on (segment `blocks`) and, per enabled block, which menu ROWS are
 * attached and how each one's drift from the catalogue is resolved (segment `rows`, Task 11:
 * `buildMenuTree`'s row list, rendered as a three-column table with «Übernehmen»/«Fixieren»/
 * «Katalog anpassen» — the idea in one sentence: the catalogue proposes, the tenant decides).
 *
 * Every write is its own confirmed act through `FeatureSelectionService` (D-BB-9/spec §19):
 * `enableBlock` and `disableBlock` are separate callable verbs, each with its own dry run and
 * its own confirmation. There is no longer a checkbox list with one global Save — that shape
 * is what made this screen dangerous: an admin who unticked a box (or simply never re-ticked
 * one after a hard reload) could save and silently strip a hand-curated menu's rows. Nothing
 * here can do that any more. Switching a block off does not remove its menu rows either — it
 * only hides them (`disableBlock`'s own doc comment); the confirmation before that write says
 * so explicitly.
 *
 * A block row shows ONE of five states (`blockState`): `core` (never switchable), `withheld`
 * (rollout does not offer it), `required` (another RUNNING block depends on it — see
 * `holdersOf`, no «Ausschalten»), `on` and `off`. `required` exists because enablement is
 * stored flat but read dependency-closed: without it, `subject` under a running `calevent`
 * offered an «Ausschalten» that removed the stored entry, changed nothing visible, and left
 * no way back in.
 *
 * `enabledFeatures === undefined` still means "every non-internal block is on" (D-BB-10) —
 * that reading is unconditional and does not depend on this screen, so it needs no seeding
 * or settlement gate here any more: `liveBlocks` recomputes it straight from
 * `AppStore.appConfig()` on every render, the same way `FeatureStore.effective()` does, and
 * every verb round-trips through the server before anything is written.
 */
@Component({
  selector: 'okr-feature-picker',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    SvgIconPipe, ListFilter,
    IonHeader, IonToolbar, IonButtons, IonMenuButton, IonTitle, IonButton, IonIcon,
    IonContent, IonList, IonItemGroup, IonItemDivider, IonItem, IonLabel, IonNote,
    IonSegment, IonSegmentButton, IonGrid, IonRow, IonCol,
  ],
  template: `
    <ion-header>
      <ion-toolbar color="secondary">
        <ion-buttons slot="start"><ion-menu-button /></ion-buttons>
        <ion-title>{{ i18n.title() }}</ion-title>
        <ion-buttons slot="end">
          <ion-button (click)="onHelp()" title="{{ i18n.help_button() }}">
            <ion-icon slot="icon-only" src="{{ 'info-circle' | svgIcon }}" />
          </ion-button>
        </ion-buttons>
      </ion-toolbar>
      <ion-toolbar>
        <ion-segment [value]="segment()" (ionChange)="onSegmentChange($event)">
          <ion-segment-button value="blocks">
            <ion-label>{{ i18n.segment_blocks() }}</ion-label>
          </ion-segment-button>
          <ion-segment-button value="rows">
            <ion-label>{{ i18n.segment_rows() }}</ion-label>
          </ion-segment-button>
        </ion-segment>
      </ion-toolbar>
      @if (segment() === 'rows') {
        <okr-list-filter
          [types]="menuActions()"
          [selectedType]="selectedAction()"
          (searchTermChanged)="searchTerm.set($event)"
          (typeChanged)="selectedAction.set($event)" />
      }
    </ion-header>

    <ion-content>
      @if (segment() === 'blocks') {
        <ion-list>
          <ion-item-group>
            <ion-item-divider>
              <ion-icon slot="start" src="{{ 'category' | svgIcon }}" />
              <ion-label>{{ i18n.profiles_title() }}</ion-label>
            </ion-item-divider>
            @for (profile of profiles; track profile.id) {
              <ion-item
                button [detail]="false"
                [class.active]="isActiveProfile(profile)"
                (click)="onApplyProfile(profile)">
                <ion-icon slot="start" src="{{ profile.icon | svgIcon }}" />
                <ion-label class="ion-text-wrap">
                  {{ profileLabels[profile.id]?.() || profile.id }}
                  <p>{{ profileDescriptions[profile.id]?.() || '' }}</p>
                </ion-label>
              </ion-item>
            }
            @if (highlighted().size > 0) {
              <ion-item lines="none">
                <ion-note class="ion-text-wrap">{{ i18n.profile_highlight_note() }}</ion-note>
              </ion-item>
            }
          </ion-item-group>

          @for (group of bundleGroups; track group.bundle.id) {
            @if (group.blocks.length > 0) {
              <ion-item-group>
                <ion-item-divider>
                  <ion-icon slot="start" src="{{ group.bundle.icon | svgIcon }}" />
                  <ion-label>{{ bundleLabels[group.bundle.id]?.() || group.bundle.id }}</ion-label>
                </ion-item-divider>
                @for (block of group.blocks; track block.id) {
                  <ion-item [class.highlighted]="isHighlighted(block)">
                    <ion-icon slot="start" src="{{ block.icon | svgIcon }}" />
                    <ion-label class="ion-text-wrap">{{ blockLabels[block.id]?.() || block.id }}</ion-label>
                    <ion-note slot="end" class="ion-text-wrap">{{ noteOf(block) }}</ion-note>
                    @switch (blockState(block)) {
                      @case ('off') {
                        <ion-button slot="end" fill="outline" (click)="onEnable(block)">
                          {{ i18n.enable_button() }}
                        </ion-button>
                      }
                      @case ('on') {
                        @if (missingRowCount(block) > 0) {
                          <ion-button slot="end" fill="outline" (click)="onEnable(block)">
                            {{ i18n.complete_menu_button() }}
                          </ion-button>
                        }
                        <ion-button slot="end" fill="clear" (click)="onDisable(block)">
                          {{ i18n.disable_button() }}
                        </ion-button>
                      }
                      @case ('required') {
                        @if (!isStored(block)) {
                          <ion-button slot="end" fill="outline" (click)="onEnable(block)">
                            {{ i18n.enable_button() }}
                          </ion-button>
                        } @else if (missingRowCount(block) > 0) {
                          <ion-button slot="end" fill="outline" (click)="onEnable(block)">
                            {{ i18n.complete_menu_button() }}
                          </ion-button>
                        }
                      }
                    }
                  </ion-item>
                }
              </ion-item-group>
            }
          }
        </ion-list>
      } @else {
        @if (rows().length === 0) {
          <ion-list>
            <ion-item lines="none">
              <ion-label class="ion-text-wrap">{{ i18n.segment_rows_placeholder() }}</ion-label>
            </ion-item>
          </ion-list>
        } @else if (filteredRows().length === 0) {
          <ion-list>
            <ion-item lines="none">
              <ion-label class="ion-text-wrap">{{ i18n.rows_filter_empty() }}</ion-label>
            </ion-item>
          </ion-list>
        } @else {
          <ion-grid class="rows-table">
            <ion-row class="head-row">
              <ion-col size-md="6"><strong>{{ i18n.rows_col_menu() }}</strong></ion-col>
              <ion-col size-md="3"><strong>{{ i18n.rows_col_role() }}</strong></ion-col>
              <ion-col size-md="3"><strong>{{ i18n.rows_col_action() }}</strong></ion-col>
            </ion-row>
            @for (row of filteredRows(); track row.name) {
              <ion-row class="data-row" [style.opacity]="isDimmed(row) ? 0.6 : 1">
                <ion-col size="12" size-md="6" class="col-name" [style.padding-inline-start.rem]="row.depth * 1.5">
                  @if (row.state !== 'absent') {
                    <ion-button fill="clear" size="small" (click)="onCompare(row)">
                      <ion-icon slot="icon-only" src="{{ 'info-circle' | svgIcon }}" />
                    </ion-button>
                  }
                  {{ row.name }}
                </ion-col>
                <ion-col size="12" size-md="3" class="col-role">
                  <span class="stacked-label">{{ i18n.rows_col_role() }}:</span>
                  @switch (row.state) {
                    @case ('drifted') {
                      {{ row.roleNeededLive }} → {{ row.roleNeededCatalogue }}
                    }
                    @case ('pinned') {
                      {{ row.roleNeededLive }}
                      <ion-icon src="{{ 'lock-closed' | svgIcon }}" title="{{ i18n.rows_pinned_note() }}" />
                    }
                    @case ('absent') {
                      {{ i18n.rows_absent() }}
                    }
                    @default {
                      {{ row.roleNeededLive }}
                    }
                  }
                  @if (row.otherDrift.length > 0) {
                    <ion-note class="ion-text-wrap" title="{{ i18n.rows_other_drift() }}">
                      ≠ {{ row.otherDrift.join(', ') }}
                    </ion-note>
                  }
                </ion-col>
                <ion-col size="12" size-md="3" class="col-action">
                  @switch (row.state) {
                    @case ('drifted') {
                      <ion-button size="small" fill="outline" (click)="onApply(row)">
                        {{ i18n.rows_apply_button() }}
                      </ion-button>
                      <ion-button size="small" fill="outline" (click)="onPin(row)">
                        {{ i18n.rows_pin_button() }}
                      </ion-button>
                      <ion-button size="small" fill="clear" (click)="onAdjustCatalogue(row)">
                        {{ i18n.rows_adjust_catalogue_button() }}
                      </ion-button>
                    }
                    @case ('pinned') {
                      <span class="state-word">{{ i18n.rows_state_pinned() }}</span>
                      <ion-button size="small" fill="clear" (click)="onUnpin(row)">
                        {{ i18n.rows_unpin_button() }}
                      </ion-button>
                    }
                    @case ('absent') {
                      <ion-button size="small" fill="outline" (click)="onAddToMenu(row)">
                        {{ row.groupKeys.length > 1 ? i18n.rows_add_group_button() : i18n.rows_add_button() }}
                      </ion-button>
                    }
                    @case ('equal') {
                      @if (row.groupKeys.length === 0) {
                        <span class="state-word">{{ i18n.rows_state_equal() }}</span>
                      }
                    }
                    @case ('tenant-authored') {
                      @if (row.groupKeys.length === 0) {
                        <span class="state-word">{{ i18n.rows_state_tenant() }}</span>
                      }
                    }
                  }
                  @if (row.state !== 'absent' && row.groupKeys.length > 0) {
                    <ion-button size="small" fill="outline" (click)="onAddToMenu(row)">
                      {{ i18n.rows_add_group_button() }}
                    </ion-button>
                  }
                </ion-col>
              </ion-row>
            }
          </ion-grid>
        }
      }
    </ion-content>
  `,
  styles: [`
    .highlighted { --background: var(--ion-color-warning-tint); }
    .active { --background: var(--ion-color-light-shade); }

    /* Segment 2 renders a three-column table. Below the md breakpoint the columns stack, and a
       plain stack of untitled cells is unreadable — every row becomes an anonymous run of words
       (screenshot in the 7.25.0 report). So: a rule under every row so one row is visibly one
       record, an inline «Rolle:» label that only appears once the columns are stacked, and no
       header row at all when there are no columns left for it to head. */
    .rows-table { padding-inline: 8px; }
    .head-row {
      border-bottom: 1px solid var(--ion-color-medium);
      padding-block-end: 4px;
    }
    .data-row {
      align-items: center;
      border-bottom: 1px solid var(--ion-color-light-shade);
    }
    .col-name { display: flex; align-items: center; gap: 4px; }
    .col-role { color: var(--ion-color-medium-shade); }
    .stacked-label { display: none; }
    /* A row with nothing to do says so in a word instead of offering a button that can only
       ever answer "nichts zu übernehmen" — a faint outline button reads as disabled, invites
       the click anyway, and then explains nothing. */
    .state-word { color: var(--ion-color-medium-shade); font-style: italic; }

    @media (max-width: 767px) {
      .head-row { display: none; }
      .data-row { padding-block: 6px; }
      .col-name { font-weight: 500; }
      .col-role, .col-action { padding-inline-start: 8px; }
      .stacked-label { display: inline; color: var(--ion-color-medium); margin-inline-end: 4px; }
    }
  `],
})
export class FeaturePicker {
  private readonly appStore = inject(AppStore);
  private readonly rolloutService = inject(FeatureRolloutService);
  private readonly featureSelectionService = inject(FeatureSelectionService);
  private readonly i18nService = inject(I18nService);
  private readonly alertService = inject(AlertService);
  private readonly menuService = inject(MenuService);
  private readonly modalController = inject(ModalController);

  protected readonly catalogue: FeatureBlock[] = FEATURE_BLOCKS;
  protected readonly bundles = FEATURE_BUNDLES;
  protected readonly profiles = FEATURE_PROFILES;

  protected readonly i18n = this.i18nService.translateAll(FEATURE_PICKER_I18N_KEYS);

  // Block/bundle labels are resolved dynamically from the catalogue (which grows with Tasks
  // 12-18) rather than hand-listed — `translateAll` over a record built from `label` fields
  // that are themselves static i18n keys, so this is still the store-driven static pattern,
  // not a `TranslatePipe`/data-driven case.
  protected readonly blockLabels = this.i18nService.translateAll(
    Object.fromEntries(this.catalogue.map(block => [block.id, block.label])));
  /**
   * Caveats shown under a block and repeated when it is switched on. Only blocks that declare
   * `remarks` appear here, so the record is usually near-empty.
   */
  protected readonly blockRemarks = this.i18nService.translateAll(
    Object.fromEntries(this.catalogue
      .filter(block => block.remarks !== undefined)
      .map(block => [block.id, block.remarks as string])));
  protected readonly bundleLabels = this.i18nService.translateAll(
    Object.fromEntries(this.bundles.map(bundle => [bundle.id, bundle.label])));
  protected readonly profileLabels = this.i18nService.translateAll(
    Object.fromEntries(this.profiles.map(profile => [profile.id, profile.label])));
  protected readonly profileDescriptions = this.i18nService.translateAll(
    Object.fromEntries(this.profiles.map(profile => [profile.id, profile.description])));

  private readonly rollouts = toSignal(this.rolloutService.list(), { initialValue: [] as FeatureRolloutModel[] });
  private readonly tenantId = computed(() => this.appStore.tenantId());

  /** Tenant-scoped (`MenuService.list()` filters by `tenantId`) — used only to tell whether
   *  a block's menu row is already reachable in THIS tenant's menu. */
  private readonly menuDocs = toSignal(this.menuService.list(), { initialValue: [] as MenuItemModel[] });
  private readonly menuDocNames = computed(() => new Set(this.menuDocs().map(doc => doc.name)));

  /** The blocks that are LIVE for this tenant right now — the single source for the
   *  on/off half of `blockState`. Mirrors `FeatureStore.effective()`. */
  private readonly liveBlocks = computed(() => effectiveFeatures({
    catalogue: this.catalogue,
    rollouts: this.rollouts(),
    // NOT coalesced to [] — undefined means "every non-internal block" (D-BB-10).
    enabled: this.appStore.appConfig()?.enabledFeatures,
    tenantId: this.tenantId(),
  }));

  /**
   * What `enabledFeatures` actually STORES — the set `enableBlock`/`disableBlock` write, before
   * the dependency closure `liveBlocks` applies on top. The two must be read apart: a block can
   * be absent here and still run, because a stored block depends on it. Reading only
   * `liveBlocks` is what used to show «Ausschalten» on a block whose stored entry was already
   * gone, where the click then committed nothing (see `holdersOf`).
   *
   * `undefined` means "every non-internal block" (D-BB-10), exactly as `effectiveEnabled`
   * reads it server-side — a legacy config with no field is not an empty selection.
   */
  private readonly storedBlocks = computed(() => {
    const stored = this.appStore.appConfig()?.enabledFeatures;
    return new Set(stored
      ?? this.catalogue.filter(block => block.defaultAvailability !== 'internal').map(block => block.id));
  });

  protected readonly availability = computed<Map<string, AvailabilityVerdict>>(() => {
    const rolloutById = new Map(this.rollouts().map(rollout => [rollout.okey, rollout]));
    return new Map(this.catalogue.map(block =>
      [block.id, resolveAvailability(block, rolloutById.get(block.id), this.tenantId())]));
  });

  protected readonly bundleGroups = this.bundles.map(bundle => ({
    bundle,
    blocks: this.catalogue.filter(block => block.bundle === bundle.id),
  }));

  protected readonly segment = signal<PickerSegment>('blocks');

  // ── Segment 2 filters ─────────────────────────────────────────────────────────────────
  // Same two filters the ordinary menu list offers (`MenuList`): a free-text search over the
  // menu NAME — the only identifier this table shows and the one an admin arrives with from
  // a «Missing: x» in the sidebar — and the `menu_action` category as the type filter, so
  // "show me every context menu" or "every toolbar action" is one click. `all` is the
  // `okr-cat-select` «withAll» sentinel, i.e. no type filter.
  protected readonly searchTerm = signal('');
  protected readonly selectedAction = signal('all');
  protected readonly menuActions = computed<CategoryListModel>(() => this.appStore.getCategory('menu_action'));

  // ── Segment 2 (Menüzeilen) ────────────────────────────────────────────────────────────
  // The blocks currently enabled — segment 2's whole tree is scoped to these; a disabled
  // block's menu is not something the tenant is "missing" (`buildMenuTree`'s own doc
  // comment).
  private readonly enabledBlockObjs = computed(() =>
    this.catalogue.filter(block => this.liveBlocks().has(block.id)));

  /** Every enabled block's own `MenuSpec` tree, flattened one level (children stay nested
   *  under `.children` — both `findStructuralDrift` and the index below recurse). */
  private readonly enabledSpecs = computed(() => this.enabledBlockObjs().flatMap(block => block.menu));

  /** Live menu docs indexed by `name` (not doc id) — the shape both `findStructuralDrift`
   *  and `buildMenuTree` require. `menuDocs` is already tenant-scoped. */
  private readonly menuByName = computed(() => indexMenuDocsByName(
    this.menuDocs().map(doc => ({ id: doc.okey, data: doc })), this.tenantId(),
  ).byName);

  private readonly menuDrift = computed(() => findStructuralDrift(this.enabledSpecs(), this.menuByName()));
  private readonly driftByName = computed(() => new Map(this.menuDrift().map(entry => [entry.name, entry])));

  /** First `MenuSpec` declaring each name — `MenuCompareModal`'s catalogue-side column. */
  private readonly specByName = computed(() => {
    const map = new Map<string, MenuSpec>();
    const index = (specs: MenuSpec[]): void => {
      for (const spec of specs) {
        if (!map.has(spec.name)) map.set(spec.name, spec);
        if (spec.children && spec.children.length > 0) index(spec.children);
      }
    };
    for (const block of this.enabledBlockObjs()) index(block.menu);
    return map;
  });

  /** The flat, depth-annotated row list the table renders directly (Task 9's `buildMenuTree`). */
  protected readonly rows = computed<MenuTreeRow[]>(() => buildMenuTree({
    rootKey: `main_${this.tenantId()}`,
    existing: this.menuByName(),
    drift: this.menuDrift(),
    enabledBlocks: this.enabledBlockObjs(),
  }));

  /** What the table actually renders — `rows()` narrowed by the toolbar. A match keeps its
   *  ancestors, so the indentation still reads as a tree rather than as a flat run. */
  protected readonly filteredRows = computed<MenuTreeRow[]>(() =>
    filterMenuRows(this.rows(), this.searchTerm(), this.selectedAction()));

  /**
   * Which blocks a profile would add — proposal 6, rebuilt for the additive model. It used to
   * tick checkboxes toward a global Save; there is no save any more, so this only HIGHLIGHTS
   * the blocks and leaves every write to the per-block «Einschalten» button. `activeProfile`
   * tracks which profile (if any) produced the current highlight, purely so clicking it again
   * clears it — the highlight is not itself an act, so it needs an easy way back to nothing.
   */
  private readonly activeProfile = signal<string | undefined>(undefined);
  protected readonly highlighted = computed<ReadonlySet<string>>(() => {
    const id = this.activeProfile();
    if (!id) return new Set();
    const profile = this.profiles.find(p => p.id === id);
    return profile ? new Set(resolveWithDeps(this.catalogue, profile.blocks)) : new Set();
  });

  protected onSegmentChange(event: CustomEvent): void {
    this.segment.set(event.detail.value as PickerSegment);
  }

  protected isActiveProfile(profile: FeatureProfile): boolean {
    return this.activeProfile() === profile.id;
  }

  protected onApplyProfile(profile: FeatureProfile): void {
    this.activeProfile.set(this.isActiveProfile(profile) ? undefined : profile.id);
  }

  protected isHighlighted(block: FeatureBlock): boolean {
    return this.highlighted().has(block.id);
  }

  /**
   * How many of a block's catalogue rows are NOT in this tenant's menu — the gate on
   * «Menü ergänzen».
   *
   * Being enabled and having menu rows are two independent facts: `enabledFeatures` only says
   * a block MAY appear, the `menuItems` documents are what makes it appear, and only
   * `enableBlock`/`addMenuRows` ever write those. A block can therefore be on and still
   * contribute nothing to the menu — the ordinary state of a freshly provisioned tenant, where
   * `enabledFeatures === undefined` reads as "every non-internal block is on" (D-BB-10) before
   * a single row exists. Such a block used to offer «Ausschalten» and nothing else, so the one
   * button that writes the missing rows was unreachable, and applying a profile appeared to do
   * nothing at all. `enableBlock` is idempotent (`enabledFeatures` is a union, missing rows are
   * planned either way), so «Menü ergänzen» is just `onEnable` under a name that tells the
   * admin what it is for here.
   */
  private readonly missingRowCounts = computed<ReadonlyMap<string, number>>(() => {
    const names = this.menuDocNames();
    return new Map(this.catalogue.map(block =>
      [block.id, menuOutlineOf(block).filter(row => !names.has(row.name)).length]));
  });

  protected missingRowCount(block: FeatureBlock): number {
    return this.missingRowCounts().get(block.id) ?? 0;
  }

  /** The running blocks that depend on this one — empty for a block free to switch off. */
  protected holders(block: FeatureBlock): string[] {
    return holdersOf(this.catalogue, block.id, this.liveBlocks());
  }

  /** Is the block written into `enabledFeatures` in its own right, rather than only pulled
   *  in by a dependent? Decides which button a `'required'` row offers. */
  protected isStored(block: FeatureBlock): boolean {
    return this.storedBlocks().has(block.id);
  }

  /**
   * core / withheld / required / on / off — see the class doc comment for what each means.
   *
   * `'required'` is checked BEFORE the stored/live question and outranks both: as long as a
   * running block depends on this one, switching it off cannot take effect, so the row must
   * not offer «Ausschalten» at all. It says who holds it instead (`noteOf`), which is the one
   * piece of information that turns the dead end into a next step.
   */
  protected blockState(block: FeatureBlock): 'on' | 'off' | 'withheld' | 'core' | 'required' {
    if (block.core === true) return 'core';
    const verdict = this.availability().get(block.id);
    if (verdict && !verdict.offered) return 'withheld';
    if (this.liveBlocks().has(block.id) && this.holders(block).length > 0) return 'required';
    return this.storedBlocks().has(block.id) && this.liveBlocks().has(block.id) ? 'on' : 'off';
  }

  /** Bundle, block id, and — where relevant — the reason a block has no button at all. */
  protected noteOf(block: FeatureBlock): string {
    const parts = [this.bundleLabels[block.bundle]?.() || block.bundle, block.id];
    switch (this.blockState(block)) {
      case 'core':
        parts.push(this.i18n.core_note());
        break;
      case 'withheld': {
        const verdict = this.availability().get(block.id);
        parts.push(verdict && verdict.reason.length > 0 ? verdict.reason : this.i18n.unavailable_reason_fallback());
        break;
      }
      case 'required':
        parts.push(fill(this.i18n.required_note(), {
          blocks: this.holders(block).map(id => this.blockLabels[id]?.() || id).join(', '),
        }));
        break;
      default: {
        const remark = this.blockRemarks[block.id]?.();
        if (remark) parts.push(remark);
      }
    }
    return parts.join(' · ');
  }

  /** The block's own menu outline, filtered to the rows already reachable in this tenant's
   *  live menu — `BlockEnableModal`'s `alreadyPresent` input. */
  private alreadyPresentKeysOf(block: FeatureBlock): string[] {
    const names = this.menuDocNames();
    return menuOutlineOf(block).filter(row => names.has(row.name)).map(row => row.key);
  }

  /**
   * «Einschalten» — dry-run `enableBlock` with every row of the block's own menu tree
   * offered, then let `BlockEnableModal` show the admin exactly what that dry run would do
   * and take their whitelist back. The modal IS the confirmation: there is no second dialog
   * in front of it.
   */
  protected async onEnable(block: FeatureBlock): Promise<void> {
    const tenantId = this.tenantId();
    const allKeys = menuOutlineOf(block).map(row => row.key);

    let preview: ApplyPlanPreview;
    try {
      preview = (await this.featureSelectionService.enableBlock(
        tenantId, block.id, allKeys, { dryRun: true })).preview;
    } catch (error) {
      this.alertService.error(`FeaturePicker.onEnable(dryRun): ${error}`);
      return;
    }

    const alsoBlocks = preview.alsoEnabled
      .map(entry => this.catalogue.find(candidate => candidate.id === entry.id))
      .filter((candidate): candidate is FeatureBlock => candidate !== undefined);

    const modal = await this.modalController.create({
      component: BlockEnableModal,
      componentProps: {
        block, alsoBlocks, preview, alreadyPresent: this.alreadyPresentKeysOf(block), i18n: this.i18n,
      },
    });
    await modal.present();
    const { data, role } = await modal.onDidDismiss<BlockEnableResult>();
    if (role !== 'confirm' || !data) return;

    try {
      const result = await this.featureSelectionService.enableBlock(tenantId, block.id, data.menuKeys);
      if (result.preview.withheld.length > 0) {
        const names = result.preview.withheld
          .map(entry => `${this.blockLabels[entry.id]?.() || entry.id} (${entry.reason})`)
          .join('; ');
        const message = await this.translateOrFallback(FEATURE_PICKER_I18N_KEYS.withheld_toast, { blocks: names }, names);
        await this.alertService.showToast(message);
      } else {
        const name = this.blockLabels[block.id]?.() || block.id;
        const message = await this.translateOrFallback(FEATURE_PICKER_I18N_KEYS.enabled_toast, { block: name }, name);
        await this.alertService.showToast(message);
      }
    } catch (error) {
      this.alertService.error(`FeaturePicker.onEnable: ${error}`);
    }
  }

  /**
   * «Ausschalten» — a single confirmed act, no dry run needed: `disableBlock` only ever
   * removes one id from `enabledFeatures` and touches no menu document (its own doc comment
   * on the functions side). The confirmation says so plainly, because the old checkbox model
   * trained admins to expect a save here to strip rows — it no longer can.
   */
  protected async onDisable(block: FeatureBlock): Promise<void> {
    const name = this.blockLabels[block.id]?.() || block.id;
    const message = await this.translateOrFallback(FEATURE_PICKER_I18N_KEYS.disable_confirm, { block: name }, name);
    if (!await this.alertService.confirm(message, true)) return;

    try {
      await this.featureSelectionService.disableBlock(this.tenantId(), block.id);
      const toast = await this.translateOrFallback(FEATURE_PICKER_I18N_KEYS.disabled_toast, { block: name }, name);
      await this.alertService.showToast(toast);
    } catch (error) {
      this.alertService.error(`FeaturePicker.onDisable: ${error}`);
    }
  }

  // ── Segment 2 (Menüzeilen) — actions ─────────────────────────────────────────────────
  protected isDimmed(row: MenuTreeRow): boolean {
    return row.state === 'absent' || row.state === 'tenant-authored';
  }

  /** «(i)» on a row — opens `MenuCompareModal`, which reads across every field of the live
   *  document, not just the two shown in the table. Nothing to open for an `absent` row —
   *  it has no document yet. The modal has no shared-original input: the fork's original
   *  lives outside this tenant's scope and `MenuService.list()` cannot resolve it
   *  client-side, and a column that can never resolve is worse than no column (task 11
   *  review round 1) — the modal shows a plain note on a forked document instead. */
  protected async onCompare(row: MenuTreeRow): Promise<void> {
    const doc = this.menuByName().get(row.name);
    if (!doc) return;
    const modal = await this.modalController.create({
      component: MenuCompareModal,
      componentProps: { doc, spec: this.specByName().get(row.name), i18n: this.i18n },
    });
    await modal.present();
  }

  protected async onHelp(): Promise<void> {
    const modal = await this.modalController.create({
      component: PickerHelpModal,
      componentProps: { i18n: this.i18n },
    });
    await modal.present();
  }

  /** «Übernehmen» — the catalogue's value is right; write it into every non-pinned field
   *  this row is drifting on. */
  protected async onApply(row: MenuTreeRow): Promise<void> {
    const fields = actionableFieldsOf(this.driftByName().get(row.name));
    await this.runFieldAction(
      row, fields,
      (field, options) => this.featureSelectionService.applyCatalogueValue(this.tenantId(), row.docId, field, options),
      this.i18n.rows_apply_toast(),
    );
  }

  /** «Fixieren» — my value is right, for me; pin every non-pinned drifting field so the
   *  catalogue stops writing it and the drift report stops reporting it. */
  protected async onPin(row: MenuTreeRow): Promise<void> {
    const fields = actionableFieldsOf(this.driftByName().get(row.name));
    await this.runFieldAction(
      row, fields,
      (field, options) => this.featureSelectionService.pinField(this.tenantId(), row.docId, field, options),
      this.i18n.rows_pin_toast(),
    );
  }

  /** «Lösen» on a `pinned` row — release every structural field this document owns back
   *  to the catalogue. Reads `ownedFields` straight off the live document: a `pinned` row
   *  only tells us EVERY differing field is pinned, not which ones, so the document itself
   *  is the source of truth here. */
  protected async onUnpin(row: MenuTreeRow): Promise<void> {
    const doc = this.menuByName().get(row.name);
    const fields = doc ? pinnedFieldsOf(doc) : [];
    await this.runFieldAction(
      row, fields,
      (field, options) => this.featureSelectionService.unpinField(this.tenantId(), row.docId, field, options),
      this.i18n.rows_unpin_toast(),
    );
  }

  /**
   * «Ins Menü» / «Gruppe ergänzen» — attach the catalogue's row (D-BB-14: offered once,
   * never re-asserted if the admin declines it now), together with every `absent` row in its
   * own subtree. That group is what makes a page usable rather than merely present: adding
   * `calevent-all` alone leaves it without its `c-calevents` context menu, and adding that
   * context menu without `calevent-add`/`filter-toggle` leaves an empty popover. The keys are
   * the ones the table shows indented below the row, so the button can never add something
   * the admin cannot see, and `planRowsByKey` skips any key an ancestor in the same call
   * already carries.
   *
   * The button only appears when `groupKeys` is non-empty, so this can no longer be the path
   * that answers "es gibt nichts zu übernehmen" on a row that was never missing in the first
   * place — that was `buildMenuTree` reporting every context menu as absent (see its doc
   * comment), not a plan that came back empty.
   */
  protected async onAddToMenu(row: MenuTreeRow): Promise<void> {
    const tenantId = this.tenantId();
    const keys = row.groupKeys.length > 0 ? row.groupKeys : [row.name];
    let preview: ApplyPlanPreview;
    try {
      preview = (await this.featureSelectionService.addMenuRows(tenantId, keys, { dryRun: true })).preview;
    } catch (error) {
      this.alertService.error(`FeaturePicker.onAddToMenu(dryRun): ${error}`);
      return;
    }
    if (isEmptyPlan(preview)) {
      await this.alertService.showToast(this.i18n.rows_nothing_planned());
      return;
    }
    // One counted line per distinct sentence, never one sentence per row: a group add plans an
    // entry per row of the subtree, all of them usually carrying the SAME consequence.
    const message = summarizePlanConsequences(preview.entries, this.i18n);
    if (!await this.alertService.confirm(message, true)) return;

    try {
      await this.featureSelectionService.addMenuRows(tenantId, keys);
      await this.alertService.showToast(this.i18n.rows_add_toast());
    } catch (error) {
      this.alertService.error(`FeaturePicker.onAddToMenu: ${error}`);
    }
  }

  /** «Katalog anpassen» — my value is right for everyone; writes NOTHING (an admin cannot
   *  edit the catalogue, which is code) and needs no confirmation, only the toast that the
   *  patch note was copied. */
  protected async onAdjustCatalogue(row: MenuTreeRow): Promise<void> {
    const drift = this.driftByName().get(row.name);
    const fields = actionableFieldsOf(drift);
    if (!drift || fields.length === 0) return;
    await copyToClipboard(patchNoteFor(row, drift, fields));
    await this.alertService.showToast(this.i18n.rows_adjust_catalogue_toast());
  }

  /**
   * The shared dry-run → confirm → run → toast shape behind «Übernehmen», «Fixieren», and
   * «Lösen» — each acts on a SET of structural fields at once (one click resolves the whole
   * row, not one field at a time), so every field gets its own dry run first and only the
   * fields whose dry run actually plans something are confirmed and, on confirmation,
   * written. A field whose dry run comes back empty (e.g. it turned out already pinned, or
   * already equal, by the time this ran) is silently dropped rather than offered — exactly
   * the "the UI must not ask" rule for a pinned field, applied defensively even where the
   * caller believes the field is safe.
   */
  private async runFieldAction(
    row: MenuTreeRow,
    fields: StructuralField[],
    call: (field: StructuralField, options: { dryRun?: boolean }) => Promise<ApplyFeatureResponse>,
    toastMessage: string,
  ): Promise<void> {
    const planned: PlanEntry[] = [];
    const okFields: StructuralField[] = [];
    for (const field of fields) {
      try {
        const { preview } = await call(field, { dryRun: true });
        if (isEmptyPlan(preview)) continue;
        planned.push(...preview.entries);
        okFields.push(field);
      } catch (error) {
        this.alertService.error(`FeaturePicker.rowAction(dryRun ${row.name}.${field}): ${error}`);
      }
    }
    if (okFields.length === 0) {
      await this.alertService.showToast(this.i18n.rows_nothing_planned());
      return;
    }
    if (!await this.alertService.confirm(summarizePlanConsequences(planned, this.i18n), true)) return;

    for (const field of okFields) {
      try {
        await call(field, {});
      } catch (error) {
        this.alertService.error(`FeaturePicker.rowAction(${row.name}.${field}): ${error}`);
      }
    }
    await this.alertService.showToast(toastMessage);
  }

  /**
   * `I18nService.translate` degrades a failed scope load to `of('')` (see its doc comment) —
   * silently, by design, for ordinary chrome text. But `disable_confirm` gates a write behind
   * `AlertService.confirm`, and `AlertOptions.message` has no separate "content failed to
   * load" state: an empty string renders a real alert with NO message at all, just OK/Abbrechen
   * buttons. Never let that happen silently: fall back to the raw (untranslated) content, so
   * the worst case is a dialog naming the block id instead of its translated label, not a
   * content-free prompt.
   */
  private async translateOrFallback(
    key: string, params: Record<string, string | number>, fallback: string,
  ): Promise<string> {
    const message = await this.i18nService.translateOnce(key, params);
    return message.length > 0 ? message : fallback;
  }
}
