import { Component, computed, input, model, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { IonButton, IonCard, IonCardContent, IonCardHeader, IonCardTitle, IonIcon, IonInput, IonItem, IonLabel, IonList, IonNote, IonReorder, IonReorderGroup, IonSelect, IonSelectOption, IonTextarea, ItemReorderEventDetail } from '@ionic/angular/standalone';

import { AgendaItem, AgendaItemKind } from '@okr/shared-models';
import { SvgIconPipe } from '@okr/shared-pipes';

import { MeetingI18n, newAgendaItem } from '@okr/content-meeting-util';

/**
 * Editor for a meeting's agenda — the same shape as shared/ui property-list:
 * a reorderable ion-list with an add row, driven by a `model` array and an
 * `i18n` input. Dumb component: it knows nothing about stores or persistence.
 *
 * In `minutesMode` each item additionally shows the minutes text (and, for
 * decision items, the decision), plus a button that asks the parent to turn the
 * item into an action item.
 */
@Component({
  selector: 'okr-agenda-list',
  standalone: true,
  imports: [
    SvgIconPipe, FormsModule,
    IonCard, IonCardHeader, IonCardTitle, IonCardContent,
    IonList, IonItem, IonLabel, IonInput, IonButton, IonIcon, IonNote,
    IonReorderGroup, IonReorder, IonSelect, IonSelectOption, IonTextarea,
  ],
  template: `
    <ion-card>
      <ion-card-header>
        <ion-card-title>{{ i18n().agenda_title() }}</ion-card-title>
      </ion-card-header>
      <ion-card-content>
        @if (!isReadOnly()) {
          <ion-item lines="none">
            <ion-input
              name="agendaItemTitle"
              [ngModel]="newTitle()"
              (ngModelChange)="newTitle.set($event)"
              [label]="i18n().agenda_add()"
              labelPlacement="floating"
              inputMode="text"
              type="text"
              [maxlength]="100"
              [placeholder]="i18n().agenda_item_placeholder()" />
            <ion-button [disabled]="isAddDisabled()" (click)="add()">{{ i18n().agenda_add() }}</ion-button>
          </ion-item>
        }

        @if (agenda(); as agenda) {
          @if (agenda.length === 0) {
            <ion-item lines="none">
              <ion-note>{{ i18n().agenda_empty() }}</ion-note>
            </ion-item>
          } @else {
            <ion-list>
              <!-- Casting $event to $any is a temporary fix for this bug https://github.com/ionic-team/ionic-framework/issues/24245 -->
              <ion-reorder-group [disabled]="isReadOnly()" (ionItemReorder)="reorder($any($event))">
                @for (item of agenda; track item.key) {
                  <ion-item>
                    @if (!isReadOnly()) { <ion-reorder slot="start" /> }
                    <ion-label>
                      {{ $index + 1 }}. {{ item.title }}
                      @if (item.carriedFromMeetingKey) {
                        <ion-note> · {{ i18n().agenda_carried() }}</ion-note>
                      }
                    </ion-label>
                    <ion-select
                      slot="end"
                      interface="popover"
                      [disabled]="isReadOnly()"
                      [value]="item.kind"
                      (ionChange)="setKind(item.key, $any($event).detail.value)">
                      <ion-select-option value="info">{{ i18n().agenda_kind_info() }}</ion-select-option>
                      <ion-select-option value="discussion">{{ i18n().agenda_kind_discussion() }}</ion-select-option>
                      <ion-select-option value="decision">{{ i18n().agenda_kind_decision() }}</ion-select-option>
                    </ion-select>
                    @if (!isReadOnly()) {
                      <ion-icon src="{{ 'cancel' | svgIcon }}" (click)="remove(item.key)" slot="end" />
                    }
                  </ion-item>

                  @if (minutesMode()) {
                    <ion-item lines="none">
                      <ion-textarea
                        [label]="i18n().agenda_minutes_label()"
                        labelPlacement="floating"
                        [autoGrow]="true"
                        [readonly]="isReadOnly()"
                        [placeholder]="i18n().agenda_minutes_placeholder()"
                        [ngModel]="item.minutes"
                        [name]="'minutes-' + item.key"
                        (ngModelChange)="setText(item.key, 'minutes', $event)" />
                    </ion-item>
                    @if (item.kind === 'decision') {
                      <ion-item lines="none">
                        <ion-textarea
                          [label]="i18n().agenda_decision_label()"
                          labelPlacement="floating"
                          [autoGrow]="true"
                          [readonly]="isReadOnly()"
                          [placeholder]="i18n().agenda_decision_placeholder()"
                          [ngModel]="item.decision"
                          [name]="'decision-' + item.key"
                          (ngModelChange)="setText(item.key, 'decision', $event)" />
                      </ion-item>
                    }
                    @if (!isReadOnly()) {
                      <ion-item lines="none">
                        <ion-button fill="clear" size="small" (click)="addTask.emit(item)">
                          <ion-icon src="{{ 'add' | svgIcon }}" slot="start" />
                          {{ i18n().agenda_addTask() }}
                        </ion-button>
                      </ion-item>
                    }
                  }
                }
              </ion-reorder-group>
            </ion-list>
          }
        }
      </ion-card-content>
    </ion-card>
  `
})
export class AgendaList {
  // inputs
  public agenda = model.required<AgendaItem[]>();
  public readonly i18n = input.required<MeetingI18n>();
  public readonly readOnly = input(false);
  public readonly minutesMode = input(false);

  // outputs — the parent decides what an action item is; this component only asks
  public readonly addTask = output<AgendaItem>();

  // signals
  protected newTitle = signal('');
  protected readonly isReadOnly = computed(() => this.readOnly() === true);
  protected readonly isAddDisabled = computed(() => this.newTitle().trim().length === 0);

  protected add(): void {
    const title = this.newTitle().trim();
    if (title.length === 0) return;
    this.agenda.update(agenda => [...agenda, { ...newAgendaItem(agenda, title) }]);
    this.newTitle.set('');
  }

  protected remove(key: string): void {
    this.agenda.update(agenda => agenda.filter(item => item.key !== key));
  }

  protected setKind(key: string, kind: AgendaItemKind): void {
    this.agenda.update(agenda => agenda.map(item => item.key === key ? { ...item, kind } : item));
  }

  protected setText(key: string, field: 'minutes' | 'decision', value: string): void {
    this.agenda.update(agenda => agenda.map(item => item.key === key ? { ...item, [field]: value } : item));
  }

  /**
   * Finish the reorder and position the item based on where the gesture ended.
   * @param ev the custom dom event with the reordered items
   */
  protected reorder(ev: CustomEvent<ItemReorderEventDetail>): void {
    this.agenda.update(agenda => ev.detail.complete([...agenda]));
  }
}
