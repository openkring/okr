import { Component, computed, DestroyRef, effect, inject, input, signal, untracked } from '@angular/core';
import {
  IonAccordion,
  IonAccordionGroup,
  IonBadge,
  IonCheckbox,
  IonChip,
  IonContent,
  IonIcon,
  IonInfiniteScroll,
  IonInfiniteScrollContent,
  IonItem,
  IonLabel,
  IonList,
  IonNote,
  IonSegment,
  IonSegmentButton,
  IonSelect,
  IonSelectOption,
  IonToggle,
  InfiniteScrollCustomEvent,
  ModalController,
} from '@ionic/angular';

import { I18nService } from '@okr/shared-i18n';
import { SvgIconPipe } from '@okr/shared-pipes';
import { ChangeConfirmation, Header } from '@okr/shared-ui';
import { dismissOverlay } from '@okr/shared-util-angular';
import {
  applyBulkAction, fill, filterCounts, filterIndices, REVIEW_FILTERS, ReviewFilter,
  VcardImportDecision, VCARD_I18N_KEYS, VcardI18n,
} from '@okr/vcard-util';

/** What the review hands back to `VcardImportService` on confirm. */
export interface VcardImportReviewResult {
  decisions: VcardImportDecision[];
  importPhotos: boolean;
}

/** Rows rendered per page; more load on scroll (spec 1.159 §4.2 — 4143 rows must not render at once). */
const PAGE = 100;

/** One editable relation row, addressed by its index in `VcardImportDecision.relations`. */
type Relation = VcardImportDecision['relations'][number];

/**
 * Review step of the vCard import (spec §6). Shows one row per parsed card — status,
 * counts, action, and (when the automatic match was ambiguous or empty) the pickers
 * to link or create the employer/relations — before anything is written.
 *
 * The `decisions` input is the machine-computed starting point; `state` is the
 * operator's edited copy. It is seeded exactly once (an `effect` + `untracked`
 * guarded by `seeded`), never derived via `computed`, so a later re-emission of
 * `decisions` (e.g. the parent recomputing candidates) cannot silently wipe out
 * choices the operator already made.
 */
