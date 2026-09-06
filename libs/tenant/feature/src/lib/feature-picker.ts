import { AsyncPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import type { CheckboxCustomEvent } from '@ionic/angular/standalone';
import {
  IonButton, IonButtons, IonCheckbox, IonContent, IonHeader, IonIcon, IonItem, IonItemDivider,
  IonItemGroup, IonLabel, IonList, IonMenuButton, IonNote, IonSpinner, IonTitle, IonToolbar,
} from '@ionic/angular/standalone';

import { AppStore } from '@okr/shared-feature';
import { I18nService, TranslatePipe } from '@okr/shared-i18n';
import { SvgIconPipe } from '@okr/shared-pipes';
import { AlertService, copyToClipboard } from '@okr/shared-util-angular';
import type { FeatureRolloutModel, MenuItemModel } from '@okr/shared-models';
import {
  FEATURE_BLOCKS, FEATURE_BUNDLES, FEATURE_PICKER_I18N_KEYS, FEATURE_PROFILES, effectiveFeatures,
  findStructuralDrift, indexMenuDocsByName, isEmptyPlan, planRootMenuOp, resolveAvailability,
  resolveWithDeps, rootNavKeys,
} from '@okr/tenant-util';
import type {
  ApplyPlanPreview, AvailabilityVerdict, FeatureBlock, FeatureProfile, MenuStructureDrift,
} from '@okr/tenant-util';
import { FeatureRolloutService, FeatureSelectionService } from '@okr/tenant-data-access';
import { MenuService } from '@okr/cms-menu-data-access';

import type { CataloguePlanComparison, MenuOutlineRow } from './feature-picker.util';
import {
  blocksRemovedBySave, comparePlanToDrift, escapeHtml, menuOutlineOf, menuReferencesByName,
  transitiveDependentsOf,
} from './feature-picker.util';

/**
 * The admin-facing feature-block picker — lets a tenant admin choose which catalogue blocks
 * are on, grouped by bundle (spec 2026-08-01-feature-building-blocks-design.md, Task 11).
 *
 * All writes go through `FeatureSelectionService.apply` (D-BB-9) — this component never
 * touches `enabledFeatures` or `menuItems` directly. It only ever sends the raw ticked-block
 * ids; the callable is the one that resolves dependencies and rewrites the menu server-side.
 *
 * ⚠️ THE reason this component exists, not just a checkbox list: `enabledFeatures` is
 * `undefined` on every tenant that has never used this screen, and `undefined` deliberately
 * means "every non-internal block is on" (D-BB-10). The very first save persists an EXPLICIT
 * list, so any block left unticked has its menu keys stripped from that tenant's root menu
 * document — on a hand-curated menu (scs today: 26 entries), a careless first save wipes most
 * of it. Two independent safety nets, both required, neither a substitute for the other:
 *  1. the checkbox state is seeded, once, from `appConfig()?.enabledFeatures` verbatim
 *     (`undefined` → every non-internal block, the literal D-BB-10 rule) — see the
 *     constructor's doc comment for why that seed is gated on `appConfigResource` having
 *     actually settled, not merely on `appConfig()` being readable (it's always readable);
 *  2. regardless of how the checkboxes got into their current state, `onSave` independently
 *     recomputes (`blocksRemovedBySave`, in `feature-picker.util.ts`) what would be live AFTER
 *     the save and, if that set is smaller than what is live now, blocks the write behind a
 *     confirmation naming exactly what disappears. This is what catches a legacy tenant's
 *     first save even when nothing looks "changed" from the admin's point of view (e.g. a
 *     picker bug or a partial catalogue leaves the seed incomplete) — belt AND suspenders,
 *     not either/or. `blocksRemovedBySave` takes a single `rollouts` snapshot for both its
 *     before/after computation on purpose (see its own doc comment).
 */
@Component({
  selector: 'okr-feature-picker',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    AsyncPipe, SvgIconPipe, TranslatePipe,
    IonHeader, IonToolbar, IonButtons, IonMenuButton, IonTitle, IonButton, IonIcon, IonSpinner,
    IonContent, IonList, IonItemGroup, IonItemDivider, IonItem, IonLabel, IonCheckbox, IonNote,
  ],
  template: `
    <ion-header>
      <ion-toolbar color="secondary">
        <ion-buttons slot="start"><ion-menu-button /></ion-buttons>
        <ion-title>{{ i18n.title() }}</ion-title>
        <ion-buttons slot="end">
          <ion-button fill="clear" (click)="onCancel()" [disabled]="isSaving()">
            {{ i18n.cancel() }}
          </ion-button>
          <ion-button fill="solid" (click)="onSave()" [disabled]="isSaving()">
            @if (isSaving()) {
              <ion-spinner name="dots" />
            } @else {
              {{ i18n.save() }}
            }
          </ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>

    <ion-content>
      <ion-list>
        @if (drift().length > 0) {
          <ion-item-group>
            <ion-item-divider color="warning">
              <ion-icon slot="start" src="{{ 'alert-circle' | svgIcon }}" />
              <ion-label>{{ i18n.drift_title() }}</ion-label>
              <ion-button slot="end" fill="clear" (click)="onKeepLive()" [disabled]="isSaving()">
                {{ i18n.drift_keep_live() }}
              </ion-button>
              <ion-button slot="end" fill="clear" (click)="onApplyStructure()" [disabled]="isSaving()">
                {{ i18n.drift_apply() }}
              </ion-button>
            </ion-item-divider>
            <ion-item lines="none">
              <ion-note class="ion-text-wrap">
                {{ i18n.drift_note() }}
                <br /><br />
                <strong>{{ i18n.drift_forked() }}</strong> — {{ i18n.drift_legend_forked() }}
                <br />
                <strong>{{ i18n.drift_edited() }}</strong> — {{ i18n.drift_legend_edited() }}
              </ion-note>
            </ion-item>
            @for (row of driftRows(); track row.docId + row.field) {
              <ion-item>
                <ion-label class="ion-text-wrap">
                  {{ row.name }}
                  <p class="drift-direction">
                    {{ row.field }} —
                    {{ i18n.drift_col_live() }}: <strong>{{ row.live || '—' }}</strong>
                    &nbsp;·&nbsp;
                    {{ i18n.drift_col_catalogue() }}: <strong>{{ row.catalogue }}</strong>
                  </p>
                  <p class="drift-origin">
                    @if (row.blocks) {
                      {{ i18n.drift_owner() }}: <strong>{{ row.blocks }}</strong>&nbsp;·&nbsp;
                    }
                    @if (row.parents) {
                      {{ i18n.drift_parent() }}: <strong>{{ row.parents }}</strong>&nbsp;·&nbsp;
                    }
                    {{ i18n.drift_doc() }}: <strong>{{ row.docId }}</strong>
                  </p>
                </ion-label>
                <ion-note slot="end">
                  {{ row.forked ? i18n.drift_forked() : i18n.drift_edited() }}
                </ion-note>
              </ion-item>
            }
          </ion-item-group>
        }
        <ion-item-group>
          <ion-item-divider>
            <ion-icon slot="start" src="{{ 'category' | svgIcon }}" />
            <ion-label>{{ i18n.profiles_title() }}</ion-label>
          </ion-item-divider>
          @for (profile of profiles; track profile.id) {
            <ion-item button [detail]="false" [disabled]="isSaving()" (click)="onApplyProfile(profile)">
              <ion-icon slot="start" src="{{ profile.icon | svgIcon }}" />
              <ion-label class="ion-text-wrap">
                {{ profileLabels[profile.id]?.() || profile.id }}
                <p>{{ profileDescriptions[profile.id]?.() || '' }}</p>
              </ion-label>
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
                <ion-item>
                  <ion-icon slot="start" src="{{ block.icon | svgIcon }}" />
                  <ion-checkbox
                    slot="start"
                    [checked]="isChecked(block)"
                    [disabled]="isDisabled(block)"
                    (ionChange)="onToggle(block, $event)">
                    <ion-label>{{ blockLabels[block.id]?.() || block.id }}</ion-label>
                  </ion-checkbox>
                  @if (reasonOf(block); as reason) {
                    <ion-note slot="end" class="ion-text-wrap">{{ reason }}</ion-note>
                  }
                  <ion-button
                    slot="end"
                    fill="clear"
                    [title]="i18n.details_title()"
                    (click)="onToggleDetails(block)">
                    <ion-icon
                      slot="icon-only"
                      src="{{ (isDetailsOpen(block) ? 'chevron-up' : 'chevron-down') | svgIcon }}" />
                  </ion-button>
                </ion-item>
                @if (isDetailsOpen(block)) {
                  <ion-item lines="none" class="details">
                    <ion-label class="ion-text-wrap">
                      <p class="details-head">
                        {{ i18n.details_block_id() }}: <strong>{{ block.id }}</strong>
                      </p>
                      @if (outlineOf(block).length === 0) {
                        <p>{{ i18n.details_no_menu() }}</p>
                      } @else {
                        <p class="details-head">{{ i18n.details_title() }}</p>
                        @for (row of outlineOf(block); track $index) {
                          <p class="menu-row" [style.padding-left.em]="row.depth">
                            <span class="menu-label">{{ (row.labelKey | translate | async) || row.name }}</span>
                            <span class="menu-url">{{ row.url || row.action }}</span>
                            <span class="menu-meta">{{ row.name }} · {{ row.action }} · {{ row.roleNeeded }}</span>
                          </p>
                        }
                      }
                    </ion-label>
                  </ion-item>
                }
                @if (remarkOf(block); as remark) {
                  <ion-item lines="none" class="remark">
                    <ion-note class="ion-text-wrap">{{ remark }}</ion-note>
                  </ion-item>
                }
              }
            </ion-item-group>
          }
        }
      </ion-list>
    </ion-content>
  `,
  styles: [`
    .details { --background: var(--ion-color-light); }
    .drift-origin { opacity: 0.7; }
    .menu-row { display: flex; flex-wrap: wrap; gap: 0 0.6em; align-items: baseline; }
    .menu-label { font-weight: 500; }
    .menu-url { font-family: monospace; }
    .menu-meta { opacity: 0.6; font-size: 0.85em; }
  `],
})
export class FeaturePicker {
  private readonly appStore = inject(AppStore);
  private readonly rolloutService = inject(FeatureRolloutService);
  private readonly featureSelectionService = inject(FeatureSelectionService);
  private readonly i18nService = inject(I18nService);
  private readonly alertService = inject(AlertService);
  private readonly menuService = inject(MenuService);

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

