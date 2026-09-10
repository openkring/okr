import { AsyncPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, input, linkedSignal } from '@angular/core';
import type { CheckboxCustomEvent } from '@ionic/angular/standalone';
import {
  IonCard, IonCardContent, IonCardHeader, IonCardSubtitle, IonCheckbox, IonContent, IonNote,
  ModalController,
} from '@ionic/angular/standalone';

import { TranslatePipe } from '@okr/shared-i18n';
import { ChangeConfirmation, ChangeConfirmationI18n, Header } from '@okr/shared-ui';
import { dismissOverlay } from '@okr/shared-util-angular';
import type {
  ApplyPlanPreview, FeatureBlock, FeaturePickerI18n, MenuOutlineRow, PlanEntry, PlanEntryKind,
} from '@okr/tenant-util';
import { entriesOfKind, menuOutlineOf, planConsequence, summarizePlanConsequences } from '@okr/tenant-util';

import { applyRowToggle, forcedDependencyKeys, menuKeysFor } from './block-enable-selection.util';

/** `dismiss(…, 'confirm')` payload — the explicit whitelist of menu row keys to attach. */
export interface BlockEnableResult {
  menuKeys: string[];
}

/** `PlanEntry` kinds whose `subject` is a `MenuOutlineRow.key` — see `apply-feature-selection.ts`. */
const MENU_ROW_KINDS: PlanEntryKind[] = ['menu-created', 'menu-extended', 'menu-reactivated', 'menu-attached'];

/**
 * The whitelist dialog for one block, opened from `FeaturePicker` (Task 10) when an admin
 * ticks a block that is not yet enabled.
 *
 * Enabling a block used to attach EVERY menu row it declares — Tasks 1-7 replaced that with
 * an explicit `menuKeys` whitelist sent to the `enableBlock` verb, so this screen is where the
 * admin actually makes that choice: one checkbox per row of the block's own menu tree, seeded
 * ticked (matching the old all-on behaviour) so unticking is the only action needed to opt a
 * row out.
 *
 * WHAT IS AND ISN'T PART OF THE WHITELIST:
 *  - A row already reachable in this tenant's menu (`alreadyPresent`) is shown ticked and
 *    disabled — the admin cannot opt it out from here — and its key STAYS in the emitted
 *    `menuKeys` regardless of what the checkbox tree does. `dryRun` computed `preview` against
 *    the caller's current default selection (this block's full outline), so a row already
 *    live is exactly the row the preview needed present to compute correctly; dropping it
 *    from the payload here would silently ask the real run to plan against a selection the
 *    preview never saw. This guarantee is enforced TWICE, deliberately (see
 *    `block-enable-selection.util.ts`): `applyRowToggle` never lets an ancestor's uncheck
 *    cascade delete an already-present descendant's key, and `menuKeysFor` unions
 *    `alreadyPresent` back into the payload regardless, so neither guard depends on the other
 *    ever being right.
 *  - `alsoBlocks` (dependency blocks the save will force on regardless of this dialog) are
 *    shown read-only — their own menu outline, ticked, disabled — and their keys ARE part of
 *    `menuKeys`. A forced dependency has no admin choice to whitelist, so its rows are not
 *    individually opt-out-able; but they must still be in the payload, because `enableBlock`
 *    plans EVERY block it grants against that one whitelist. Omitting them (the pre-fix
 *    behaviour) enabled `person` alongside `calevent` with not one menu document created,
 *    while this dialog showed those rows pre-ticked — the dialog and the write disagreed.
 *    Spec §19 lists them «vorangehakt», i.e. written. A key a dependency SHARES with this
 *    block's own outline is excluded from that forcing: the admin has a real checkbox for it
 *    here, so unticking it must keep it out (`forcedDependencyKeys`).
 *
 * Unticking a parent row unticks its descendants with it (a child cannot be attached without
 * its parent — `MenuOutlineRow.depth` encodes the tree via depth-first order); ticking a row
 * re-ticks its ancestor chain for the same reason. The tree-walking and the two guarantees
 * above are pure functions in `block-enable-selection.util.ts`, unit-tested there (this lib
 * has no component-test harness for a modal).
 */
@Component({
  selector: 'okr-block-enable-modal',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    AsyncPipe, TranslatePipe,
    IonCard, IonCardContent, IonCardHeader, IonCardSubtitle, IonCheckbox, IonContent, IonNote,
    ChangeConfirmation, Header,
  ],
  styles: [`
    .row { padding-block: 0.6rem; border-block-end: 1px solid var(--ion-color-step-150, #e5e5e5); }
    .row:last-of-type { border-block-end: none; }
    .row ion-note { display: block; margin-block-start: 0.25rem; font-size: 0.8rem; line-height: 1.35; }
    ion-card-subtitle { text-transform: none; }
  `],
  template: `
    <okr-header [i18n]="{ title: (block().label | translate | async) ?? '' }" [isModal]="true" />
    <okr-change-confirmation [i18n]="changeConfirmationI18n()" (cancelClicked)="cancel()" (saveClicked)="confirm()" />
    <ion-content>
      <ion-card>
        <ion-card-content>
          <p>{{ i18n().enable_dialog_intro() }}</p>
          @if (block().remarks; as remarks) {
            <p>{{ remarks | translate | async }}</p>
          }
        </ion-card-content>
      </ion-card>

      <ion-card>
        <ion-card-content>
          @if (outline().length === 0) {
            <p>{{ i18n().details_no_menu() }}</p>
          } @else {
            @for (row of outline(); track row.key) {
              <div class="row" [style.padding-inline-start.rem]="row.depth * 1.5">
                <ion-checkbox
                  labelPlacement="end"
                  justify="start"
                  [checked]="isChecked(row)"
                  [disabled]="isAlreadyPresent(row)"
                  (ionChange)="onRowToggle(row, $event)">
                  <div class="ion-text-wrap">{{ (row.labelKey | translate | async) || row.name }}</div>
                </ion-checkbox>
                <ion-note class="ion-text-wrap">{{ noteFor(row) }}</ion-note>
              </div>
            }
          }
        </ion-card-content>
      </ion-card>

      @for (also of alsoBlockOutlines(); track also.block.id) {
        <ion-card>
          <ion-card-header>
            <ion-card-subtitle class="ion-text-wrap">{{ reasonFor(also.block) }}</ion-card-subtitle>
          </ion-card-header>
          <ion-card-content>
            @for (row of also.rows; track row.key) {
              <div class="row" [style.padding-inline-start.rem]="row.depth * 1.5">
                <ion-checkbox labelPlacement="end" justify="start" [checked]="true" [disabled]="true">
                  <div class="ion-text-wrap">{{ (row.labelKey | translate | async) || row.name }}</div>
                </ion-checkbox>
                <ion-note class="ion-text-wrap">{{ noteFor(row) }}</ion-note>
              </div>
            }
          </ion-card-content>
        </ion-card>
      }
    </ion-content>
  `,
})
export class BlockEnableModal {
  private readonly modalController = inject(ModalController);

