import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import {
  IonButton, IonButtons, IonContent, IonHeader, IonIcon, IonItem, IonItemDivider,
  IonItemGroup, IonLabel, IonList, IonMenuButton, IonNote, IonSegment, IonSegmentButton,
  IonTitle, IonToolbar, ModalController,
} from '@ionic/angular/standalone';

import { AppStore } from '@okr/shared-feature';
import { I18nService } from '@okr/shared-i18n';
import { SvgIconPipe } from '@okr/shared-pipes';
import { AlertService } from '@okr/shared-util-angular';
import type { FeatureRolloutModel, MenuItemModel } from '@okr/shared-models';
import {
  FEATURE_BLOCKS, FEATURE_BUNDLES, FEATURE_PICKER_I18N_KEYS, FEATURE_PROFILES, effectiveFeatures,
  menuOutlineOf, resolveAvailability, resolveWithDeps,
} from '@okr/tenant-util';
import type { ApplyPlanPreview, AvailabilityVerdict, FeatureBlock, FeatureProfile } from '@okr/tenant-util';
import { FeatureRolloutService, FeatureSelectionService } from '@okr/tenant-data-access';
import { MenuService } from '@okr/cms-menu-data-access';
import type { BlockEnableResult } from '@okr/tenant-ui';
import { BlockEnableModal } from '@okr/tenant-ui';

/** Which of the two `IonSegment` tabs is showing. */
type PickerSegment = 'blocks' | 'rows';

/**
 * The admin-facing feature picker — `/tenant/features` — split into two segments: which
 * catalogue BLOCKS are on (this component, segment `blocks`) and, per enabled block, which
 * menu ROWS are attached (segment `rows`, a placeholder here — Task 11 fills it in).
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
    SvgIconPipe,
    IonHeader, IonToolbar, IonButtons, IonMenuButton, IonTitle, IonButton, IonIcon,
    IonContent, IonList, IonItemGroup, IonItemDivider, IonItem, IonLabel, IonNote,
    IonSegment, IonSegmentButton,
  ],
  template: `
    <ion-header>
      <ion-toolbar color="secondary">
        <ion-buttons slot="start"><ion-menu-button /></ion-buttons>
        <ion-title>{{ i18n.title() }}</ion-title>
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
                        <ion-button slot="end" fill="clear" (click)="onDisable(block)">
                          {{ i18n.disable_button() }}
                        </ion-button>
                      }
                    }
                  </ion-item>
                }
              </ion-item-group>
            }
          }
        </ion-list>
      } @else {
        <ion-list>
          <ion-item lines="none">
            <ion-label class="ion-text-wrap">{{ i18n.segment_rows_placeholder() }}</ion-label>
          </ion-item>
        </ion-list>
      }
    </ion-content>
  `,
  styles: [`
    .highlighted { --background: var(--ion-color-warning-tint); }
    .active { --background: var(--ion-color-light-shade); }
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

  /** core / withheld / on / off — see the class doc comment for what each means. */
  protected blockState(block: FeatureBlock): 'on' | 'off' | 'withheld' | 'core' {
    if (block.core === true) return 'core';
    const verdict = this.availability().get(block.id);
    if (verdict && !verdict.offered) return 'withheld';
    return this.liveBlocks().has(block.id) ? 'on' : 'off';
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