  private readonly menuDocs = toSignal(this.menuService.list(), { initialValue: [] as MenuItemModel[] });

  /**
   * The blocks that are LIVE for this tenant right now — not `selection()`, which may hold
   * unsaved ticks. Mirrors `FeatureStore.effective()` on the picker's own inputs rather than
   * injecting that store, so the drift warning describes the deployed state and the
   * «Katalog-Werte übernehmen» button can never enable or disable anything as a side effect.
   */
  private readonly liveBlocks = computed(() => effectiveFeatures({
    catalogue: this.catalogue,
    rollouts: this.rollouts(),
    // NOT coalesced to [] — undefined means "every non-internal block" (D-BB-10).
    enabled: this.appStore.appConfig()?.enabledFeatures,
    tenantId: this.tenantId(),
  }));

  /**
   * Menu documents of the live blocks whose `url`/`action`/`roleNeeded` no longer match the
   * catalogue — design §5's missing half. A fork (D-BB-8) is the expected cause: once a tenant
   * edits a shared menu item, later catalogue structural fixes land on the shared original the
   * tenant has been detached from, and nothing else would ever tell them.
   *
   * `indexMenuDocsByName`'s ambiguous names are ignored on purpose: an unresolvable name is a
   * data problem for `applyFeatureSelection` to refuse loudly at write time, not something to
   * dress up as "your structure is outdated" on a read-only screen.
   */
  protected readonly drift = computed<MenuStructureDrift[]>(() => {
    const live = new Set(this.liveBlocks());
    const specs = this.catalogue.filter(block => live.has(block.id)).flatMap(block => block.menu);
    // `indexMenuDocsByName` takes the Firestore-snapshot shape ({id, data}); `MenuService.list`
    // already re-attached `okey`, so the id is the doc's own key.
    const { byName } = indexMenuDocsByName(
      this.menuDocs().map(doc => ({ id: doc.okey, data: doc })), this.tenantId());
    return findStructuralDrift(specs, byName);
  });

