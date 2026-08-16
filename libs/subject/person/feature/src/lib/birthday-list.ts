import { Component, computed, inject, input, signal } from '@angular/core';
import { AsyncPipe } from '@angular/common';
import { rxResource } from '@angular/core/rxjs-interop';
import { IonAvatar, IonButtons, IonContent, IonHeader, IonImg, IonItem, IonItemDivider, IonLabel, IonList, IonMenuButton, IonTitle, IonToolbar } from '@ionic/angular/standalone';
import { of } from 'rxjs';

import { AppStore } from '@okr/shared-feature';
import { MembershipModel, NameDisplay, PersonModel, PersonModelName } from '@okr/shared-models';
import { FullNamePipe } from '@okr/shared-pipes';
import { EmptyList, ListFilter, Spinner } from '@okr/shared-ui';
import { addDuration, convertDateFormatToString, DateFormat, getAge, getBirthdayDiff, getStoreDateYear, getTodayStr, getWeekdayI18nKey, hasRole, isActiveMembership, nameMatches } from '@okr/shared-util-core';
import { I18nService, TranslatePipe } from '@okr/shared-i18n';

import { AvatarPipe } from '@okr/avatar-ui';
import { MembershipService } from '@okr/relationship-membership-data-access';
import { AddressService } from '@okr/subject-address-data-access';
import { PERSON_I18N_KEYS, PersonI18n } from '@okr/subject-person-util';

/** One person on a birthday. */
interface BirthdayRow {
  person: PersonModel;
  /** the age the person reaches on that birthday */
  age: number;
}

/** All birthdays falling on one calendar date, the unit the list renders. */
interface BirthdayGroup {
  /** days until that date — 0 is today; the sort key */
  diff: number;
  /** i18n key of the weekday abbreviation, resolved per row (data-driven key) */
  weekdayKey: string;
  /** the date as `dd.MM.` */
  dayMonth: string;
  rows: BirthdayRow[];
}

/**
 * Rolling twelve-month birthday list (PENDING 2.84), starting today and crossing the year
 * boundary, grouped by date — `MO 05.09.` · Avatar · Vorname Nachname · Alter.
 *
 * **Why this is not a column on the person list.** Spec 1.19 Phase 4 removed `dateOfBirth`
 * from `PersonModel`; day and month exist only in the addresses vault (`addressChannel: 'dob'`),
 * and the `memberBirthYear` replica deliberately carries the year alone. So the list reads the
 * vault directly, which the `addresses` rule serves to owner ∨ privileged ∨ memberAdmin only.
 *
 * That rule is also the answer to the aggregate question the spec raises: a page showing day
 * and month for half the membership is more than the sum of its rows, so it is gated on those
 * roles rather than on "jeder Angemeldete" — and the gate is real, not cosmetic, because a
 * member's own query returns [] regardless of what the template does. The age column is shown
 * unconditionally for the same reason: whoever may read the list already reads the full date,
 * so hiding the age would conceal nothing.
 *
 * Below admin the list is narrowed to people with an ACTIVE membership (`isActiveMembership`,
 * the shared definition): a congratulations list is about the people currently in the club,
 * and it keeps former members' birthdays off the screen of everyone but admin.
 *
 * Nothing is denormalized out of the vault — the MMTT sort happens client-side over the
 * tenant's dob addresses.
 */
@Component({
  selector: 'okr-birthday-list',
  standalone: true,
  imports: [
    FullNamePipe, AvatarPipe, TranslatePipe, AsyncPipe,
    Spinner, EmptyList, ListFilter,
    IonHeader, IonToolbar, IonButtons, IonMenuButton, IonTitle,
    IonContent, IonList, IonItem, IonItemDivider, IonLabel, IonAvatar, IonImg,
  ],
  styles: [`
    ion-avatar { width: 30px; height: 30px; background-color: var(--ion-color-light); }
    ion-item-divider.date { --background: var(--ion-color-light); min-height: 26px; }
    ion-item-divider.date ion-label { font-size: 0.8rem; font-weight: 600; color: var(--ion-color-medium); }
  `],
  template: `
  <ion-header>
    <ion-toolbar color="secondary">
      <ion-buttons slot="start"><ion-menu-button /></ion-buttons>
      <ion-title>{{ rowCount() }} {{ i18n.birthdays() }}</ion-title>
    </ion-toolbar>

    <okr-list-filter (searchTermChanged)="searchTerm.set($event)" />
  </ion-header>

  <ion-content>
    @if (isLoading()) {
      <okr-spinner />
    } @else if (rowCount() === 0) {
      <okr-empty-list [message]="i18n.birthdays_empty()" />
    } @else {
      <ion-list lines="inset">
        @for (group of groups(); track group.diff) {
          <ion-item-divider class="date">
            <ion-label>{{ (group.weekdayKey | translate | async) ?? '' }} {{ group.dayMonth }}</ion-label>
          </ion-item-divider>
          @for (row of group.rows; track row.person.okey) {
            <ion-item>
              <ion-avatar slot="start">
                <ion-img src="{{ personModelName + '.' + row.person.okey | avatar:personModelName }}" alt="Avatar" />
              </ion-avatar>
              <ion-label>{{ row.person.firstName | fullName:row.person.lastName:nameDisplay() }}</ion-label>
              <ion-label class="ion-hide-sm-down">{{ row.age }}</ion-label>
            </ion-item>
          }
        }
      </ion-list>
    }
  </ion-content>
  `,
})
export class BirthdayList {
  private readonly appStore = inject(AppStore);
  private readonly addressService = inject(AddressService);
  private readonly membershipService = inject(MembershipService);

