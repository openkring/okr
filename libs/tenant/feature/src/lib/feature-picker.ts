import { ChangeDetectionStrategy, Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import type { CheckboxCustomEvent } from '@ionic/angular/standalone';
import {
  IonButton, IonButtons, IonCheckbox, IonContent, IonHeader, IonIcon, IonItem, IonItemDivider,
  IonItemGroup, IonLabel, IonList, IonMenuButton, IonNote, IonSpinner, IonTitle, IonToolbar,
} from '@ionic/angular/standalone';

import { AppStore } from '@okr/shared-feature';
import { I18nService } from '@okr/shared-i18n';
import { SvgIconPipe } from '@okr/shared-pipes';
import { AlertService } from '@okr/shared-util-angular';
import type { FeatureRolloutModel, MenuItemModel } from '@okr/shared-models';
import {
  FEATURE_BLOCKS, FEATURE_BUNDLES, FEATURE_PICKER_I18N_KEYS, effectiveFeatures,
  findStructuralDrift, indexMenuDocsByName, resolveAvailability, resolveWithDeps,
} from '@okr/tenant-util';
import type { AvailabilityVerdict, FeatureBlock, MenuStructureDrift } from '@okr/tenant-util';
import { FeatureRolloutService, FeatureSelectionService } from '@okr/tenant-data-access';
import { MenuService } from '@okr/cms-menu-data-access';

import { blocksRemovedBySave, transitiveDependentsOf } from './feature-picker.util';

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
    SvgIconPipe,
    IonHeader, IonToolbar, IonButtons, IonMenuButton, IonTitle, IonButton, IonIcon, IonSpinner,
    IonContent, IonList, IonItemGroup, IonItemDivider, IonItem, IonLabel, IonCheckbox, IonNote,
  ],
  template: `
    <ion-header>
      <ion-toolbar color="secondary">
        <ion-buttons slot="start"><ion-menu-button /></ion-buttons>
        <ion-title>{{ i18n.title() }}</ion-title>
        <ion-buttons slot="end">
          <ion-button (click)="onSave()" [disabled]="isSaving()">
            @if (isSaving()) {
              <ion-spinner name="dots" />
            } @else {
              <ion-icon slot="icon-only" src="{{ 'checkbox-circle' | svgIcon }}" />
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
              <ion-button slot="end" fill="clear" (click)="onApplyStructure()" [disabled]="isSaving()">
                {{ i18n.drift_apply() }}
              </ion-button>
            </ion-item-divider>
            <ion-item lines="none">
              <ion-note class="ion-text-wrap">{{ i18n.drift_note() }}</ion-note>
            </ion-item>
            @for (entry of drift(); track entry.docId) {
              <ion-item>
                <ion-label>{{ entry.name }}</ion-label>
                <ion-note slot="end">
                  {{ entry.forked ? i18n.drift_forked() : i18n.drift_edited() }}
                </ion-note>
              </ion-item>
            }
          </ion-item-group>
        }
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
                </ion-item>
              }
            </ion-item-group>
          }
        }
      </ion-list>
    </ion-content>
  `,
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

  protected readonly i18n = this.i18nService.translateAll(FEATURE_PICKER_I18N_KEYS);

  // Block/bundle labels are resolved dynamically from the catalogue (which grows with Tasks
  // 12-18) rather than hand-listed — `translateAll` over a record built from `label` fields
  // that are themselves static i18n keys, so this is still the store-driven static pattern,
  // not a `TranslatePipe`/data-driven case.
  protected readonly blockLabels = this.i18nService.translateAll(
    Object.fromEntries(this.catalogue.map(block => [block.id, block.label])));
  protected readonly bundleLabels = this.i18nService.translateAll(
    Object.fromEntries(this.bundles.map(bundle => [bundle.id, bundle.label])));

  private readonly rollouts = toSignal(this.rolloutService.list(), { initialValue: [] as FeatureRolloutModel[] });
  private readonly tenantId = computed(() => this.appStore.tenantId());

  private readonly menuDocs = toSignal(this.menuService.list(), { initialValue: [] as MenuItemModel[] });

  /**
   * The blocks that are LIVE for this tenant right now — not `selection()`, which may hold
   * unsaved ticks. Mirrors `FeatureStore.effective()` on the picker's own inputs rather than
   * injecting that store, so the drift warning describes the deployed state and the
   * «Struktur übernehmen» button can never enable or disable anything as a side effect.
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

  protected readonly availability = computed<Map<string, AvailabilityVerdict>>(() => {
    const rolloutById = new Map(this.rollouts().map(rollout => [rollout.okey, rollout]));
    return new Map(this.catalogue.map(block =>
      [block.id, resolveAvailability(block, rolloutById.get(block.id), this.tenantId())]));
  });

  protected readonly bundleGroups = this.bundles.map(bundle => ({
    bundle,
    blocks: this.catalogue.filter(block => block.bundle === bundle.id),
  }));

  protected readonly selection = signal<Set<string>>(new Set());
  protected readonly isSaving = signal(false);
  private seeded = false;

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
      this.selection.set(new Set(resolveWithDeps(this.catalogue, [...this.selection(), block.id])));
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
   * It re-applies the **live** block list, not `selection()`: `applyFeatureSelection` already
   * emits `update-structure` ops for every enabled block on each run (`planMenuOpsForBlocks`),
   * so replaying the current state is the whole fix and needs no second callable. Sending
   * `selection()` instead would silently commit whatever the admin has ticked since opening
   * the screen — a menu-stripping save behind a button that promises only to fix structure.
   */
  protected async onApplyStructure(): Promise<void> {
    this.isSaving.set(true);
    try {
      await this.featureSelectionService.apply(this.tenantId(), [...this.liveBlocks()]);
      // `drift()` recomputes itself from the live menu stream once the writes land.
      await this.alertService.showToast(this.i18n.drift_apply());
    } catch (error) {
      this.alertService.error(`FeaturePicker.onApplyStructure: ${error}`);
    } finally {
      this.isSaving.set(false);
    }
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
  private async translateOrFallback(
    key: string, params: Record<string, string | number>, fallback: string,
  ): Promise<string> {
    const message = await this.i18nService.translateOnce(key, params);
    return message.length > 0 ? message : fallback;
  }
}