  /**
   * `drift()` flattened to one row per FIELD, carrying BOTH values (design §5 / proposal 5).
   *
   * The list used to show only the entry's name plus "eigene Kopie"/"direkt bearbeitet", under
   * a heading that calls the live document «Struktur veraltet» — a verdict the data does not
   * support. Drift is symmetric: it means the catalogue and the document disagree, and the
   * catalogue is the stale half at least as often (four commits back-ported a live value INTO
   * `feature-blocks.ts` rather than the other way round). Showing `live → Katalog` per field
   * lets the reader see which direction they are being offered before they take it.
   */
  protected readonly driftRows = computed(() => {
    const references = this.menuReferences;
    const rows = this.drift().flatMap(entry =>
      Object.entries(entry.fields).map(([field, catalogue]) => {
        const reference = references.get(entry.name);
        return {
          name: entry.name, docId: entry.docId, forked: entry.forked, field,
          live: String(entry.live[field as keyof typeof entry.live] ?? ''),
          catalogue: String(catalogue ?? ''),
          blocks: (reference?.blockIds ?? [])
            .map(id => this.blockLabels[id]?.() || id).join(', '),
          parents: (reference?.parents ?? []).join(', '),
        };
      }));
    // One live DOCUMENT, reported once — not once per catalogue declaration. `filter-toggle`
    // is declared verbatim by four blocks (calevent, document, finance, meeting) and
    // `findStructuralDrift` walks specs, so the same doc/field surfaced four identical rows
    // and read as four separate problems. Deduped on the values too, so a genuinely
    // CONFLICTING re-declaration (two blocks wanting different catalogue values for one name)
    // still shows up as two rows rather than being silently collapsed into one.
    const seen = new Set<string>();
    return rows.filter(row => {
      const identity = [row.docId, row.field, row.live, row.catalogue].join('\u0000');
      if (seen.has(identity)) return false;
      seen.add(identity);
      return true;
    });
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

  /**
   * Which blocks have their menu outline unfolded. Purely presentational — it is deliberately
   * NOT part of `selection`, so opening a block to see what it switches on can never make the
   * save write anything.
   */
  private readonly detailsOpen = signal<ReadonlySet<string>>(new Set());

  /**
   * Flattened menu outline per block, computed ONCE from the static catalogue (nothing here
   * depends on tenant data or on the checkbox state).
   */
  /**
   * Menu name → which blocks declare it, under which parents. Static (catalogue-only), so it
   * is built once; a drift row uses it to say WHICH toggle owns the entry it names.
   */
  private readonly menuReferences = menuReferencesByName(this.catalogue);

  private readonly outlines = new Map<string, MenuOutlineRow[]>(
    this.catalogue.map(block => [block.id, menuOutlineOf(block)]));

  protected readonly selection = signal<Set<string>>(new Set());
  protected readonly isSaving = signal(false);
  private seeded = false;

  /**
   * The selection as it is PERSISTED right now — what the checkboxes were seeded from, and
   * what «Abbrechen» restores. Read live rather than captured at seed time, so a change made
   * in another tab is what a reset returns to.
   *
   * Same rule as the seed, deliberately: `undefined` means "every non-internal block"
   * (D-BB-10), not "nothing". Coalescing it would make a legacy tenant's cancel wipe every
   * checkbox and hand them a one-click menu-stripping save.
   */
  private readonly persisted = computed(() => new Set(resolveWithDeps(
    this.catalogue,
    this.appStore.appConfig()?.enabledFeatures
      ?? this.catalogue.filter(block => block.defaultAvailability !== 'internal').map(block => block.id))));

  /**
   * Has the admin changed anything since the screen was opened?
   *
   * Used ONLY to decide whether «Abbrechen» needs to confirm — deliberately NOT to disable
   * «Speichern». On a legacy tenant `enabledFeatures` is absent, so `persisted` equals the
   * seeded selection and nothing ever looks dirty; disabling the save button on that basis
   * would block the very first save, which is the one that persists an explicit list and is
   * the whole point of the screen.
   */
  protected readonly isDirty = computed(() => {
    const current = this.selection();
    const saved = this.persisted();
    return current.size !== saved.size || [...current].some(id => !saved.has(id));
  });

  constructor() {
    // Seed the checkbox state ONCE — but only once `appConfigResource` has actually settled.
    // `appStore.appConfig()` is NEVER nullish (`app.store.ts`'s `appConfig` computed always
    // returns `Object.assign(new AppConfig(tenantId), loaded ?? {})`), so gating the seed on
    // `appConfig()?.enabledFeatures` alone can't distinguish "not loaded yet" from "loaded,
    // legacy tenant, field genuinely absent" — both read as `undefined`. Only the resource's
    // own settlement status tells them apart, which is what `AppStore.isAppConfigSettled`
    // wraps (shared with `FeatureStore.settled`, so the two cannot drift). Getting this wrong
    // would latch "every non-internal block" in PERMANENTLY (seeded once, never re-run) and
    // never re-seed once the real — possibly much narrower — `enabledFeatures` arrives; a
    // hard reload straight onto this screen would then silently re-enable everything an admin
    // had deliberately switched off the moment they save.
    //
    // Not a `computed`/`linkedSignal` derived from the live stream either, which would
    // silently wipe whatever the admin has since ticked/unticked every time it re-emits (a
    // Firestore doc can change live under an open tab). `untracked` keeps the write itself
    // from being a tracked dependency of this same effect.
    effect(() => {
      if (this.seeded) return;
      if (!this.appStore.isAppConfigSettled()) return; // still loading
      const enabled = this.appStore.appConfig()?.enabledFeatures
        ?? this.catalogue.filter(block => block.defaultAvailability !== 'internal').map(block => block.id);
      this.seeded = true;
      untracked(() => this.selection.set(new Set(resolveWithDeps(this.catalogue, enabled))));
    });
  }

  protected outlineOf(block: FeatureBlock): MenuOutlineRow[] {
    return this.outlines.get(block.id) ?? [];
  }

  protected isDetailsOpen(block: FeatureBlock): boolean {
    return this.detailsOpen().has(block.id);
  }

  protected onToggleDetails(block: FeatureBlock): void {
    const next = new Set(this.detailsOpen());
    if (!next.delete(block.id)) next.add(block.id);
    this.detailsOpen.set(next);
  }

  protected isChecked(block: FeatureBlock): boolean {
    return block.core === true || this.selection().has(block.id);
  }

  protected isDisabled(block: FeatureBlock): boolean {
    return block.core === true || this.availability().get(block.id)?.offered !== true;
  }

  protected reasonOf(block: FeatureBlock): string {
    if (block.core === true) return this.i18n.core_note();
    const verdict = this.availability().get(block.id);
    if (!verdict || verdict.offered) return '';
    return verdict.reason.length > 0 ? verdict.reason : this.i18n.unavailable_reason_fallback();
  }

  protected async onToggle(block: FeatureBlock, event: CheckboxCustomEvent): Promise<void> {
    if (block.core === true) return; // checkbox is disabled; defensive only
    const checked = event.detail.checked;

    if (checked) {
      const before = this.selection();
      this.selection.set(new Set(resolveWithDeps(this.catalogue, [...before, block.id])));

      // A block with a caveat (a third-party licence, a cost) states it at the moment it is
      // switched on. Applied first and rolled back on cancel, for the same reason the uncheck
      // path below does: ion-checkbox has already flipped itself, and Angular only re-pushes
      // `[checked]` when the bound value actually changes.
      const remark = this.blockRemarks[block.id]?.();
      if (remark && !(await this.alertService.confirm(remark, true))) {
        this.selection.set(before);
      }
      return;
    }

    // Apply the uncheck immediately — it already matches what the checkbox itself shows — and
    // roll it back on cancel, rather than gating the write on the dialog result. Angular only
    // re-pushes a bound `[checked]` to the DOM when the value it computes actually flips; a
    // confirm-THEN-apply order that never touches `selection` on cancel would leave the
    // checkbox showing unchecked (ion-checkbox already flipped it optimistically) even though
    // logically nothing changed.
    const before = this.selection();
    const affected = transitiveDependentsOf(this.catalogue, block.id, before);
    const toRemove = new Set([block.id, ...affected]);
    this.selection.set(new Set([...before].filter(id => !toRemove.has(id))));

    if (affected.length === 0) return;

    const names = affected.map(id => this.blockLabels[id]?.() || id).join(', ');
    const message = await this.translateOrFallback(FEATURE_PICKER_I18N_KEYS.dependents_confirm, { blocks: names }, names);
    if (await this.alertService.confirm(message, true)) return; // uncheck stands

    this.selection.set(new Set([...this.selection(), ...toRemove]));
  }

  /**
   * Throw away unsaved ticks and go back to what is actually stored.
   *
   * The screen had no way out other than navigating away: every control changed the selection
   * and the only button committed it. Trying a profile to SEE what it selects — a reasonable
   * thing to do, and what «Profil anwenden» invites — left the admin holding a modified
   * selection with no undo. This is that undo.
   *
   * It restores `persisted`, it does not navigate: the admin is usually still deciding, and
   * dropping them onto another page would answer a question they did not ask.
   */
  protected async onCancel(): Promise<void> {
    if (!this.isDirty()) return;
    if (!await this.alertService.confirm(this.i18n.cancel_confirm(), true)) return;
    this.selection.set(new Set(this.persisted()));
  }

  /**
   * Tick the checkboxes a named profile asks for — proposal 6.
   *
   * It deliberately does NOT save. A profile is a starting point, and the admin still goes
   * through every gate that protects a real save (`blocksRemovedBySave`, the dry-run preview).
   * A one-click "apply and write" would be the most dangerous button on this screen: profiles
   * are nested, so `minimal` on a tenant running `voll` would strip eleven blocks' menu rows —
   * exactly the `enabledFeatures` failure this component was built to prevent.
   *
   * `resolveWithDeps` closes over dependencies, so what lands in `selection` is the same set a
   * save would compute, not a subset that silently grows on submit. Core blocks need no special
   * handling — `isChecked` reports them checked regardless.
   */
  protected async onApplyProfile(profile: FeatureProfile): Promise<void> {
    const next = new Set(resolveWithDeps(this.catalogue, profile.blocks));
    const name = this.profileLabels[profile.id]?.() || profile.id;

    const message = await this.translateOrFallback(
      FEATURE_PICKER_I18N_KEYS.profile_confirm,
      { profile: name, count: next.size }, `${name} (${next.size})`);
    if (!await this.alertService.confirm(message, true)) return;

    this.selection.set(next);
    await this.alertService.showToast(await this.translateOrFallback(
      FEATURE_PICKER_I18N_KEYS.profile_applied, { profile: name }, name));
  }

  protected async onSave(): Promise<void> {
    const tenantId = this.tenantId();
    const nextEnabled = [...this.selection()];

    // The removal-confirmation gate (see class doc comment) — independent of how the
    // checkboxes got into their current state. `currentEnabled` is read verbatim (never
    // coalesced): `undefined` vs. `[]` is exactly the distinction `blocksRemovedBySave` (and
    // D-BB-10) depend on.
    const currentEnabled = this.appStore.appConfig()?.enabledFeatures;
    const removed = blocksRemovedBySave({
      catalogue: this.catalogue, rollouts: this.rollouts(), currentEnabled, nextEnabled, tenantId,
    });

    if (removed.length > 0) {
      const names = removed.map(id => this.blockLabels[id]?.() || id).join(', ');
      const message = await this.translateOrFallback(FEATURE_PICKER_I18N_KEYS.removal_confirm, { blocks: names }, names);
      if (!await this.alertService.confirm(message, true)) return;
    }

    // The BLOCK-level gate above says which features go away; this one says what actually
    // happens to the documents, which is what an admin is really afraid of losing.
    if (!await this.confirmApplyImpact(nextEnabled)) return;

    this.isSaving.set(true);
    try {
      const response = await this.featureSelectionService.apply(tenantId, nextEnabled);
      if (response.withheld.length > 0) {
        const names = response.withheld
          .map(entry => `${this.blockLabels[entry.id]?.() || entry.id} (${entry.reason})`)
          .join('; ');
        const message = await this.translateOrFallback(FEATURE_PICKER_I18N_KEYS.withheld_toast, { blocks: names }, names);
        await this.alertService.showToast(message);
      } else {
        const count = response.applied.length;
        const message = await this.translateOrFallback(
          FEATURE_PICKER_I18N_KEYS.applied_toast, { count }, String(count));
        await this.alertService.showToast(message);
      }
    } catch (error) {
      this.alertService.error(`FeaturePicker.onSave: ${error}`);
    } finally {
      this.isSaving.set(false);
    }
  }

  /**
   * Replay the catalogue's structural fields onto this tenant's menu documents — «Struktur
   * übernehmen» (design §5).
   *
   * It re-applies the **live** block list, not `selection()`: sending `selection()` instead
   * would silently commit whatever the admin has ticked since opening the screen — a
   * menu-stripping save behind a button that promises only to fix structure.
   *
   * THIS IS THE ONLY CALLER THAT PASSES `replayStructure: true`. `applyFeatureSelection` used
   * to emit `update-structure` ops on every run, so a plain `onSave` — ticking one unrelated
   * block — rewrote `url`/`action`/`roleNeeded` on every menu document of every enabled block
   * (225 for `okr`) and reverted hand-tuned values with no warning and no trace. The replay
   * now happens only here, behind the field-by-field confirmation below, and every field it
   * overwrites is recorded as a `menu-structure` entry in `featureEvents`.
   */
  protected async onApplyStructure(): Promise<void> {
    const tenantId = this.tenantId();
    const blocks = [...this.liveBlocks()];

    // ASK THE SERVER WHAT IT WOULD ACTUALLY WRITE, before showing a confirmation built on the
    // assumption that it agrees with us.
    //
    // `FEATURE_BLOCKS` is compiled into two artefacts: this bundle, which produces the drift
    // list, and `dist/apps/functions`, which produces the writes. They only agree while the
    // functions have been deployed since the last `feature-blocks.ts` edit. On 2026-09-06 they
    // did not: «Katalog-Werte übernehmen» wrote the DEPLOYED catalogue's values, reported
    // success, and left `contextMenuChat` untouched (the deployed copy still said `admin`, so
    // the server planned nothing) while flipping `c-contentpage`/`cp-sort-sections`/`page-edit`
    // to values this app does not have. Nothing in the UI could say so, because the dialog was
    // built from our own rows and the write was fired blind.
    //
    // The dry run costs one callable round-trip and turns both failure modes into a sentence.
    let preview: ApplyPlanPreview | undefined;
    try {
      preview = (await this.featureSelectionService.apply(
        tenantId, blocks, { replayStructure: true, dryRun: true })).preview;
    } catch (error) {
      this.alertService.error(`FeaturePicker.onApplyStructure(dryRun): ${error}`);
      return;
    }

    const rows = this.driftRows();
    // A deployment that predates `dryRun` returns no preview at all. Confirm against our own
    // rows then — the pre-2026-09 behaviour — rather than refusing to work at all.
    const comparison = preview
      ? comparePlanToDrift(rows, preview.overwritten)
      : { planned: [], unplanned: [], conflicting: [] };

    if (preview && comparison.planned.length === 0) {
      // Nothing to write, so nothing to confirm. Saying "done" here would be the exact lie
      // this whole dry run exists to stop.
      await this.alertService.confirm(await this.translateOrFallback(
        FEATURE_PICKER_I18N_KEYS.drift_nothing_planned, { count: rows.length },
        this.i18n.drift_nothing_planned()));
      return;
    }

    // Name both sides, in the same shape as the list above it. Listing only the affected
    // FIELD names (the pre-2026-09 text) left the reader to guess which value replaces which —
    // the same ambiguity the bare `→` in the list had.
    //
    // Built as HTML, not as bulleted plain text: `AlertOptions.message` is rendered as HTML
    // (`innerHTMLTemplatesEnabled: true` in every app's `app.config.ts`), so the '\n's the
    // previous version separated its bullets with collapsed into spaces and the whole list
    // arrived as one unreadable paragraph. One `<p>` per entry — the entry NAME on the first
    // line, what actually changes on the second.
    //
    // The values come from the SERVER's plan when there is one: what it is about to write is
    // the truth of the matter, and quoting our own catalogue back at the reader is precisely
    // how the skew stayed invisible.
    const entries = preview
      ? comparison.planned.map(change => this.driftEntryHtml(
          change.name, change.field, change.from, change.to)).join('')
      : rows.map(row => this.driftEntryHtml(row.name, row.field, row.live, row.catalogue)).join('');

    const warning = await this.skewWarningHtml(comparison);
    const confirmText = await this.translateOrFallback(
      FEATURE_PICKER_I18N_KEYS.drift_confirm, { entries: entries + warning }, entries + warning);
    if (!await this.alertService.confirm(confirmText, true)) return;

    this.isSaving.set(true);
    try {
      await this.featureSelectionService.apply(tenantId, blocks, { replayStructure: true });
      // `drift()` recomputes itself from the live menu stream once the writes land.
      await this.alertService.showToast(this.i18n.drift_apply());
    } catch (error) {
      this.alertService.error(`FeaturePicker.onApplyStructure: ${error}`);
    } finally {
      this.isSaving.set(false);
    }
  }

  /** One drift entry, two lines: the entry name, then the value change. */
  private driftEntryHtml(name: string, field: string, from: string, to: string): string {
    return `<p><strong>${escapeHtml(name)}</strong><br>` +
      `${escapeHtml(field)}: ${this.i18n.drift_col_live()} <strong>${escapeHtml(from || '—')}</strong>` +
      ` → ${this.i18n.drift_col_catalogue()} <strong>${escapeHtml(to)}</strong></p>`;
  }

  /**
   * The paragraph that names a client/server catalogue mismatch, or '' when there is none.
   *
   * Deliberately part of the CONFIRMATION rather than a toast afterwards: by the time a toast
   * appears the write has happened, and the one thing an admin needs here is the chance not to
   * run it — an apply against a stale deployment writes real values to real documents.
   */
  private async skewWarningHtml(comparison: CataloguePlanComparison): Promise<string> {
    const affected = [
      ...comparison.unplanned.map(row => `${row.name} (${row.field})`),
      ...comparison.conflicting.map(entry =>
        `${entry.row.name} (${entry.row.field}: ${entry.serverValue})`),
    ];
    if (affected.length === 0) return '';

    const list = affected.join(', ');
    const text = await this.translateOrFallback(
      FEATURE_PICKER_I18N_KEYS.drift_skew_warning, { count: affected.length, entries: list }, list);
    return `<p><strong>${escapeHtml(text)}</strong></p>`;
  }

  /**
   * Ask the server what this save would do, and name it — proposal 4.
   *
   * Runs the callable with `dryRun: true`, which plans the entire run (menu ops, root menu,
   * seed docs, transitions) and writes nothing, then confirms against that plan. This is
   * strictly better than predicting it here, and not only because there is one implementation
   * instead of two: `MenuService.list()` is TENANT-SCOPED, so this component cannot see a
   * shared menu document the tenant does not yet inherit. The client planner therefore reports
   * a `create` where the server plans an `add-tenant` — a wrong noun in a dialog whose whole
   * job is to be trusted.
   *
   * FALLS BACK to the client-side root-menu warning when the dry run cannot run (offline, a
   * transport error, an old deployment that does not know `dryRun` and would return a preview
   * of `undefined`). A guard that disappears when the network hiccups is worse than a coarser
   * one that always shows up, and the fallback is the exact warning that shipped before this.
   */
  private async confirmApplyImpact(nextEnabled: string[]): Promise<boolean> {
    let preview: ApplyPlanPreview | undefined;
    try {
      preview = (await this.featureSelectionService.apply(
        this.tenantId(), nextEnabled, { dryRun: true })).preview;
    } catch {
      return await this.confirmRootMenuImpact(nextEnabled);
    }
    if (!preview) return await this.confirmRootMenuImpact(nextEnabled); // pre-dryRun deployment
    if (isEmptyPlan(preview)) return true; // a save that changes nothing needs no dialog

    const parts: string[] = [];
    if (preview.rootRemoved.length > 0) {
      parts.push(await this.translateOrFallback(
        FEATURE_PICKER_I18N_KEYS.menu_impact_removed,
        { keys: preview.rootRemoved.join(', ') }, preview.rootRemoved.join(', ')));
    }
    if (preview.rootAdded.length > 0) {
      parts.push(await this.translateOrFallback(
        FEATURE_PICKER_I18N_KEYS.menu_impact_readded,
        { keys: preview.rootAdded.join(', ') }, preview.rootAdded.join(', ')));
    }
    if (preview.created.length > 0) {
      parts.push(await this.translateOrFallback(
        FEATURE_PICKER_I18N_KEYS.preview_created,
        { keys: preview.created.join(', ') }, preview.created.join(', ')));
    }
    if (preview.extended.length > 0) {
      parts.push(await this.translateOrFallback(
        FEATURE_PICKER_I18N_KEYS.preview_extended,
        { count: preview.extended.length }, String(preview.extended.length)));
    }
    if (preview.seeded.length > 0) {
      parts.push(await this.translateOrFallback(
        FEATURE_PICKER_I18N_KEYS.preview_seeded,
        { count: preview.seeded.length }, String(preview.seeded.length)));
    }
    // Only reachable from «Katalog-Werte übernehmen»'s own path in practice — an ordinary save
    // cannot overwrite anything (D-BB-7b) — but reported here too rather than assumed away.
    if (preview.overwritten.length > 0) {
      const entries = preview.overwritten
        .map(change => `• ${change.name} — ${change.field}: ${change.from || '—'} → ${change.to}`)
        .join('\n');
      parts.push(entries);
    }
    if (parts.length === 0) return true;

    const changes = parts.join('\n\n');
    const message = await this.translateOrFallback(
      FEATURE_PICKER_I18N_KEYS.preview_confirm, { changes }, changes);
    return await this.alertService.confirm(message, true);
  }

  /**
   * The other exit from a drift entry — proposal 5.
   *
   * «Katalog-Werte übernehmen» answers "the catalogue is right". This answers "the LIVE value is
   * right", which is at least as common: commits 170fe4617, ba74a8f5e, a6d07bd4c and 487e1fea9
   * all back-ported a live value INTO `feature-blocks.ts`. Until now the screen offered no way
   * to say that, and the only button on it did the opposite.
   *
   * It deliberately writes nothing. The catalogue is code, shipped with the release (D-BB-2) —
   * an admin cannot change it and should not be led to think they can. What they CAN do is hand
   * a developer the exact patch, so this copies one to the clipboard.
   */
  protected async onKeepLive(): Promise<void> {
    const rows = this.driftRows();
    if (rows.length === 0) return;

    const note = [
      `# Katalog-Abgleich — Mandant ${this.tenantId()}`,
      '# Der Live-Wert ist der richtige. feature-blocks.ts nachziehen:',
      '',
      ...rows.map(row =>
        `menuItems/${row.docId} (${row.name})\n` +
        `  ${row.field}: Katalog '${row.catalogue}' -> heute gilt '${row.live}'`),
    ].join('\n');

    await copyToClipboard(note);
    await this.alertService.showToast(this.i18n.drift_keep_live_copied());
  }

  /**
   * What a save does to `main_<tenantId>.menuItems`, named row by row before it happens.
   *
   * WHY THIS EXISTS ALONGSIDE the block-level `removal_confirm` gate: that one lists BLOCKS, and
   * the two failure modes admins actually hit are row-shaped. (1) Saving with a block
   * accidentally unticked strips its rows — visible as blocks, but only if you recognise the
   * block name behind the row. (2) A block that is re-ticked comes back APPENDED AT THE TAIL,
   * because `planRootMenuOp` never reorders — so a hand-curated menu order silently degrades
   * every time a block round-trips, and nothing warns about that at block level at all.
   *
   * It runs the REAL planner (`planRootMenuOp`, shared with the Cloud Function via
   * `@okr/tenant-util`) against the live menu snapshot rather than predicting its behaviour, so
   * the preview cannot disagree with the write. Returns true when there is nothing to warn
   * about — an unchanged root array produces no dialog.
   *
   * SINCE PROPOSAL 4 this is the FALLBACK, not the primary path: `confirmApplyImpact` asks the
   * server for the real plan and only lands here when that call fails. Kept rather than deleted
   * because it needs no network — the one case where a coarser warning beats none. It is also
   * blind to menu documents this tenant does not yet inherit (`MenuService.list()` is
   * tenant-scoped), which is precisely why it is no longer the primary path.
   */
  private async confirmRootMenuImpact(nextEnabled: string[]): Promise<boolean> {
    const tenantId = this.tenantId();
    const enabledIds = new Set(nextEnabled);
    const enabledBlocks = this.catalogue.filter(block => enabledIds.has(block.id));

    // Mirrors `applySelection`: `addKeys` is filtered to navigate/sub top-level specs,
    // `removeKeys` is deliberately unfiltered over every non-selected block.
    const addKeys = rootNavKeys(enabledBlocks);
    const removeKeys = this.catalogue
      .filter(block => !enabledIds.has(block.id))
      .flatMap(block => block.menu.map(spec => spec.key));

    const { byName } = indexMenuDocsByName(
      this.menuDocs().map(doc => ({ id: doc.okey, data: doc })), tenantId);
    const op = planRootMenuOp(tenantId, byName, addKeys, removeKeys);

    const next = op?.fields?.menuItems;
    if (!next) return true; // no root-menu write at all (or a create — nothing to lose yet)

    const current = byName.get(`main_${tenantId}`)?.menuItems ?? [];
    const removedRows = current.filter(key => !next.includes(key));
    const addedRows = next.filter(key => !current.includes(key));
    if (removedRows.length === 0 && addedRows.length === 0) return true; // reorder-free no-op

    const parts: string[] = [];
    if (removedRows.length > 0) {
      parts.push(await this.translateOrFallback(
        FEATURE_PICKER_I18N_KEYS.menu_impact_removed,
        { keys: removedRows.join(', ') }, removedRows.join(', ')));
    }
    if (addedRows.length > 0) {
      parts.push(await this.translateOrFallback(
        FEATURE_PICKER_I18N_KEYS.menu_impact_readded,
        { keys: addedRows.join(', ') }, addedRows.join(', ')));
    }
    const changes = parts.join('\n\n');
    const message = await this.translateOrFallback(
      FEATURE_PICKER_I18N_KEYS.menu_impact_confirm, { changes }, changes);
    return await this.alertService.confirm(message, true);
  }

  /**
   * `I18nService.translate` degrades a failed scope load to `of('')` (see its doc comment) —
   * silently, by design, for ordinary chrome text. But `dependents_confirm`/`removal_confirm`
   * gate a destructive write behind `AlertService.confirm`, and `AlertOptions.message` has no
   * separate "content failed to load" state: an empty string renders a real alert with NO
   * message at all, just OK/Abbrechen buttons — the admin can confirm away a menu-stripping
   * save without ever seeing what it strips. Never let that happen silently: fall back to the
   * raw (untranslated) content, so the worst case is a dialog that lists block ids instead of
   * translated labels, not a content-free prompt.
   */
  /** The block's caveat, or '' when it declares none. */
  protected remarkOf(block: FeatureBlock): string {
    return this.blockRemarks[block.id]?.() ?? '';
  }

  private async translateOrFallback(
    key: string, params: Record<string, string | number>, fallback: string,
  ): Promise<string> {
    const message = await this.i18nService.translateOnce(key, params);
    return message.length > 0 ? message : fallback;
  }
}
