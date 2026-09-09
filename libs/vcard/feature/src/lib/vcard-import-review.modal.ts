import { Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import {
  IonAccordion,
  IonAccordionGroup,
  IonBadge,
  IonButton,
  IonButtons,
  IonCheckbox,
  IonContent,
  IonHeader,
  IonIcon,
  IonItem,
  IonLabel,
  IonList,
  IonNote,
  IonSegment,
  IonSegmentButton,
  IonSelect,
  IonSelectOption,
  IonTitle,
  IonToolbar,
  ModalController,
} from '@ionic/angular/standalone';

import { I18nService } from '@okr/shared-i18n';
import { SvgIconPipe } from '@okr/shared-pipes';
import { dismissOverlay } from '@okr/shared-util-angular';
import { VcardImportDecision, VCARD_I18N_KEYS, VcardI18n } from '@okr/vcard-util';

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
    IonHeader, IonToolbar, IonTitle, IonButtons, IonButton, IonContent,
    IonList, IonItem, IonLabel, IonNote, IonBadge, IonCheckbox,
    IonSelect, IonSelectOption, IonSegment, IonSegmentButton,
    IonAccordion, IonAccordionGroup, IonIcon, SvgIconPipe,
  ],
  template: `
    <ion-header>
      <ion-toolbar color="secondary">
        <ion-title>{{ i18n.import_title() }}</ion-title>
        <ion-buttons slot="end">
          <ion-button (click)="cancel()">{{ i18n.cancel() }}</ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>

    <ion-content class="ion-padding">
      <p>{{ i18n.import_intro() }}</p>

      <ion-accordion-group [multiple]="true">
        @for (decision of state(); track decision.draft.sourceFileName + $index; let i = $index) {
          <ion-accordion [value]="'row-' + i">
            <ion-item slot="header" lines="full">
              <ion-label>
                <h2>{{ decision.draft.displayName }}</h2>
                <ion-note>{{ summaryLine(decision) }}</ion-note>
              </ion-label>
              <ion-badge [color]="decision.duplicates.length > 0 ? 'warning' : 'success'">
                {{ decision.duplicates.length > 0 ? i18n.import_status_duplicate() : i18n.import_status_new() }}
              </ion-badge>
            </ion-item>

            <div slot="content" class="ion-padding-start ion-padding-end ion-padding-bottom">
              @if (decision.duplicates.length > 0) {
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

                @for (relation of decision.relations; track relation.name; let r = $index) {
                  @if (relation.candidates.length > 1) {
                    <ion-item>
                      <ion-select [value]="relation.personKey" (ionChange)="setRelationPersonKey(i, r, $event.detail.value)" [label]="relation.label + ': ' + relation.name">
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

      <ion-button expand="block" class="ion-margin-top" [disabled]="allSkipped()" (click)="confirm()">
        {{ i18n.import_start() }}
      </ion-button>
      <ion-note class="ion-text-center ion-display-block">{{ summary() }}</ion-note>
    </ion-content>
  `,
})
export class VcardImportReviewModal {
  private readonly modalController = inject(ModalController);
  protected readonly i18n = inject(I18nService).translateAll(VCARD_I18N_KEYS) as VcardI18n;

  public readonly decisions = input.required<VcardImportDecision[]>();

  protected readonly state = signal<VcardImportDecision[]>([]);
  protected readonly notesExpanded = signal<Set<number>>(new Set());

  private seeded = false;

  public constructor() {
    // Seed once from the input, never derive via computed: re-running the matcher
    // upstream (or any other re-emission of `decisions`) must not silently discard
    // the operator's edits (known repo bug class, see task-8 brief).
    effect(() => {
      const decisions = this.decisions();
      if (this.seeded) return;
      this.seeded = true;
      untracked(() => {
        this.state.set(decisions.map((d) => ({ ...d, relations: d.relations.map((r) => ({ ...r })) })));
      });
    });
  }

  protected readonly allSkipped = computed(() => this.state().every((d) => d.action === 'skip'));

  protected readonly summary = computed(() => {
    const list = this.state();
    const imported = list.filter((d) => d.action === 'import' || d.action === 'createAnyway').length;
    const merged = list.filter((d) => d.action === 'merge').length;
    const skipped = list.filter((d) => d.action === 'skip').length;
    return this.fill(this.i18n.import_summary(), {
      imported: String(imported),
      merged: String(merged),
      skipped: String(skipped),
      failed: '0',
    });
  });

  protected fill(template: string, params: Record<string, string>): string {
    return template.replace(/\{(\w+)\}/g, (match, key: string) => (key in params ? params[key] : match));
  }

  protected summaryLine(decision: VcardImportDecision): string {
    const parts: string[] = [];
    if (decision.draft.addresses.length > 0) parts.push(`${decision.draft.addresses.length} Kanäle`);
    if (decision.draft.dob) parts.push('Geburtstag');
    if (decision.draft.photoBase64) parts.push('Foto');
    if (decision.draft.employment) parts.push('Anstellung');
    if (decision.draft.relatedNames.length > 0) parts.push(`${decision.draft.relatedNames.length} Beziehungen`);
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
  }

  private updateRelationAt(index: number, relationIndex: number, patch: (r: Relation) => Relation): void {
    this.updateAt(index, (d) => ({
      ...d,
      relations: d.relations.map((r, i) => (i === relationIndex ? patch(r) : r)),
    }));
  }

  public async confirm(): Promise<void> {
    await dismissOverlay(this.modalController, this.state(), 'confirm');
  }

  public async cancel(): Promise<void> {
    await dismissOverlay(this.modalController, undefined, 'cancel');
  }
}