  // inputs
  public block = input.required<FeatureBlock>();
  public alsoBlocks = input<FeatureBlock[]>([]);
  public preview = input.required<ApplyPlanPreview>();
  public alreadyPresent = input<string[]>([]);
  public i18n = input.required<FeaturePickerI18n>();

  // derived, read-only
  protected readonly outline = computed(() => menuOutlineOf(this.block()));
  protected readonly alreadyPresentSet = computed(() => new Set(this.alreadyPresent()));
  protected readonly alsoBlockOutlines = computed(() =>
    this.alsoBlocks().map(block => ({ block, rows: menuOutlineOf(block) })));
  /**
   * The dependency rows that are locked in the UI and always sent — every `alsoBlocks` row
   * MINUS the keys this block's own outline already offers as a real checkbox. A key the admin
   * can see and untick stays the admin's decision (see `forcedDependencyKeys`).
   */
  private readonly dependencyKeys = computed(() => forcedDependencyKeys(
    this.outline(), this.alsoBlockOutlines().flatMap(also => also.rows)));

  /** `PlanEntry`s of a menu-row kind, indexed by the `MenuOutlineRow.key` they describe. */
  private readonly menuEntriesByKey = computed(() => {
    const map = new Map<string, PlanEntry[]>();
    for (const kind of MENU_ROW_KINDS) {
      for (const entry of entriesOfKind(this.preview(), kind)) {
        const list = map.get(entry.subject);
        if (list) list.push(entry); else map.set(entry.subject, [entry]);
      }
    }
    return map;
  });

  /** The `block-enabled` entry the dry run recorded FOR a dependency block, if any. */
  private readonly dependencyReasons = computed(() => {
    const map = new Map<string, PlanEntry>();
    for (const entry of entriesOfKind(this.preview(), 'block-enabled')) {
      if (entry.reason) map.set(entry.subject, entry);
    }
    return map;
  });

  protected readonly changeConfirmationI18n = computed<ChangeConfirmationI18n>(() => ({
    cancel: this.i18n().cancel(), save: this.i18n().save(),
  }));

  // selection state — seeded ticked (mirrors the old all-on behaviour), mutated by `onRowToggle`.
  protected readonly selected = linkedSignal<Set<string>>(() => new Set(this.outline().map(row => row.key)));

  protected isAlreadyPresent(row: MenuOutlineRow): boolean {
    return this.alreadyPresentSet().has(row.key);
  }

  protected isChecked(row: MenuOutlineRow): boolean {
    return this.isAlreadyPresent(row) || this.selected().has(row.key);
  }

  /**
   * The second line under a row's label: which role will see the row, plus the dry run's own
   * sentence(s) for what enabling does to it. The role is spelled out («Rolle: privileged»)
   * rather than dropped in bare — on its own, a role name next to a consequence sentence reads
   * as an unexplained fragment. Duplicate consequence sentences are collapsed: several
   * `PlanEntry`s of different kinds can carry the SAME `consequenceKey`, and repeating one
   * sentence twice in a row is how this note started reading like noise.
   */
  protected noteFor(row: MenuOutlineRow): string {
    const role = `${this.i18n().rows_col_role()}: ${row.roleNeeded}`;
    if (this.isAlreadyPresent(row)) return `${role} · ${this.i18n().enable_already_present()}`;
    const consequence = summarizePlanConsequences(
      this.menuEntriesByKey().get(row.key) ?? [], this.i18n(), { withSubjects: false });
    return consequence ? `${role} · ${consequence}` : role;
  }

  protected reasonFor(block: FeatureBlock): string {
    const entry = this.dependencyReasons().get(block.id);
    return entry ? planConsequence(entry, this.i18n()) : this.i18n().enable_dependency_reason_fallback();
  }

  protected onRowToggle(row: MenuOutlineRow, event: CheckboxCustomEvent): void {
    if (this.isAlreadyPresent(row)) return; // checkbox is disabled; defensive only
    const next = applyRowToggle(
      this.outline(), this.selected(), this.alreadyPresentSet(), row.key, event.detail.checked,
    );
    this.selected.set(next);
  }

  protected async confirm(): Promise<void> {
    const result: BlockEnableResult = {
      menuKeys: menuKeysFor(this.selected(), this.alreadyPresentSet(), this.dependencyKeys()),
    };
    await dismissOverlay(this.modalController, result, 'confirm');
  }

  protected async cancel(): Promise<void> {
    await dismissOverlay(this.modalController, undefined, 'cancel');
  }
}