  /** `all` — every person of the tenant; `g:<groupKey>` — the members of one group. */
  public readonly listId = input.required<string>();

  protected readonly i18n = inject(I18nService).translateAll(PERSON_I18N_KEYS) as PersonI18n;
  protected readonly personModelName = PersonModelName;
  protected readonly searchTerm = signal('');
  protected readonly nameDisplay = computed(() => this.appStore.currentUser()?.nameDisplay ?? NameDisplay.FirstLast);

  private readonly currentUser = computed(() => this.appStore.currentUser());
  private readonly mayRead = computed(() =>
    hasRole('privileged', this.currentUser()) || hasRole('memberAdmin', this.currentUser()));
  private readonly groupKey = computed(() => this.listId().startsWith('g:') ? this.listId().slice(2) : '');

  private readonly dobResource = rxResource({
    params: () => ({ mayRead: this.mayRead() }),
    stream: ({ params }) => params.mayRead ? this.addressService.listByChannel('dob') : of([]),
  });

  // one stream for both membership questions (group basis and active-only narrowing) —
  // MembershipService.list() is the shared, cached tenant query the other lists ride on
  private readonly membershipResource = rxResource({
    params: () => ({ mayRead: this.mayRead() }),
    stream: ({ params }) => params.mayRead ? this.membershipService.list() : of([] as MembershipModel[]),
  });

  protected readonly isLoading = computed(() => this.dobResource.isLoading() || this.membershipResource.isLoading());

  /** person okeys to keep, or undefined when no membership restriction applies at all. */
  private readonly allowedPersons = computed<Set<string> | undefined>(() => {
    const groupKey = this.groupKey();
    // admin is the only role that also sees former members; everyone else gets active-only
    const activeOnly = !hasRole('admin', this.currentUser());
    if (!groupKey && !activeOnly) return undefined;
    const today = getTodayStr();
    const memberships = (this.membershipResource.value() ?? []).filter((m) =>
      m.memberModelType === 'person'
      && (!groupKey || (m.orgKey === groupKey && m.orgModelType === 'group'))
      && (!activeOnly || isActiveMembership(m, today)));
    return new Set(memberships.map((m) => m.memberKey));
  });

  protected readonly groups = computed<BirthdayGroup[]>(() => {
    const allowed = this.allowedPersons();
    const term = this.searchTerm();
    const persons = new Map(this.appStore.allPersons().map((p) => [p.okey, p]));
    const byDate = new Map<number, BirthdayGroup>();

    for (const address of this.dobResource.value() ?? []) {
      const person = persons.get((address.parentKey ?? '').replace('person.', ''));
      // a deceased person on a congratulations list is the one bug nobody forgives
      if (!person || person.isDeceased) continue;
      if (allowed && !allowed.has(person.okey)) continue;
      if (!nameMatches(person.index, term)) continue;
      const diff = address.dob ? getBirthdayDiff(address.dob) : -1;
      if (diff < 0) continue; // no usable day+month (year-only replica, or unparsable)

      // the StoreDate of the upcoming birthday, derived from the diff rather than recomputed
      const date = addDuration(getTodayStr(), { days: diff });
      let group = byDate.get(diff);
      if (!group) {
        group = {
          diff,
          weekdayKey: getWeekdayI18nKey(date, true),
          dayMonth: convertDateFormatToString(date, DateFormat.StoreDate, DateFormat.ViewDayMonth),
          rows: [],
        };
        byDate.set(diff, group);
      }
      group.rows.push({ person, age: getAge(address.dob, false, Number(getStoreDateYear(date))) });
    }

    return [...byDate.values()].sort((a, b) => a.diff - b.diff);
  });

  protected readonly rowCount = computed(() => this.groups().reduce((sum, group) => sum + group.rows.length, 0));
}
