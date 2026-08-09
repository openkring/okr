import { Component, computed, effect, input, model, output } from '@angular/core';
import { form } from '@angular/forms/signals';
import { IonCard, IonCardContent, IonCardHeader, IonCardSubtitle, IonCol, IonGrid, IonRow } from '@ionic/angular/standalone';

import { TicketModel, UserModel } from '@okr/shared-models';
import {
  CategorySelect, NotesInput, NotesInputI18n, TextInput, TextInputI18n,
} from '@okr/shared-ui';
import { coerceBoolean } from '@okr/shared-util-core';
import { validateVestTree } from '@okr/shared-util-angular';

import {
  TicketI18n, ticketClassificationCategory, ticketSeverityCategory, ticketValidations,
} from '@okr/business-ticket-util';

/**
 * One escalation, as bkaiser sees it (C4 §4/§6.1).
 *
 * **Two halves, and the split is the point.** The first card is the partner's §3 submission and the
 * §6.1 diagnostic format — every field of it is `readOnly`, unconditionally, not merely when the
 * operator lacks a role. It is somebody else's report; editing it would make the record disagree
 * with what was actually escalated, and `appVersion` in particular is the field the whole
 * supported-window refusal turns on. The second card is the triage block, and it is the only thing
 * this form can change.
 *
 * **What is deliberately not rendered.** `sentryEventJson` and `attachmentPaths` have no field
 * here. The Sentry export is a blob to be read in Sentry, not scrolled in a text box, and an
 * attachment is the one artefact §6.1 keeps behind the CF-only `tenant/kring/private/` prefix —
 * putting either on a screen is how a diagnostics record starts being browsed like a document.
 *
 * `classifiedBy` is not rendered either: it is a staff uid, it is set by the callable, and showing
 * it would invite somebody to type one in.
 */
@Component({
  selector: 'okr-ticket-form',
  standalone: true,
  imports: [
    TextInput, NotesInput, CategorySelect,
    IonGrid, IonRow, IonCol, IonCard, IonCardContent, IonCardHeader, IonCardSubtitle,
  ],
  styles: [`@media (width <= 600px) { ion-card { margin: 5px;} }`],
  template: `
    @if (showForm()) {
      <form novalidate>

        <!-- the partner's report — read-only, always -->
        <ion-card>
          <ion-card-content class="ion-no-padding">
            <ion-grid>
              <ion-row>
                <ion-col size="12" size-md="6">
                  <okr-text-input [i18n]="appVersionI18n()" [value]="appVersion()" [readOnly]="true" />
                </ion-col>
                <ion-col size="12" size-md="6">
                  <okr-text-input [i18n]="affectedTenantI18n()" [value]="affectedTenantId()" [readOnly]="true" />
                </ion-col>
              </ion-row>
              <ion-row>
                <ion-col size="12" size-md="6">
                  <okr-text-input [i18n]="firebaseProjectI18n()" [value]="firebaseProjectId()" [readOnly]="true" />
                </ion-col>
                <ion-col size="12" size-md="6">
                  <okr-text-input [i18n]="platformI18n()" [value]="platform()" [readOnly]="true" />
                </ion-col>
              </ion-row>
              <ion-row>
                <ion-col size="12" size-md="6">
                  <okr-text-input [i18n]="sentryI18n()" [value]="sentryEventUrl()" [readOnly]="true" />
                </ion-col>
                <ion-col size="12" size-md="6">
                  <okr-text-input [i18n]="featureI18n()" [value]="feature()" [readOnly]="true" />
                </ion-col>
              </ion-row>
              <ion-row>
                <ion-col size="12">
                  <okr-notes-input [i18n]="reproI18n()" [value]="reproSteps()" [readOnly]="true" />
                </ion-col>
              </ion-row>
              <ion-row>
                <ion-col size="12">
                  <okr-notes-input [i18n]="descriptionI18n()" [value]="description()" [readOnly]="true" />
                </ion-col>
              </ion-row>
            </ion-grid>
          </ion-card-content>
        </ion-card>

        <!-- triage: the only editable half -->
        <ion-card>
          <ion-card-header>
            <ion-card-subtitle>{{ i18n().classification_label() }}</ion-card-subtitle>
          </ion-card-header>
          <ion-card-content class="ion-no-padding">
            <ion-grid>
              <ion-row>
                <ion-col size="12" size-md="6">
                  <!-- a select, not a text field: a typo'd classification is one isChargeable does
                       not know about, i.e. silently free -->
                  <okr-cat-select [category]="classificationCategory()" [selectedItemName]="classification()"
                    (selectedItemNameChange)="onFieldChange('classification', $event)"
                    [showHelper]="true" [readOnly]="isReadOnly()" />
                </ion-col>
                <ion-col size="12" size-md="6">
                  <okr-cat-select [category]="severityCategory()" [selectedItemName]="severity()"
                    (selectedItemNameChange)="onFieldChange('severity', $event)"
                    [showHelper]="true" [readOnly]="isReadOnly()" />
                </ion-col>
              </ion-row>
              <ion-row>
                <ion-col size="12">
                  <okr-notes-input [i18n]="reasonI18n()" [value]="classificationReason()"
                    (valueChange)="onFieldChange('classificationReason', $event)" [readOnly]="isReadOnly()" />
                </ion-col>
              </ion-row>
              <ion-row>
                <ion-col size="12" size-md="6">
                  <okr-text-input [i18n]="fixVersionI18n()" [value]="fixVersion()"
                    (valueChange)="onFieldChange('fixVersion', $event)"
                    [maxLength]="20" [readOnly]="isReadOnly()" />
                </ion-col>
              </ion-row>
            </ion-grid>
          </ion-card-content>
        </ion-card>
      </form>
    }
  `,
})
export class TicketForm {
  // inputs
  public readonly i18n = input.required<TicketI18n>();
  public formData = model.required<TicketModel>();
  public readonly currentUser = input<UserModel | undefined>();
  public readonly readOnly = input(true);
  public readonly showForm = input(true);
  public readonly tenantId = input.required<string>();

