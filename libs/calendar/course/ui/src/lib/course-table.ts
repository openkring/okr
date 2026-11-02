import { DestroyRef, PLATFORM_ID, Component, computed, inject, input, output, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import {
  IonButton, IonCard, IonCardContent, IonCardHeader, IonCardTitle, IonChip, IonIcon, IonItem, IonLabel, IonList, IonListHeader, IonNote
} from '@ionic/angular';

import {
  CompensationLine, CourseCell, CourseI18n, CourseRowPerson, CourseTable as CourseTableData, ExportFinding, missingNumberKeys, presentCounts,
  VisibleFindings
} from '@okr/calendar-course-util';
import { AttendanceEntry, Attendee, CalEventModel } from '@okr/shared-models';
import { SvgIconPipe } from '@okr/shared-pipes';

/** Below this width the table tips over into one list per event (spec 1.132 §8). */
const WIDE_MEDIA_QUERY = '(min-width: 768px)';

const PRESENCE_ICON: Record<AttendanceEntry['presence'], string> = { present: 'checkbox-circle', absent: 'cancel-circle', excused: 'remove-circle' };
const PRESENCE_COLOR: Record<AttendanceEntry['presence'], string> = { present: 'success', absent: 'danger', excused: 'warning' };
const SIGN_UP_ICON: Record<Attendee['state'], string> = { accepted: 'checkmark', declined: 'cancel', invited: 'time' };

/**
 * The course table (spec 1.132 §8), presentational: one column per course event (date, time, type, confirmed), one
 * row per person (trainers first). A cell shows the sign-up small and the attendance large; a stored `leader` gets
 * the trainer star; the prefill is shown faded (it is a proposal, never stored, D12). Sums per event and per person.
 * Below 768px the same data is a list per event.
 *
 * Optional parts, each decided by the caller: the findings of the report profile, the compensation columns (only
 * for people who may read the amounts — members never get them, D7) and the unassigned group events («gehört dazu?»).
 */
@Component({
  selector: 'okr-course-table',
  standalone: true,
  imports: [SvgIconPipe, IonCard, IonCardHeader, IonCardTitle, IonCardContent, IonList, IonListHeader, IonItem, IonLabel, IonNote, IonIcon, IonButton, IonChip],
  styles: [`
    .scroller { overflow-x: auto; max-width: 100%; }
    table { border-collapse: collapse; font-size: 0.9em; }
    th, td { padding: 4px 6px; text-align: center; border-bottom: 1px solid var(--ion-color-light-shade); white-space: nowrap; }
    th.person, td.person { text-align: left; position: sticky; left: 0; background: var(--ion-background-color, #fff); z-index: 1; }
    th.event { cursor: pointer; vertical-align: bottom; }
    th.event.disabled { cursor: default; }
    .date { font-weight: bold; }
    .meta { font-weight: normal; font-size: 0.8em; color: var(--ion-color-medium); }
    .cell { display: inline-flex; align-items: center; gap: 2px; }
    .presence { width: 22px; height: 22px; }
    .sign-up { width: 12px; height: 12px; color: var(--ion-color-medium); }
    .leader { width: 12px; height: 12px; color: var(--ion-color-warning); }
    .prefill { opacity: 0.35; }
    .sum, .money { font-variant-numeric: tabular-nums; }
    tfoot td { font-weight: bold; }
    .legend { display: flex; flex-wrap: wrap; gap: 12px; padding: 8px 16px; font-size: 0.85em; color: var(--ion-color-medium); }
    .legend span { display: inline-flex; align-items: center; gap: 4px; }
    .finding-error { color: var(--ion-color-danger); font-size: 0.85em; }
  `],
  template: `
    @if (findings(); as findings) {
      @if (findings.incompleteSettings || findings.findings.length > 0) {
        <ion-card>
          <ion-card-header><ion-card-title>{{ i18n().findings_title() }}</ion-card-title></ion-card-header>
          <ion-card-content class="ion-no-padding">
            <ion-list lines="inset">
              @if (findings.incompleteSettings) {
                <ion-item>
                  <ion-icon slot="start" color="warning" src="{{ 'warning' | svgIcon }}" />
                  <ion-label class="ion-text-wrap">{{ i18n().findings_incompleteSettings() }}</ion-label>
                </ion-item>
              }
              @for (finding of eventFindings(); track $index) {
                <ion-item>
                  <ion-icon slot="start" color="warning" src="{{ 'alert-circle' | svgIcon }}" />
                  <ion-label class="ion-text-wrap">{{ eventTitleOf(finding.caleventKey) }}: {{ findingText(finding.code) }}</ion-label>
                </ion-item>
              }
              @for (personKey of missingNumbers(); track personKey) {
                <ion-item>
                  <ion-icon slot="start" color="warning" src="{{ 'person' | svgIcon }}" />
                  <ion-label class="ion-text-wrap">
                    {{ personName(personKey) }}: {{ i18n().findings_missingNumber() }}
                    @if (numberErrors()[personKey]; as error) {
                      <p class="finding-error">{{ error }}</p>
                    }
                  </ion-label>
                  @if (canAddNumbers()) {
                    <ion-button slot="end" fill="clear" size="small" (click)="addNumberClicked.emit(personKey)">{{ i18n().findings_addNumber() }}</ion-button>
                  }
                </ion-item>
              }
            </ion-list>
          </ion-card-content>
        </ion-card>
      }
    }

    @if (table().columns.length === 0) {
      <ion-item lines="none"><ion-note>{{ i18n().table_empty() }}</ion-note></ion-item>
    } @else {
      <div class="legend">
        <span><ion-icon class="presence" color="success" src="{{ 'checkbox-circle' | svgIcon }}" />{{ i18n().table_present() }}</span>
        <span><ion-icon class="presence" color="danger" src="{{ 'cancel-circle' | svgIcon }}" />{{ i18n().table_absent() }}</span>
        <span><ion-icon class="presence" color="warning" src="{{ 'remove-circle' | svgIcon }}" />{{ i18n().table_excused() }}</span>
        <span><ion-icon class="leader" src="{{ 'star' | svgIcon }}" />{{ i18n().table_leader() }}</span>
        <span><ion-icon class="presence prefill" color="success" src="{{ 'checkbox-circle' | svgIcon }}" />{{ i18n().table_prefill() }}</span>
      </div>

      @if (isWide()) {
        <div class="scroller">
          <table>
            <thead>
              <tr>
                <th class="person">{{ i18n().table_person() }}</th>
                @for (event of table().columns; track event.okey) {
                  <th class="event" [class.disabled]="!canEdit()" (click)="onEventClick(event)" [title]="event.name">
                    <div class="date">{{ shortDate(event) }}</div>
                    <div class="meta">{{ event.startTime }}</div>
                    <div class="meta">{{ typeLabel(event) }}</div>
                    <ion-icon class="sign-up" [color]="isConfirmed(event) ? 'success' : 'medium'"
                      src="{{ (isConfirmed(event) ? 'checkbox-circle' : 'alert-circle') | svgIcon }}"
                      [title]="isConfirmed(event) ? i18n().table_confirmed() : i18n().table_unconfirmed()" />
                  </th>
                }
                <th>{{ i18n().table_total() }}</th>
                @if (compensation(); as lines) {
                  <th>{{ i18n().table_compensation_led() }}</th>
                  <th>{{ i18n().table_compensation_rate() }}</th>
                  <th>{{ i18n().table_compensation_amount() }}</th>
                }
              </tr>
            </thead>
            <tbody>
              @for (row of table().rows; track row.key) {
                <tr>
                  <td class="person">
                    @if (row.isTrainer) { <ion-icon class="leader" src="{{ 'star' | svgIcon }}" [title]="i18n().table_leader()" /> }
                    {{ row.name2 }} {{ row.name1 }}
                  </td>
                  @for (event of table().columns; track event.okey) {
                    @let cell = cellOf(row, event);
                    <td>
                      <span class="cell">
                        @if (cell.signUp) {
                          <ion-icon class="sign-up" src="{{ signUpIcon(cell.signUp) | svgIcon }}" [title]="signUpText(cell.signUp)" />
                        }
                        @if (cell.entry; as entry) {
                          <ion-icon class="presence" [color]="presenceColor(entry.presence)" src="{{ presenceIcon(entry.presence) | svgIcon }}" [title]="presenceText(entry.presence)" />
                          @if (entry.function === 'leader') { <ion-icon class="leader" src="{{ 'star' | svgIcon }}" [title]="i18n().table_leader()" /> }
                        } @else if (cell.prefill; as prefill) {
                          <ion-icon class="presence prefill" [color]="presenceColor(prefill.presence)" src="{{ presenceIcon(prefill.presence) | svgIcon }}" [title]="i18n().table_prefill()" />
                        }
                      </span>
                    </td>
                  }
                  <td class="sum">{{ counts().perPerson[row.key] ?? 0 }}</td>
                  @if (compensation()) {
                    @let line = compensationOf(row.key);
                    <td class="sum">{{ line ? line.ledCount : '' }}
                      @if (isUnlisted(row.key)) {
                        <ion-icon class="sign-up" color="warning" src="{{ 'alert-circle' | svgIcon }}" [title]="i18n().table_compensation_unlisted()" />
                      }
                    </td>
                    <td class="money">{{ line ? money(line.rate.amount) : '' }}</td>
                    <td class="money">{{ line ? money(line.amount) : '' }}</td>
                  }
                </tr>
              }
            </tbody>
            <tfoot>
              <tr>
                <td class="person">{{ i18n().table_total() }}</td>
                @for (event of table().columns; track event.okey) {
                  <td class="sum">{{ counts().perEvent[event.okey] ?? 0 }}</td>
                }
                <td></td>
                @if (compensation()) {
                  <td></td><td></td>
                  <td class="money">{{ money(compensationTotal()) }}</td>
                }
              </tr>
            </tfoot>
          </table>
        </div>
      } @else {
        @for (event of table().columns; track event.okey) {
          <ion-list lines="inset">
            <ion-list-header (click)="onEventClick(event)">
              <ion-label>
                {{ shortDate(event) }} {{ event.startTime }} · {{ typeLabel(event) }} · {{ counts().perEvent[event.okey] ?? 0 }} {{ i18n().table_present() }}
              </ion-label>
              <ion-icon [color]="isConfirmed(event) ? 'success' : 'medium'" src="{{ (isConfirmed(event) ? 'checkbox-circle' : 'alert-circle') | svgIcon }}"
                [title]="isConfirmed(event) ? i18n().table_confirmed() : i18n().table_unconfirmed()" />
            </ion-list-header>
            @for (row of table().rows; track row.key) {
              @let cell = cellOf(row, event);
              <ion-item>
                <ion-label>
                  {{ row.name1 }} {{ row.name2 }}
                  @if (cell.signUp) { <p>{{ signUpText(cell.signUp) }}</p> }
                </ion-label>
                @if (cell.entry; as entry) {
                  @if (entry.function === 'leader') { <ion-icon slot="end" class="leader" src="{{ 'star' | svgIcon }}" /> }
                  <ion-icon slot="end" class="presence" [color]="presenceColor(entry.presence)" src="{{ presenceIcon(entry.presence) | svgIcon }}" [title]="presenceText(entry.presence)" />
                } @else if (cell.prefill; as prefill) {
                  <ion-icon slot="end" class="presence prefill" [color]="presenceColor(prefill.presence)" src="{{ presenceIcon(prefill.presence) | svgIcon }}" [title]="i18n().table_prefill()" />
                }
              </ion-item>
            }
          </ion-list>
        }
        @if (compensation(); as lines) {
          <ion-list lines="inset">
            <ion-list-header><ion-label>{{ i18n().table_compensation_amount() }}</ion-label></ion-list-header>
            @for (line of lines; track line.person.key) {
              <ion-item>
                <ion-label>{{ line.person.name1 }} {{ line.person.name2 }} <p>{{ line.ledCount }} × {{ money(line.rate.amount) }}</p></ion-label>
                <ion-note slot="end" class="money">{{ money(line.amount) }}</ion-note>
              </ion-item>
            }
          </ion-list>
        }
      }
    }

    @if (canEdit() && table().unassigned.length > 0) {
      <ion-card>
        <ion-card-header><ion-card-title>{{ i18n().unassigned_title() }}</ion-card-title></ion-card-header>
        <ion-card-content class="ion-no-padding">
          <ion-item lines="none"><ion-note>{{ i18n().unassigned_intro() }}</ion-note></ion-item>
          <ion-list lines="inset">
            @for (u of table().unassigned; track u.event.okey) {
              <ion-item>
                <ion-label class="ion-text-wrap">
                  {{ shortDate(u.event) }} {{ u.event.startTime }} · {{ u.event.name }}
                  <p>{{ typeLabel(u.event) }}</p>
                </ion-label>
                @if (u.suggested) {
                  <ion-chip slot="end" color="success">{{ i18n().unassigned_suggested() }}</ion-chip>
                }
                <ion-button slot="end" fill="outline" size="small" (click)="assignClicked.emit(u.event)">{{ i18n().unassigned_assign() }}</ion-button>
              </ion-item>
            }
          </ion-list>
        </ion-card-content>
      </ion-card>
    }
  `,
})
export class CourseTable {
  // inputs
  public readonly table = input.required<CourseTableData>();
  public readonly i18n = input.required<CourseI18n>();
  /** may confirm attendance and assign events (the course is not locked) */
  public readonly canEdit = input(false);
  /** may fill in missing J+S numbers */
  public readonly canAddNumbers = input(false);
  /** the findings to show inline; `undefined` = none (members, profile without checks) */
  public readonly findings = input<VisibleFindings | undefined>(undefined);
  /** inline error per person key after an invalid J+S number */
  public readonly numberErrors = input<Record<string, string>>({});
  /** the compensation lines; `undefined` = no compensation columns (D7: only for people who may read the amounts) */
  public readonly compensation = input<CompensationLine[] | undefined>(undefined);
  /** persons who led but are not on the eligible list (§7.6 marker) */
  public readonly unlistedKeys = input<string[]>([]);
  /** `calevent.type` → translated label */
  public readonly typeLabels = input<Record<string, string>>({});
  /** formats minor units (Rappen) */
  public readonly formatMoney = input<(minor: number) => string>((minor: number) => (minor / 100).toFixed(2));

  // outputs
  /** a column (event) was tapped: the page offers the per-event actions */
  public readonly eventClicked = output<CalEventModel>();
  public readonly assignClicked = output<CalEventModel>();
  public readonly addNumberClicked = output<string>();

  protected readonly isWide = signal(true);
  protected readonly counts = computed(() => presentCounts(this.table()));
  private readonly eventsByKey = computed(() => new Map([...this.table().columns, ...this.table().unassigned.map(u => u.event)].map(e => [e.okey, e] as const)));
  private readonly rowsByKey = computed(() => new Map(this.table().rows.map(r => [r.key, r] as const)));
  private readonly linesByKey = computed(() => new Map((this.compensation() ?? []).map(l => [l.person.key, l] as const)));
  protected readonly compensationTotal = computed(() => (this.compensation() ?? []).reduce((sum, l) => sum + l.amount, 0));
  protected readonly eventFindings = computed(() => (this.findings()?.findings ?? []).filter(f => f.code !== 'missingNumber'));
  protected readonly missingNumbers = computed(() => missingNumberKeys(this.findings()?.findings ?? []));

  constructor() {
    if (isPlatformBrowser(inject(PLATFORM_ID))) {
      const media = window.matchMedia(WIDE_MEDIA_QUERY);
      this.isWide.set(media.matches);
      const onChange = (e: MediaQueryListEvent) => this.isWide.set(e.matches);
      media.addEventListener('change', onChange);
      inject(DestroyRef).onDestroy(() => media.removeEventListener('change', onChange));
    }
  }

  protected cellOf(row: CourseRowPerson, event: CalEventModel): CourseCell {
    return this.table().cells[row.key]?.[event.okey] ?? {};
  }

  protected compensationOf(personKey: string): CompensationLine | undefined {
    return this.linesByKey().get(personKey);
  }

  protected isUnlisted(personKey: string): boolean {
    return this.unlistedKeys().includes(personKey);
  }

  protected isConfirmed(event: CalEventModel): boolean {
    return !!event.attendanceConfirmedAt;
  }

  /** «03.11.26» without a Date: StoreDate is a wall-clock value (calendar skill), slicing keeps it so */
  protected shortDate(event: CalEventModel): string {
    const d = event.startDate ?? '';
    return d.length === 8 ? `${d.slice(6, 8)}.${d.slice(4, 6)}.${d.slice(2, 4)}` : d;
  }

  protected typeLabel(event: CalEventModel): string {
    return this.typeLabels()[event.type] ?? event.type ?? '';
  }

  protected eventTitleOf(caleventKey: string | undefined): string {
    const event = caleventKey ? this.eventsByKey().get(caleventKey) : undefined;
    return event ? `${this.shortDate(event)} ${event.startTime ?? ''}`.trim() : '';
  }

  protected personName(personKey: string): string {
    const row = this.rowsByKey().get(personKey);
    return row ? `${row.name1} ${row.name2}`.trim() : personKey;
  }

  protected presenceIcon(presence: AttendanceEntry['presence']): string {
    return PRESENCE_ICON[presence] ?? 'alert-circle';
  }

  protected presenceColor(presence: AttendanceEntry['presence']): string {
    return PRESENCE_COLOR[presence] ?? 'medium';
  }

  protected presenceText(presence: AttendanceEntry['presence']): string {
    switch (presence) {
      case 'present': return this.i18n().table_present();
      case 'absent': return this.i18n().table_absent();
      default: return this.i18n().table_excused();
    }
  }

  protected signUpIcon(state: Attendee['state']): string {
    return SIGN_UP_ICON[state] ?? 'time';
  }

  protected signUpText(state: Attendee['state']): string {
    switch (state) {
      case 'accepted': return this.i18n().table_signUp_accepted();
      case 'declined': return this.i18n().table_signUp_declined();
      default: return this.i18n().table_signUp_invited();
    }
  }

  protected findingText(code: ExportFinding['code']): string {
    switch (code) {
      case 'unconfirmed': return this.i18n().findings_unconfirmed();
      case 'unmappedType': return this.i18n().findings_unmappedType();
      case 'badDuration': return this.i18n().findings_badDuration();
      case 'missingLocation': return this.i18n().findings_missingLocation();
      case 'fullDayTraining': return this.i18n().findings_fullDayTraining();
      case 'notAllowed': return this.i18n().findings_notAllowed();
      case 'missingNumber': return this.i18n().findings_missingNumber();
      default: return this.i18n().findings_incompleteSettings();
    }
  }

  protected money(minor: number): string {
    return this.formatMoney()(minor);
  }

  protected onEventClick(event: CalEventModel): void {
    if (this.canEdit()) this.eventClicked.emit(event);
  }
}