@Component({
  selector: 'okr-vcard-import-review-modal',
  standalone: true,
  imports: [
    Header, ChangeConfirmation, IonContent,
    IonList, IonItem, IonLabel, IonNote, IonBadge, IonCheckbox,
    IonSelect, IonSelectOption, IonSegment, IonSegmentButton,
    IonAccordion, IonAccordionGroup, IonIcon, SvgIconPipe,
    IonChip, IonToggle, IonInfiniteScroll, IonInfiniteScrollContent,
  ],
  template: `
    <okr-header [i18n]="{ title: i18n.import_title() }" [isModal]="true" />
    <!-- the matcher's decisions are a valid starting point, so the import is offered as soon as at
         least one card is not skipped; the reset button returns to those decisions once edited. -->
    @if (!allSkipped()) {
      <okr-change-confirmation [i18n]="{ cancel: i18n.cancel(), save: i18n.import_start() }"
        [showCancel]="isDirty()" (saveClicked)="confirm()" (cancelClicked)="reset()" />
    }

    <ion-content class="ion-padding">
      <p>{{ i18n.import_intro() }}</p>

      @if (skippedCards() > 0) {
        <ion-note color="warning" class="ion-display-block">
          <ion-icon src="{{ 'warning' | svgIcon }}" color="warning" />
          {{ fill(i18n.import_skippedCards(), { count: skippedCards() }) }}
        </ion-note>
      }
      @for (warning of fileWarnings(); track $index) {
        <ion-note color="warning" class="ion-display-block">{{ warning }}</ion-note>
      }

      <div class="filters">
        @for (f of filters; track f) {
          <ion-chip [outline]="filter() !== f" (click)="setFilter(f)">{{ filterLabel(f) }} ({{ counts()[f] }})</ion-chip>
        }
      </div>
      <ion-list lines="none">
        <ion-item>
          <ion-select [label]="i18n.import_bulk_label()" interface="popover" [value]="null" (ionChange)="bulk($event.detail.value)">
            <ion-select-option value="import">{{ i18n.import_bulk_import() }}</ion-select-option>
            <ion-select-option value="merge">{{ i18n.import_bulk_merge() }}</ion-select-option>
            <ion-select-option value="skip">{{ i18n.import_bulk_skip() }}</ion-select-option>
          </ion-select>
        </ion-item>
      </ion-list>

      <ion-accordion-group [multiple]="true" (ionChange)="onExpanded($event.detail.value)">
        @for (i of visibleRows(); track i) {
          @let decision = state()[i];
          <ion-accordion [value]="'row-' + i">
            <ion-item slot="header" lines="full">
              <ion-icon src="{{ (decision.draft.kind === 'org' ? 'company' : 'person') | svgIcon }}" slot="start" />
              <ion-label>
                <h2>{{ decision.draft.displayName }}</h2>
                <ion-note>{{ decision.draft.sourceFileName }}</ion-note>
                <ion-note>{{ summaryLine(decision) }}</ion-note>
              </ion-label>
              <ion-badge [color]="isDuplicate(decision) ? 'warning' : 'success'">
                {{ isDuplicate(decision) ? i18n.import_status_duplicate() : i18n.import_status_new() }}
              </ion-badge>
            </ion-item>

            <div slot="content" class="ion-padding-start ion-padding-end ion-padding-bottom">
              @if (photoUrls()[i]; as url) {
                <img class="photo" [src]="url" alt="" />
              }
              @if (isDuplicate(decision)) {
                <ion-segment [value]="decision.action" (ionChange)="setAction(i, $event.detail.value)">
                  <ion-segment-button value="merge">
                    <ion-label>{{ i18n.import_action_merge() }}</ion-label>
                  </ion-segment-button>
                  <ion-segment-button value="skip">
                    <ion-label>{{ i18n.import_action_skip() }}</ion-label>
                  </ion-segment-button>
                  <ion-segment-button value="createAnyway">
                    <ion-label>{{ i18n.import_action_createAnyway() }}</ion-label>
                  </ion-segment-button>
                </ion-segment>
              } @else {
                <ion-segment [value]="decision.action" (ionChange)="setAction(i, $event.detail.value)">
                  <ion-segment-button value="import">
                    <ion-label>{{ i18n.import_action_import() }}</ion-label>
                  </ion-segment-button>
                  <ion-segment-button value="skip">
                    <ion-label>{{ i18n.import_action_skip() }}</ion-label>
                  </ion-segment-button>
                </ion-segment>
              }

              <ion-list lines="full">
                @if (decision.employerCandidates.length > 1) {
                  <ion-item>
                    <ion-select [value]="decision.employerKey" (ionChange)="setEmployerKey(i, $event.detail.value)" [label]="decision.draft.employment?.orgName">
                      <ion-select-option value="">{{ i18n.import_link_none() }}</ion-select-option>
                      @for (candidate of decision.employerCandidates; track candidate.okey) {
                        <ion-select-option [value]="candidate.okey">{{ candidate.name }}</ion-select-option>
                      }
                    </ion-select>
                  </ion-item>
                } @else if (decision.draft.employment && decision.employerKey === '' && decision.employerCandidates.length === 0) {
                  <ion-item>
                    <ion-checkbox [checked]="decision.createEmployer" (ionChange)="toggleCreateEmployer(i, $event.detail.checked)">
                      {{ fill(i18n.import_create_org(), { name: decision.draft.employment.orgName }) }}
                    </ion-checkbox>
                  </ion-item>
                }

                @for (relation of decision.relations; track $index; let r = $index) {
                  @if (relation.candidates.length > 1) {
                    <ion-item>
                      <ion-select [value]="relation.personKey" (ionChange)="setRelationPersonKey(i, r, $event.detail.value)" [label]="relationLabel(relation) + ': ' + relation.name">
                        <ion-select-option value="">{{ i18n.import_link_none() }}</ion-select-option>
                        @for (candidate of relation.candidates; track candidate.okey) {
                          <ion-select-option [value]="candidate.okey">{{ candidate.firstName }} {{ candidate.lastName }}</ion-select-option>
                        }
                      </ion-select>
                    </ion-item>
                  } @else if (relation.personKey === '' && relation.candidates.length === 0) {
                    <ion-item>
                      <ion-checkbox [checked]="relation.createPerson" (ionChange)="toggleCreatePerson(i, r, $event.detail.checked)">
                        {{ fill(i18n.import_create_person(), { name: relation.name }) }}
                      </ion-checkbox>
                    </ion-item>
                  }
                }

                @if (decision.draft.notes) {
                  <ion-item button (click)="toggleNotes(i)">
                    <ion-label>{{ i18n.import_notes_label() }} ({{ noteLineCount(decision) }})</ion-label>
                  </ion-item>
                  @if (notesExpanded().has(i)) {
                    <pre>{{ decision.draft.notes }}</pre>
                  }
                }
              </ion-list>

              @for (warning of decision.draft.warnings; track warning) {
                <ion-note color="warning" class="ion-display-block">
                  <ion-icon src="{{ 'warning' | svgIcon }}" color="warning" />
                  {{ warning }}
                </ion-note>
              }
            </div>
          </ion-accordion>
        }
      </ion-accordion-group>
      <ion-infinite-scroll [disabled]="visibleRows().length >= shownRows().length" (ionInfinite)="loadMore($event)">
        <ion-infinite-scroll-content />
      </ion-infinite-scroll>

      <ion-list lines="none">
        <ion-item>
          <ion-toggle [checked]="importPhotos()" (ionChange)="importPhotos.set($event.detail.checked)">{{ i18n.import_photos() }}</ion-toggle>
        </ion-item>
      </ion-list>
      <ion-note class="ion-text-center ion-display-block ion-margin-top">{{ summary() }}</ion-note>
      <ion-note class="ion-text-center ion-display-block">{{ i18n.import_keepAwake() }}</ion-note>
    </ion-content>
  `,
  styles: [`
    .filters { display: flex; flex-wrap: wrap; gap: 4px; }
    .photo { width: 96px; height: 96px; object-fit: cover; border-radius: 50%; margin: 8px 0; }
  `],
})
export class VcardImportReviewModal {
  private readonly modalController = inject(ModalController);
  protected readonly i18n = inject(I18nService).translateAll(VCARD_I18N_KEYS) as VcardI18n;

