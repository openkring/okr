import { ChangeDetectionStrategy, Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import {
  IonButton, IonButtons, IonCheckbox, IonContent, IonHeader, IonIcon, IonItem, IonItemDivider,
  IonItemGroup, IonLabel, IonList, IonMenuButton, IonNote, IonSpinner, IonTitle, IonToolbar,
} from '@ionic/angular/standalone';

import { AppStore } from '@okr/shared-feature';
import { I18nService } from '@okr/shared-i18n';
import { SvgIconPipe } from '@okr/shared-pipes';
import { AlertService } from '@okr/shared-util-angular';
import type { FeatureRolloutModel } from '@okr/shared-models';
import {
  FEATURE_BLOCKS, FEATURE_BUNDLES, FEATURE_PICKER_I18N_KEYS, effectiveFeatures,
  resolveAvailability, resolveWithDeps,
} from '@okr/tenant-util';
import type { AvailabilityVerdict, FeatureBlock, FeaturePickerI18n } from '@okr/tenant-util';
import { FeatureRolloutService, FeatureSelectionService } from '@okr/tenant-data-access';

import { FeatureStore } from './feature.store';
import { dependentsOf } from './feature-picker.util';

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
 *  1. the checkbox state is seeded from what is actually live today (`currentEffective`,
 *     which is `FeatureStore.effective()` — the exact same D-BB-10-aware source `MenuStore`
 *     filters the rendered menu by), so an admin who saves without touching anything changes
 *     nothing;
 *  2. regardless of how the checkboxes got into their current state, `onSave` independently
 *     recomputes what would be live AFTER the save and, if that set is smaller than what is
 *     live now, blocks the write behind a confirmation naming exactly what disappears. This
 *     is what catches a legacy tenant's first save even when nothing looks "changed" from the
 *     admin's point of view (e.g. a picker bug or a partial catalogue leaves the seed
 *     incomplete) — belt AND suspenders, not either/or.
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
        @for (group of bundleGroups; track group.bundle.id) {
          @if (group.blocks.length > 0) {
            <ion-item-group>
              <ion-item-divider>
                <ion-icon slot="start" src="{{ group.bundle.icon | svgIcon }}" />
                <ion-label>{{ bundleLabels[group.bundle.id]?.() ?? group.bundle.id }}</ion-label>
              </ion-item-divider>
              @for (block of group.blocks; track block.id) {
                <ion-item>
                  <ion-icon slot="start" src="{{ block.icon | svgIcon }}" />
                  <ion-checkbox
                    slot="start"
                    [checked]="isChecked(block)"
                    [disabled]="isDisabled(block)"
                    (ionChange)="onToggle(block, $any($event).detail.checked)">
                    <ion-label>{{ blockLabels[block.id]?.() ?? block.id }}</ion-label>
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
  private readonly featureStore = inject(FeatureStore);
  private readonly rolloutService = inject(FeatureRolloutService);
  private readonly featureSelectionService = inject(FeatureSelectionService);
  private readonly i18nService = inject(I18nService);
  private readonly alertService = inject(AlertService);

  protected readonly catalogue: FeatureBlock[] = FEATURE_BLOCKS;
  protected readonly bundles = FEATURE_BUNDLES;

  protected readonly i18n = this.i18nService.translateAll(FEATURE_PICKER_I18N_KEYS) as FeaturePickerI18n;

  // Block/bundle labels are resolved dynamically from the catalogue (which grows with Tasks
  // 12-18) rather than hand-listed — `translateAll` over a record built from `label` fields
  // that are themselves static i18n keys, so this is still the store-driven static pattern,
  // not a `TranslatePipe`/data-driven case.
  protected readonly blockLabels = this.i18nService.translateAll(
    Object.fromEntries(this.catalogue.map(block => [block.id, block.label])) as Record<string, string>);
  protected readonly bundleLabels = this.i18nService.translateAll(
    Object.fromEntries(this.bundles.map(bundle => [bundle.id, bundle.label])) as Record<string, string>);

  private readonly rollouts = toSignal(this.rolloutService.list(), { initialValue: [] as FeatureRolloutModel[] });
  private readonly tenantId = computed(() => this.appStore.tenantId());

  /**
   * What's live for this tenant right now. Deliberately `FeatureStore.effective()` — the
   * exact set `MenuStore` filters the rendered menu tree by — rather than re-deriving it here,
   * so "what's about to disappear" is always measured against what the admin can actually see
   * today, D-BB-10 default included.
   */
  protected readonly currentEffective = computed(() => this.featureStore.effective());

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
    // Seed the checkbox state ONCE from what's actually live for this tenant — not a
    // `computed`/`linkedSignal` derived from the rollouts stream, which would silently wipe
    // whatever the admin has since ticked/unticked every time that stream re-emits (a
    // Firestore doc can change live under an open tab). `untracked` keeps the write itself
    // from being a tracked dependency of this same effect.
    effect(() => {
      if (this.seeded) return;
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

  protected async onToggle(block: FeatureBlock, checked: boolean): Promise<void> {
    if (block.core === true) return; // checkbox is disabled; defensive only

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
    const affected = this.transitiveSelectedDependents(block.id, before);
    const toRemove = new Set([block.id, ...affected]);
    this.selection.set(new Set([...before].filter(id => !toRemove.has(id))));

    if (affected.length === 0) return;

    const names = affected.map(id => this.blockLabels[id]?.() ?? id).join(', ');
    const message = await this.i18nService.translateOnce(FEATURE_PICKER_I18N_KEYS.dependents_confirm, { blocks: names });
    if (await this.alertService.confirm(message, true)) return; // uncheck stands

    this.selection.set(new Set([...this.selection(), ...toRemove]));
  }

  /**
   * Every currently-SELECTED block that would break, transitively, if `id` were switched off.
   * `dependentsOf` itself only returns direct dependents (see its doc comment) — the picker
   * needs the whole chain in one confirmation, not one dialog per hop, and only the blocks the
   * admin actually has on (an already-unticked dependent needs no warning).
   */
  private transitiveSelectedDependents(id: string, selected: Set<string>): string[] {
    const out = new Set<string>();
    const queue = [id];
    while (queue.length > 0) {
      const current = queue.shift() as string;
      for (const dep of dependentsOf(this.catalogue, current)) {
        if (selected.has(dep) && !out.has(dep)) {
          out.add(dep);
          queue.push(dep);
        }
      }
    }
    return [...out];
  }

  protected async onSave(): Promise<void> {
    const tenantId = this.tenantId();
    const blockIds = [...this.selection()];

    // The removal-confirmation gate (see class doc comment) — independent of how the
    // checkboxes got into their current state.
    const after = effectiveFeatures({ catalogue: this.catalogue, rollouts: this.rollouts(), enabled: blockIds, tenantId });
    const before = this.currentEffective();
    const removed = [...before].filter(id => !after.has(id));

    if (removed.length > 0) {
      const names = removed.map(id => this.blockLabels[id]?.() ?? id).join(', ');
      const message = await this.i18nService.translateOnce(FEATURE_PICKER_I18N_KEYS.removal_confirm, { blocks: names });
      if (!await this.alertService.confirm(message, true)) return;
    }

    this.isSaving.set(true);
    try {
      const response = await this.featureSelectionService.apply(tenantId, blockIds);
      if (response.withheld.length > 0) {
        const names = response.withheld
          .map(entry => `${this.blockLabels[entry.id]?.() ?? entry.id} (${entry.reason})`)
          .join('; ');
        const message = await this.i18nService.translateOnce(FEATURE_PICKER_I18N_KEYS.withheld_toast, { blocks: names });
        await this.alertService.showToast(message);
      } else {
        const message = await this.i18nService.translateOnce(
          FEATURE_PICKER_I18N_KEYS.applied_toast, { count: response.applied.length });
        await this.alertService.showToast(message);
      }
    } catch (error) {
      this.alertService.error(`FeaturePicker.onSave: ${error}`);
    } finally {
      this.isSaving.set(false);
    }
  }
}
