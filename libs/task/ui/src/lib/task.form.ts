import { Component, computed, effect, input, linkedSignal, model, output } from '@angular/core';
import { AsyncPipe } from '@angular/common';
import { IonButton, IonCard, IonCardContent, IonCol, IonGrid, IonIcon, IonItem, IonLabel, IonRow, IonTextarea } from '@ionic/angular/standalone';

import { DEFAULT_NOTES, DEFAULT_TAGS, LONG_NAME_LENGTH } from '@okr/shared-constants';
import { TranslatePipe } from '@okr/shared-i18n';
import { CategoryListModel, RoleName, TaskModel, UserModel } from '@okr/shared-models';
import { SvgIconPipe } from '@okr/shared-pipes';
import { CategorySelect, Chips, DateInput, DateInputI18n, ErrorNote, TextInput, TextInputI18n } from '@okr/shared-ui';
import { coerceBoolean, getCategoryIcon, getItemLabel, getNextCategoryName, hasRole } from '@okr/shared-util-core';
import { getRelatedIcon, getRelatedModelType, getRelatedRoute, TaskI18n, taskValidations } from '@okr/task-util';

@Component({
  selector: 'okr-task-form',
  standalone: true,
  imports: [
    DateInput, CategorySelect, Chips,
    TextInput, ErrorNote, SvgIconPipe, TranslatePipe, AsyncPipe,
    IonGrid, IonRow, IonCol, IonCard, IonCardContent, IonLabel, IonItem, IonIcon, IonButton, IonTextarea
],
  styles: [`
    @media (width <= 600px) { ion-card { margin: 5px;} }
    /* the payload reads like the name, not like a footnote */
    ion-textarea.payload { font-size: 1rem; --padding-top: 0; }
    ion-button.state { --padding-start: 0; --padding-end: 0; margin: 0; }
    /* mirrors ion-card-title: the name is the heading of the simplified view, not a field */
    ion-label.card-title { font-size: 1.25rem; font-weight: 600; }
  `],
  template: `
  @if (showForm()) {
    <form novalidate>

      <!-- The default view shows only what a task is ABOUT: its name, the record it was opened
           for, and the payload a workflow event handed over in notes (a Schadenmeldung's
           'Boot: Meldung'). Everything an assignee rarely touches sits behind the toolbar
           toggle the parent modal owns (showAdvanced). -->
      <ion-card>
        <ion-card-content class="ion-no-padding">
          <ion-grid>
            @if(showAdvanced() && hasRole('admin')) {
              <ion-row>
                <ion-col size="12" size-md="6">
                  <okr-text-input [i18n]="okeyI18n()" [value]="okey()" [readOnly]="true" [copyable]="true" />
                </ion-col>
              </ion-row>
            }
            <!-- state icon + name + payload: what the task IS, without a label in sight.
                 Simplified, the name is a card title; expanded, it becomes the editable field. -->
            <ion-row class="ion-align-items-center">
              <ion-col size="auto">
                <ion-button class="state" fill="clear" [disabled]="isReadOnly()" (click)="nextState()"
                  title="{{ stateLabel() | translate | async }}">
                  <ion-icon slot="icon-only" src="{{ stateIcon() | svgIcon }}" />
                </ion-button>
              </ion-col>
              <ion-col>
                @if(showAdvanced()) {
                  <okr-text-input [i18n]="nameI18n()" [value]="name()" (valueChange)="onFieldChange('name', $event)" [maxLength]="nameLength" [autofocus]="true" [readOnly]="isReadOnly()" [copyable]="true" />
                  <okr-error-note [errors]="nameErrors()" />
                } @else {
                  <ion-label class="card-title ion-text-wrap">{{ name() }}</ion-label>
                }
              </ion-col>
            </ion-row>
            <ion-row>
              <ion-col size="12">
                <ion-textarea class="payload"
                  [value]="notes()" (ionInput)="onFieldChange('notes', $any($event.target).value ?? '')"
                  placeholder="{{ i18n().notes_placeholder() }}"
                  [readonly]="isReadOnly()" [autoGrow]="true" [rows]="2" />
              </ion-col>
            </ion-row>
            @if(relatedRoute()) {
              <ion-row>
                <ion-col size="12" size-md="6">
                  <ion-item lines="none" button (click)="relatedClicked.emit(relatedRoute())">
                    @if(relatedIcon()) {
                      <ion-icon src="{{ relatedIcon() | svgIcon }}" slot="start" />
                    }
                    <ion-label>
                      <p>{{ i18n().related_label() }}</p>
                      {{ relatedLabel() }}
                    </ion-label>
                  </ion-item>
                </ion-col>
              </ion-row>
            }
            <!-- the due date only earns a row when it is set; expanded, it is always there -->
            @if(showAdvanced() || dueDate()) {
              <ion-row>
                <ion-col size="12" size-md="6">
                  <okr-date-input [i18n]="dueDateI18n()" [storeDate]="dueDate()" (storeDateChange)="onFieldChange('dueDate', $event)" [readOnly]="isReadOnly()" />
                </ion-col>
              </ion-row>
            }
            @if(showAdvanced()) {
              <ion-row>
                <ion-col size="12" size-md="6">
                  <ion-item lines="none">
                    <ion-label>{{ i18n().state_label() }}:</ion-label>
                    <okr-cat-select [category]="states()!" [selectedItemName]="state()" (selectedItemNameChange)="onFieldChange('state', $event)" [readOnly]="isReadOnly()" [withAll]="false" />
                  </ion-item>
                </ion-col>
                <ion-col size="12" size-md="6">
                  <okr-date-input [i18n]="completionDateI18n()" [storeDate]="completionDate()" (storeDateChange)="onFieldChange('completionDate', $event)" [readOnly]="isReadOnly()" />
                </ion-col>
              </ion-row>
              <ion-row>
                <ion-col size="12" size-md="6">
                  <ion-item lines="none">
                    <ion-label>{{ i18n().priority() }}:</ion-label>
                    <okr-cat-select [category]="priorities()!" [selectedItemName]="priority()" (selectedItemNameChange)="onFieldChange('priority', $event)" [readOnly]="isReadOnly()" [withAll]="false" />
                  </ion-item>
                </ion-col>
                <ion-col size="12" size-md="6">
                  <ion-item lines="none">
                    <ion-label>{{ i18n().importance() }}:</ion-label>
                    <okr-cat-select [category]="importances()!" [selectedItemName]="importance()" (selectedItemNameChange)="onFieldChange('importance', $event)" [readOnly]="isReadOnly()" [withAll]="false" />
                  </ion-item>
                </ion-col>
              </ion-row>
            }
          </ion-grid>
        </ion-card-content>
      </ion-card>

      @if(showAdvanced() && (hasRole('privileged') || hasRole('eventAdmin'))) {
        <okr-chips chipName="tag" [storedChips]="tags()" (storedChipsChange)="onFieldChange('tags', $event)" [allChips]="allTags()" [readOnly]="isReadOnly()" />
      }
    </form>
  }
`
})
export class TaskForm {
  // inputs
  public readonly i18n = input.required<TaskI18n>();
  public readonly formData = model.required<TaskModel>();
  public readonly currentUser = input<UserModel | undefined>();
  public readonly showForm = input(true);   // used for initializing the form and resetting vest validations
  public readonly allTags = input.required<string>();
  public readonly tenantId = input.required<string>();
  public readonly states = input.required<CategoryListModel>();
  public readonly priorities = input.required<CategoryListModel>();
  public readonly importances = input.required<CategoryListModel>();
  public readonly readOnly = input(true);
  protected isReadOnly = computed(() => coerceBoolean(this.readOnly()));