  public readonly decisions = input.required<VcardImportDecision[]>();
  /** cards the parser had to drop (§3.1.6) — shown so a missing row is never silent. */
  public readonly skippedCards = input<number>(0);
  /** file-level warnings that belong to no single card. */
  public readonly fileWarnings = input<string[]>([]);

  protected readonly state = signal<VcardImportDecision[]>([]);
  protected readonly notesExpanded = signal<Set<number>>(new Set());

  // ---- large-file review (spec 1.159 §4.2) ----
  protected readonly filters = REVIEW_FILTERS;
  protected readonly filter = signal<ReviewFilter>('all');
  protected readonly shown = signal(PAGE);
  protected readonly importPhotos = signal(true);
  protected readonly counts = computed(() => filterCounts(this.state()));
  /** indices of the rows the current filter shows — fixed while the filter is unchanged */
  protected readonly shownRows = computed(() => filterIndices(this.state(), this.filter()));
  protected readonly visibleRows = computed(() => this.shownRows().slice(0, this.shown()));
  /** object URLs of the photos of expanded rows; revoked on collapse and on destroy */
  protected readonly photoUrls = signal<Record<number, string>>({});

  private seeded = false;

  public constructor() {
    inject(DestroyRef).onDestroy(() => Object.values(this.photoUrls()).forEach((u) => URL.revokeObjectURL(u)));
    // Seed once from the input, never derive via computed: re-running the matcher
    // upstream (or any other re-emission of `decisions`) must not silently discard
    // the operator's edits (known repo bug class, see task-8 brief).
    effect(() => {
      const decisions = this.decisions();
      if (this.seeded) return;
      this.seeded = true;
      untracked(() => {
        this.initialState = decisions;
        this.reset();
      });
    });
  }

  /** the matcher's decisions as seeded — reset() copies them back */
  private initialState: VcardImportDecision[] = [];
  /** set by every edit (updateAt), cleared by reset(); not a deep compare — drafts carry base64 photos */
  protected readonly isDirty = signal(false);

  protected reset(): void {
    this.state.set(this.initialState.map((d) => ({ ...d, relations: d.relations.map((r) => ({ ...r })) })));
    this.isDirty.set(false);
  }

  protected readonly allSkipped = computed(() => this.state().every((d) => d.action === 'skip'));

  protected readonly summary = computed(() => {
    const list = this.state();
    const imported = list.filter((d) => d.action === 'import' || d.action === 'createAnyway').length;
    const merged = list.filter((d) => d.action === 'merge').length;
    const skipped = list.filter((d) => d.action === 'skip').length;
    return `${imported} ${this.i18n.import_status_new()} · ${merged} ${this.i18n.import_action_merge()} · ${skipped} ${this.i18n.import_action_skip()}`;
  });

  /** Template helper for the view — the single `fill` lives in `@okr/vcard-util`. */
  protected fill(template: string, params: Record<string, unknown>): string {
    return fill(template, params);
  }

  /** A card matching something already in the tenant — a person OR an org (§5.1, §5.2). */
  protected isDuplicate(decision: VcardImportDecision): boolean {
    return decision.duplicates.length > 0 || decision.orgDuplicates.length > 0;
  }