  // outputs
  public readonly dirty = output<boolean>();
  public readonly valid = output<boolean>();

  protected readonly ticketForm = form(this.formData, (path) =>
    validateVestTree(path, ticketValidations as any),
  );

  constructor() {
    effect(() => this.valid.emit(this.ticketForm().valid()));
  }

  // computed field accessors
  protected readonly isReadOnly = computed(() => coerceBoolean(this.readOnly()));
  protected readonly appVersion = computed(() => this.formData()?.appVersion ?? '');
  protected readonly affectedTenantId = computed(() => this.formData()?.affectedTenantId ?? '');
  protected readonly firebaseProjectId = computed(() => this.formData()?.firebaseProjectId ?? '');
  protected readonly platform = computed(() => this.formData()?.platform ?? '');
  protected readonly sentryEventUrl = computed(() => this.formData()?.sentryEventUrl ?? '');
  protected readonly feature = computed(() => this.formData()?.feature ?? '');
  protected readonly reproSteps = computed(() => this.formData()?.reproSteps ?? '');
  protected readonly description = computed(() => this.formData()?.description ?? '');
  protected readonly classification = computed(() => this.formData()?.classification ?? 'unclassified');
  protected readonly severity = computed(() => this.formData()?.severity ?? 'blocking');
  protected readonly classificationReason = computed(() => this.formData()?.classificationReason ?? '');
  protected readonly fixVersion = computed(() => this.formData()?.fixVersion ?? '');

  protected classificationCategory = computed(() => ticketClassificationCategory(this.tenantId()));
  protected severityCategory = computed(() => ticketSeverityCategory(this.tenantId()));

  protected appVersionI18n = computed(() => this.text('appVersion',
    this.i18n().appVersion_label(), this.i18n().appVersion_placeholder(), this.i18n().appVersion_helper()));
  protected affectedTenantI18n = computed(() => this.text('affectedTenantId',
    this.i18n().affectedTenantId_label(), this.i18n().affectedTenantId_placeholder(), this.i18n().affectedTenantId_helper()));
  protected firebaseProjectI18n = computed(() => this.text('firebaseProjectId',
    this.i18n().firebaseProjectId_label(), this.i18n().firebaseProjectId_placeholder(), this.i18n().firebaseProjectId_helper()));
  protected platformI18n = computed(() => this.text('platform',
    this.i18n().platform_label(), this.i18n().platform_placeholder(), this.i18n().platform_helper()));
  protected sentryI18n = computed(() => this.text('sentryEventUrl',
    this.i18n().sentryEventUrl_label(), this.i18n().sentryEventUrl_placeholder(), this.i18n().sentryEventUrl_helper()));
  protected featureI18n = computed(() => this.text('feature',
    this.i18n().feature_label(), this.i18n().feature_placeholder(), this.i18n().feature_helper()));
  protected fixVersionI18n = computed(() => this.text('fixVersion',
    this.i18n().fixVersion_label(), this.i18n().fixVersion_placeholder(), this.i18n().fixVersion_helper()));

  protected reproI18n = computed(() => ({
    name: 'reproSteps',
    label: this.i18n().reproSteps_label(),
    placeholder: this.i18n().reproSteps_placeholder(),
  } as NotesInputI18n));
  protected descriptionI18n = computed(() => ({
    name: 'description',
    label: this.i18n().description_label(),
    placeholder: this.i18n().description_placeholder(),
  } as NotesInputI18n));
  protected reasonI18n = computed(() => ({
    name: 'classificationReason',
    label: this.i18n().classificationReason_label(),
    placeholder: this.i18n().classificationReason_placeholder(),
  } as NotesInputI18n));

  private text(name: string, label: string, placeholder: string, helper: string): TextInputI18n {
    return { name, label, placeholder, helper } as TextInputI18n;
  }

  protected onFieldChange(fieldName: string, fieldValue: string | string[] | number): void {
    this.dirty.emit(true);
    this.formData.update((vm) => ({ ...vm, [fieldName]: fieldValue }));
  }
}