  // shared with the parent modal: author/calendars live there and follow the same toggle
  public readonly showAdvanced = model(false);

 // signals
  public dirty = output<boolean>();
  public valid = output<boolean>();
  public relatedClicked = output<string>();   // the url of the related record

  constructor() { effect(() => this.valid.emit(this.validationResult().isValid())); }

  // validation and errors
  private readonly validationResult = computed(() => taskValidations(this.formData(), this.tenantId(), this.allTags()));
  protected nameErrors = computed(() => this.validationResult().getErrors('name'));

  // fields
  protected name = linkedSignal(() => this.formData().name);
  protected dueDate = linkedSignal(() => this.formData().dueDate);
  protected completionDate = linkedSignal(() => this.formData().completionDate);
  protected state = linkedSignal(() => this.formData().state);
  protected priority = linkedSignal(() => this.formData().priority);
  protected importance = linkedSignal(() => this.formData().importance);
  protected tags = linkedSignal(() => this.formData().tags ?? DEFAULT_TAGS);
  protected notes = linkedSignal(() => this.formData().notes ?? DEFAULT_NOTES);
  protected okey = computed(() => this.formData().okey ?? '');

  // The state is a click-through icon in front of the name: one tap advances to the next item
  // of the task_state category. The labelled select stays available in the expanded view.
  protected stateIcon = computed(() => getCategoryIcon(this.states(), this.state()));
  protected stateLabel = computed(() => getItemLabel(this.states(), this.state()));