  /** What to call a relation in the picker: the decoded kind, else the card's raw label. */
  protected relationLabel(relation: Relation): string {
    return relation.type || relation.label;
  }

  protected summaryLine(decision: VcardImportDecision): string {
    const parts: string[] = [];
    if (decision.draft.addresses.length > 0) parts.push(`${decision.draft.addresses.length} ${this.i18n.scope_addresses()}`);
    if (decision.draft.dob) parts.push(this.i18n.scope_birthday());
    if (decision.draft.photo) parts.push(this.i18n.scope_photo());
    if (decision.draft.employment) parts.push(this.i18n.scope_workRels());
    if (decision.draft.relatedNames.length > 0) parts.push(`${decision.draft.relatedNames.length} ${this.i18n.scope_personalRels()}`);
    return parts.join(' · ');
  }

  protected noteLineCount(decision: VcardImportDecision): number {
    return decision.draft.notes ? decision.draft.notes.split('\n').length : 0;
  }

  protected toggleNotes(index: number): void {
    this.notesExpanded.update((set) => {
      const next = new Set(set);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }

  protected setAction(index: number, value: unknown): void {
    const action = value as VcardImportDecision['action'];
    this.updateAt(index, (d) => ({ ...d, action }));
  }

  protected setEmployerKey(index: number, value: unknown): void {
    const employerKey = typeof value === 'string' ? value : '';
    this.updateAt(index, (d) => ({ ...d, employerKey, createEmployer: false }));
  }

  protected toggleCreateEmployer(index: number, checked: boolean): void {
    this.updateAt(index, (d) => ({ ...d, createEmployer: checked }));
  }

  protected setRelationPersonKey(index: number, relationIndex: number, value: unknown): void {
    const personKey = typeof value === 'string' ? value : '';
    this.updateRelationAt(index, relationIndex, (r) => ({ ...r, personKey, createPerson: false }));
  }

  protected toggleCreatePerson(index: number, relationIndex: number, checked: boolean): void {
    this.updateRelationAt(index, relationIndex, (r) => ({ ...r, createPerson: checked }));
  }

  private updateAt(index: number, patch: (d: VcardImportDecision) => VcardImportDecision): void {
    this.state.update((list) => list.map((d, i) => (i === index ? patch(d) : d)));
    this.isDirty.set(true);
  }

  private updateRelationAt(index: number, relationIndex: number, patch: (r: Relation) => Relation): void {
    this.updateAt(index, (d) => ({
      ...d,
      relations: d.relations.map((r, i) => (i === relationIndex ? patch(r) : r)),
    }));
  }

  protected filterLabel(f: ReviewFilter): string {
    switch (f) {
      case 'all': return this.i18n.import_filter_all();
      case 'new': return this.i18n.import_filter_new();
      case 'duplicates': return this.i18n.import_filter_duplicates();
      case 'warnings': return this.i18n.import_filter_warnings();
    }
  }

  protected setFilter(f: ReviewFilter): void {
    this.filter.set(f);
    this.shown.set(PAGE);
  }

  /** Apply one action to every row the current filter shows (not only the rendered page). */
  protected bulk(value: unknown): void {
    if (value !== 'import' && value !== 'merge' && value !== 'skip') return;
    this.state.update((list) => applyBulkAction(list, this.shownRows(), value));
    this.isDirty.set(true);
  }

  protected loadMore(event: InfiniteScrollCustomEvent): void {
    this.shown.update((n) => n + PAGE);
    void event.target.complete();
  }

  /** Keep an object URL only for expanded rows that carry a photo. */
  protected onExpanded(value: unknown): void {
    const open = new Set((Array.isArray(value) ? value : [value]).filter((v): v is string => typeof v === 'string')
      .map((v) => Number(v.replace('row-', ''))));
    const next: Record<number, string> = {};
    for (const [key, url] of Object.entries(this.photoUrls())) {
      if (open.has(Number(key))) next[Number(key)] = url;
      else URL.revokeObjectURL(url);
    }
    for (const i of open) {
      const photo = this.state()[i]?.draft.photo;
      if (photo && !next[i]) next[i] = URL.createObjectURL(photo);
    }
    this.photoUrls.set(next);
  }

  public async confirm(): Promise<void> {
    const result: VcardImportReviewResult = { decisions: this.state(), importPhotos: this.importPhotos() };
    await dismissOverlay(this.modalController, result, 'confirm');
  }
}