  // The record this task links to (workflow engine, spec 1.35): linkKey when the emitter set one
  // (a damage report links to its trip, while relatedKey holds the per-report dedup uuid),
  // relatedKey otherwise. Legacy tasks have neither — Firestore reads skip model defaults —
  // hence the coalesce.
  protected linkKey = computed(() => this.formData().linkKey || this.formData().relatedKey || '');
  protected relatedRoute = computed(() => getRelatedRoute(this.linkKey()));
  protected relatedIcon = computed(() => getRelatedIcon(this.linkKey()));
  protected relatedLabel = computed(() => {
    const i18n = this.i18n();
    switch (getRelatedModelType(this.linkKey())) {
      case 'person':  return i18n.related_person();
      case 'group':   return i18n.related_group();
      case 'user':    return i18n.related_user();
      case 'meeting': return i18n.related_meeting();
      case 'trip':    return i18n.related_trip();
      default:        return '';
    }
  });

  // passing constants to template
  protected nameLength = LONG_NAME_LENGTH;

  // i18n
  protected okeyI18n = computed(() => ({
    name: 'okey',
    label: this.i18n().okey_label(),
    placeholder: this.i18n().okey_placeholder(),
    helper: this.i18n().okey_helper()
  } as TextInputI18n));

  protected nameI18n = computed(() => ({
    name: 'name',
    label: this.i18n().name_label(),
    placeholder: this.i18n().name_placeholder(),
    helper: this.i18n().name_helper()
  } as TextInputI18n));

  protected dueDateI18n = computed(() => ({ name: 'dueDate', label: this.i18n().dueDate_label(), placeholder: this.i18n().dueDate_placeholder(), helper: this.i18n().dueDate_helper() } as DateInputI18n));
  protected completionDateI18n = computed(() => ({ name: 'completionDate', label: this.i18n().completionDate_label(), placeholder: this.i18n().completionDate_placeholder(), helper: this.i18n().completionDate_helper() } as DateInputI18n));

  /******************************* actions *************************************** */
  protected onFieldChange(fieldName: string, fieldValue: string | number | boolean): void {
    this.dirty.emit(true);
    this.formData.update((vm) => ({ ...vm, [fieldName]: fieldValue }));
  }

  /** Advance the task to the next state (the click-through order of the task_state category). */
  protected nextState(): void {
    const next = getNextCategoryName(this.states(), this.state());
    if (!next || next === this.state()) return;
    this.onFieldChange('state', next);
  }

  protected hasRole(role: RoleName): boolean {
    return hasRole(role, this.currentUser());
  }
}
