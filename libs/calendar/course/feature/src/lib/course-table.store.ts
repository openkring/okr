import { computed, inject } from '@angular/core';
import { rxResource, toObservable, toSignal } from '@angular/core/rxjs-interop';
import { ModalController } from '@ionic/angular';
import { patchState, signalStore, withComputed, withMethods, withProps, withState } from '@ngrx/signals';
import { combineLatest, map, of, switchMap } from 'rxjs';

import { CourseService } from '@okr/calendar-course-data-access';
import { CourseAttendanceModal } from '@okr/calendar-course-ui';
import {
  AttendanceRow, attendanceEntriesToWrite, attendanceRowsForEvent, buildCourseTable, buildGenericCsvRows, buildJsAwkRows, compensationErrorKey,
  compensationSummary, computeCompensation, COURSE_I18N_KEYS, CourseAccess, courseEventLabel, courseEventStarted, courseFileBase, CourseI18n,
  CourseTable, ExportFinding, formatCourseAmount, htmlLines, escapeHtml, mayEditCourseAttendance, mayExportCourse, mayManageCourse,
  mayReadCourseFinance, mayViewCourseTable, unconfirmedPastEvents, unlistedLeaders, visibleFindings, VisibleFindings
} from '@okr/calendar-course-util';
import { MembershipService } from '@okr/relationship-membership-data-access';
import { AppStore } from '@okr/shared-feature';
import { I18nService } from '@okr/shared-i18n';
import { CalEventModel, CourseFinanceModel, CourseModel, MembershipModel, NameDisplay } from '@okr/shared-models';
import { AlertService, exportCsv, resourceParams } from '@okr/shared-util-angular';
import { DateFormat, fill, getAvatarInfo, getCurrentTime, getFullName, getItemLabel, getTodayStr, hasRole, isValidExternalId } from '@okr/shared-util-core';
import { isAdminMember } from '@okr/subject-group-util';

export type CourseTableState = {
  /** the course of the page (route param) */
  courseKey: string;
  /** StoreDate of «now» — decides which events have begun (prefill, confirm, lock); refreshed by `tick()` */
  today: string;
  /** 'HH:mm' of «now» */
  nowTime: string;
  /** inline error per person key after an invalid J+S number */
  numberErrors: Record<string, string>;
};
export const initialCourseTableState: CourseTableState = {
  courseKey: '',
  today: '',
  nowTime: '',
  numberErrors: {},
};

/** The J+S AWK file needs the person number; nothing else of the person is read. */
type JsPerson = { key: string; externalIds?: Record<string, string> };

/**
 * State of the course table page (spec 1.132 §7.2–§7.8, §8, §9): the course, its events, the group's members, the
 * unassigned group events, and — only for the people who may read them — the amounts.
 *
 * Kept apart from `CourseStore` (the list) on purpose: that store's resources (the course list, the posted
 * compensation bookings for the yearly totals) have nothing to do on this page and must not query here.
 *
 * View gate (§8, §13 — the table shows the attendance of minors): only `canView` (`mayViewCourseTable`: a role in the
 * course, a member of its group, or a person in the table) gets the table; everybody else gets the not-found state.
 * The course, its events and the viewer's own group memberships are read to decide that; the group's members, the
 * unassigned group events and the finance document are read only after the gate.
 *
 * Data paths (offline skill): every read is a Firestore listener held while the page is shown (`read`,
 * `listCourseEvents`, `listMembershipsOfMember`, `listMembersOfOrg`, `listGroupEventsInPeriod`, `readFinance`);
 * persons come from the AppStore. The finance document is read only by people who may read it
 * (`mayReadCourseFinance`) — never for others.
 */
export const CourseTableStore = signalStore(
  withState(initialCourseTableState),
  withProps(() => ({
    courseService: inject(CourseService),
    membershipService: inject(MembershipService),
    appStore: inject(AppStore),
    modalController: inject(ModalController),
    alertService: inject(AlertService),
    i18nService: inject(I18nService),
  })),
  withProps((store) => ({
    i18n: store.i18nService.translateAll(COURSE_I18N_KEYS) as CourseI18n,
    courseResource: rxResource({
      params: resourceParams(() => store.courseKey()),
      stream: ({ params: key }) => key ? store.courseService.read(key) : of(undefined),
    }),
    eventsResource: rxResource({
      params: resourceParams(() => store.courseKey()),
      stream: ({ params: key }) => key ? store.courseService.listCourseEvents(key) : of([] as CalEventModel[]),
    }),
    /** the viewer's own group memberships (server query by member): decides «member of the course's group» */
    ownMembershipsResource: rxResource({
      params: resourceParams(() => store.appStore.currentUser()?.personKey ?? ''),
      stream: ({ params: personKey }) => personKey
        ? store.membershipService.listMembershipsOfMember(personKey, 'person', 'group') : of([] as MembershipModel[]),
    }),
  })),
  withComputed((state) => {
    const course = computed(() => state.courseResource.hasValue() ? state.courseResource.value() : undefined);
    const currentUser = computed(() => state.appStore.currentUser());
    const personKey = computed(() => currentUser()?.personKey ?? '');
    const access = computed<CourseAccess>(() => ({
      personKey: personKey(),
      isGroupAdmin: isAdminMember(state.appStore.getGroup(course()?.groupKey ?? ''), personKey()),
      isPrivileged: hasRole('privileged', currentUser()),
      isTreasurer: hasRole('treasurer', currentUser()),
      isEventAdmin: hasRole('eventAdmin', currentUser()),
    }));
    const has = (fn: (c: CourseModel, a: CourseAccess) => boolean) => computed(() => {
      const c = course();
      return !!c && fn(c, access());
    });
    const events = computed(() => state.eventsResource.hasValue() ? state.eventsResource.value() ?? [] : []);
    const ownMemberships = computed(() => state.ownMembershipsResource.hasValue() ? state.ownMembershipsResource.value() ?? [] : []);
    const canView = computed(() => {
      const c = course();
      return !!c && mayViewCourseTable(c, access(), ownMemberships(), events());
    });
    /** the gate can only say «no» once the course, its events and the viewer's memberships are in */
    const viewDecided = computed(() => !state.courseResource.isLoading() && !state.eventsResource.isLoading() && !state.ownMembershipsResource.isLoading());
    return {
      course,
      currentUser,
      access,
      events,
      canView,
      /** the person display order of the viewer (first-last or last-first), used everywhere on the page */
      nameDisplay: computed(() => currentUser()?.nameDisplay ?? NameDisplay.FirstLast),
      isLoading: computed(() => state.courseResource.isLoading() || (!!course() && !viewDecided())),
      /** no (non-archived) course of this tenant with that key — or one this viewer may not see (same answer, §13) */
      notFound: computed(() => !!state.courseKey() && !state.courseResource.isLoading() && (!course() || (viewDecided() && !canView()))),
      isLocked: computed(() => course()?.isLocked === true),
      /** responsible, group admin, privileged: lock/unlock, request, «reported», missing numbers */
      canManage: has(mayManageCourse),
      /** confirm attendance, assign/unassign events — never on a locked course */
      canEdit: has(mayEditCourseAttendance),
      /** exports and findings (§6) — plain members get neither */
      canExport: has(mayExportCourse),
      /** may read the amounts: only then is the finance document queried at all (D7) */
      canReadFinance: has(mayReadCourseFinance),
      trainerKeys: computed(() => (course()?.trainers ?? []).map(t => t.key)),
    };
  }),
  withProps((store) => ({
    membersResource: rxResource({
      params: resourceParams(() => store.canView() ? store.course()?.groupKey ?? '' : ''),
      stream: ({ params: groupKey }) => groupKey ? store.membershipService.listMembersOfOrg(groupKey, 'group') : of([] as MembershipModel[]),
    }),
    /** only the people who may assign get the unassigned group events («gehört dazu?») */
    groupEventsResource: rxResource({
      params: resourceParams(() => {
        const course = store.course();
        return store.canEdit() && course ? { groupKey: course.groupKey, startDate: course.startDate, endDate: course.endDate } : undefined;
      }),
      stream: ({ params }) => params ? store.courseService.listGroupEventsInPeriod(params.groupKey, params.startDate, params.endDate) : of([] as CalEventModel[]),
    }),
    financeResource: rxResource({
      params: resourceParams(() => store.canReadFinance() ? store.courseKey() : undefined),
      stream: ({ params: key }) => key ? store.courseService.readFinance(key) : of(undefined),
    }),
    /** `calevent.type` → translated label, from the `calevent_type` category (data-driven keys) */
    typeLabels: toSignal(
      toObservable(computed(() => store.appStore.getCategory('calevent_type'))).pipe(
        switchMap(category => {
          const items = category?.items ?? [];
          if (items.length === 0) return of({} as Record<string, string>);
          return combineLatest(items.map(item => store.i18nService.translate(getItemLabel(category, item.name)).pipe(
            map(label => [item.name, label] as [string, string]),
          ))).pipe(map(pairs => Object.fromEntries(pairs) as Record<string, string>));
        }),
      ),
      { initialValue: {} as Record<string, string> },
    ),
  })),
  withComputed((state) => {
    const members = computed(() => state.membersResource.hasValue() ? state.membersResource.value() ?? [] : []);
    const groupEvents = computed(() => state.groupEventsResource.hasValue() ? state.groupEventsResource.value() ?? [] : []);
    /** the amounts, only for those who may read them AND when the read returned a document */
    const finance = computed<CourseFinanceModel | undefined>(() =>
      state.canReadFinance() && state.financeResource.hasValue() ? state.financeResource.value() ?? undefined : undefined);
    const table = computed<CourseTable | undefined>(() => {
      const course = state.course();
      if (!course || !state.today() || !state.canView()) return undefined;
      return buildCourseTable(course, state.events(), groupEvents(), members(), state.today(), state.nowTime() || undefined);
    });
    /** the persons of the table with their external ids (AppStore memory: no query of its own) */
    const jsPersons = computed<JsPerson[]>(() => (table()?.rows ?? []).map(r => {
      const person = state.appStore.getPerson(r.key);
      return { key: r.key, externalIds: person?.externalIds };
    }));
    const isJs = computed(() => (state.course()?.reportProfile ?? 'generic') === 'js');
    const jsResult = computed(() => {
      const course = state.course();
      return course && isJs() && state.canExport() ? buildJsAwkRows(course, state.events(), jsPersons()) : undefined;
    });
    return {
      table,
      finance,
      isJs,
      jsResult,
      /** currency of the amounts: the rates carry the books' functional currency (the finance form restamps it) */
      currency: computed(() => finance()?.defaultRate?.currency || 'CHF'),
      /** compensation columns: never for members, never without the finance document (D7) */
      compensation: computed(() => {
        const f = finance();
        return f ? computeCompensation(state.events(), f) : undefined;
      }),
      unlistedKeys: computed(() => {
        const f = finance();
        return f ? unlistedLeaders(state.events(), f).map(p => p.key) : [];
      }),
      /** the findings as the table shows them; members get none */
      findings: computed<VisibleFindings | undefined>(() => {
        if (!state.canExport() || !state.today()) return undefined;
        const nowTime = state.nowTime() || undefined;
        const js = jsResult();
        const raw: ExportFinding[] = js
          ? js.findings
          : unconfirmedPastEvents(state.events(), state.today(), nowTime).map(e => ({ caleventKey: e.okey, code: 'unconfirmed' as const }));
        return visibleFindings(raw, state.events(), state.today(), nowTime);
      }),
    };
  }),
  withMethods((store) => ({
    /******************************** setup ******************************************* */
    loadTable(courseKey: string): void {
      patchState(store, { courseKey, numberErrors: {} });
      this.tick();
    },

    /** refresh «now» (the page calls it every minute): an event that begins while the page is open gets its prefill */
    tick(): void {
      patchState(store, { today: getTodayStr(DateFormat.StoreDate), nowTime: getCurrentTime() });
    },

    hasStarted(event: CalEventModel): boolean {
      return courseEventStarted(event, store.today(), store.nowTime() || undefined);
    },

    eventLabel(event: CalEventModel): string {
      return courseEventLabel(event);
    },

    personName(personKey: string): string {
      const row = store.table()?.rows.find(r => r.key === personKey);
      if (row) return getFullName(row.name1, row.name2, store.nameDisplay());
      const person = store.appStore.getPerson(personKey);
      return person ? getFullName(person.firstName, person.lastName, store.nameDisplay()) : personKey;
    },

    /** «CHF 120.00»: the amount with the currency of the course's rates */
    money(minor: number, currency?: string): string {
      return formatCourseAmount(minor, currency || store.currency());
    },

    /******************************** attendance (§7.3) ******************************************* */
    /** Opens the attendance dialog of one event; from the event's start on, for those who may edit it. */
    async openAttendance(event: CalEventModel): Promise<void> {
      this.tick();
      const table = store.table();
      if (!table || !store.canEdit() || !this.hasStarted(event)) return;
      const rows = attendanceRowsForEvent(table, event, store.trainerKeys());
      const confirmedAt = event.attendanceConfirmedAt ?? '';   // StoreDateTime yyyyMMddHHmmss
      const confirmed = !!confirmedAt;
      const intro = confirmed
        ? fill(store.i18n.attendance_confirmedBy(), {
          name: getFullName(event.attendanceConfirmedBy?.name1, event.attendanceConfirmedBy?.name2, store.nameDisplay()),
          date: courseEventLabel({
            startDate: confirmedAt.slice(0, 8), startTime: `${confirmedAt.slice(8, 10)}:${confirmedAt.slice(10, 12)}`, fullDay: confirmedAt.length < 12,
          }),
        })
        : store.i18n.attendance_intro();
      const modal = await store.modalController.create({
        component: CourseAttendanceModal,
        componentProps: { rows, eventTitle: courseEventLabel(event), confirmed, intro, nameDisplay: store.nameDisplay(), readOnly: false },
      });
      await modal.present();
      const { data, role } = await modal.onDidDismiss<AttendanceRow[]>();
      if (role === 'confirm' && data) await this.confirmAttendance(event, data);
    },

    /**
     * Writes the attendance of one event (§7.3), merged against the LIVE event (somebody may have confirmed or
     * corrected while the dialog was open): persons without a stored entry are written, rows the user changed are
     * written, rows equal to what is stored or left alone by the user are not (`attendanceEntriesToWrite`). Each
     * written entry carries `by` (current person) and `at` (now). The confirmation stamp `attendanceConfirmedBy/At`
     * is written only by the FIRST confirmation; a correction carries its `by`/`at` per entry only.
     */
    async confirmAttendance(event: CalEventModel, rows: AttendanceRow[]): Promise<void> {
      if (!store.canEdit()) return;
      const by = store.access().personKey;
      const confirmedBy = getAvatarInfo(store.currentUser(), 'user-person');
      if (!by || !confirmedBy) return;
      const at = getTodayStr(DateFormat.StoreDateTime);
      const current = store.events().find(e => e.okey === event.okey) ?? event;
      const firstConfirmation = !current.attendanceConfirmedAt;
      const entries = attendanceEntriesToWrite(rows, by, at, current.attendance ?? {});
      if (entries.length === 0 && !firstConfirmation) return;
      await store.courseService.writeAttendance(event.okey, entries, firstConfirmation ? confirmedBy : undefined, firstConfirmation ? at : undefined);
    },

    /******************************** assignment (§7.2) ******************************************* */
    async assign(event: CalEventModel): Promise<void> {
      const course = store.course();
      if (!course || !store.canEdit()) return;
      await store.courseService.setCourseKey(event.okey, course.okey);
    },

    /** Takes an event out of the course; its attendance stays on the event. */
    async unassign(event: CalEventModel): Promise<void> {
      if (!store.canEdit()) return;
      if (!await store.alertService.confirm(store.i18n.event_unassignConfirm(), true)) return;
      await store.courseService.setCourseKey(event.okey, '');
    },

    /******************************** lock / unlock / reported (§7.8) ******************************************* */
    /** Freezes the course; refuses with the list of past events nobody confirmed. */
    async lock(): Promise<void> {
      this.tick();
      const course = store.course();
      if (!course || !store.canManage() || course.isLocked) return;
      const open = unconfirmedPastEvents(store.events(), store.today(), store.nowTime() || undefined);
      if (open.length > 0) {
        const message = escapeHtml(store.i18n.lock_refused()) + '<br>' + htmlLines(open.map(e => `${courseEventLabel(e)} ${e.name ?? ''}`.trim()));
        await store.alertService.notify(store.i18n.lock_refused_title(), message);
        return;
      }
      if (!await store.alertService.confirm(store.i18n.lock_confirm(), true)) return;
      const lockedBy = getAvatarInfo(store.currentUser(), 'user-person');
      if (!lockedBy) return;
      await store.courseService.updateCourseState(course.okey, { isLocked: true, lockedBy, lockedAt: getTodayStr(DateFormat.StoreDateTime) });
    },

    /** Reopens a frozen course, after a warning that a new J+S import overwrites the reported attendance. */
    async unlock(): Promise<void> {
      const course = store.course();
      if (!course || !store.canManage() || !course.isLocked) return;
      if (!await store.alertService.confirm(store.i18n.unlock_confirm(), true)) return;
      await store.courseService.updateCourseState(course.okey, { isLocked: false, lockedBy: null, lockedAt: '' });
    },

    /** The optional «reported» note (`reportedAt` = now). */
    async markReported(): Promise<void> {
      const course = store.course();
      if (!course || !store.canManage()) return;
      if (!await store.alertService.confirm(store.i18n.reported_confirm(), true)) return;
      await store.courseService.updateCourseState(course.okey, { reportedAt: getTodayStr(DateFormat.StoreDateTime) });
    },

    /******************************** exports (§9) ******************************************* */
    /** The generic CSV (§9.1); the compensation columns only for those who read the amounts. */
    async exportGeneric(): Promise<void> {
      const course = store.course();
      const table = store.table();
      if (!course || !table || !store.canExport()) return;
      const i18n = store.i18n;
      const lines = store.compensation();
      const rows = buildGenericCsvRows(table, {
        name: i18n.csv_name(), firstName: i18n.csv_firstName(), function: i18n.csv_function(), total: i18n.csv_total(),
        present: i18n.table_present(), absent: i18n.table_absent(), excused: i18n.table_excused(),
        leader: i18n.csv_leader(), participant: i18n.csv_participant(),
      }, lines ? {
        lines,
        // the CSV cells are plain decimals: the currency goes into the column titles
        labels: {
          ledCount: i18n.table_compensation_led(),
          rate: `${i18n.table_compensation_rate()} (${store.currency()})`,
          amount: `${i18n.table_compensation_amount()} (${store.currency()})`,
        },
      } : undefined);
      await exportCsv(rows, `${courseFileBase(course.name, 'kurs')}.csv`);
    },

    /**
     * The J+S AWK file (§9.2): shows the BASPO hints and the findings first (rows with problems are left out, the rest
     * still exports), then downloads `<courseNumber>_awk.csv`.
     */
    async exportJs(): Promise<void> {
      this.tick();
      const course = store.course();
      const result = store.jsResult();
      if (!course || !result || !store.canExport()) return;
      const i18n = store.i18n;
      const shown = visibleFindings(result.findings, store.events(), store.today(), store.nowTime() || undefined);
      const findingLines: string[] = [];
      if (shown.incompleteSettings) findingLines.push(i18n.findings_incompleteSettings());
      for (const f of shown.findings) findingLines.push(this.findingLine(f));
      const findingsHtml = findingLines.length > 0 ? '<br><br>' + escapeHtml(i18n.export_js_findings()) + '<br>' + htmlLines(findingLines) : '';
      if (result.rows.length <= 1) {
        await store.alertService.notify(i18n.export_js_title(), escapeHtml(i18n.export_js_none()) + findingsHtml);
        return;
      }
      const message = escapeHtml(i18n.export_js_hints()) + findingsHtml + '<br><br>' + escapeHtml(i18n.export_js_continue());
      if (!await store.alertService.confirm(message, true)) return;
      const base = courseFileBase(course.reportSettings?.courseNumber || course.name, 'js');
      await exportCsv(result.rows, `${base}_awk.csv`);
    },

    findingLine(f: ExportFinding): string {
      const i18n = store.i18n;
      const text: Record<ExportFinding['code'], string> = {
        incompleteSettings: i18n.findings_incompleteSettings(), missingNumber: i18n.findings_missingNumber(), unmappedType: i18n.findings_unmappedType(),
        unconfirmed: i18n.findings_unconfirmed(), badDuration: i18n.findings_badDuration(), missingLocation: i18n.findings_missingLocation(),
        fullDayTraining: i18n.findings_fullDayTraining(), notAllowed: i18n.findings_notAllowed(),
      };
      const event = f.caleventKey ? store.events().find(e => e.okey === f.caleventKey) : undefined;
      const who = f.personKey ? this.personName(f.personKey) : '';
      return [event ? courseEventLabel(event) : '', who, text[f.code]].filter(Boolean).join(': ');
    },

    /******************************** compensation (§7.6) ******************************************* */
    /**
     * Requests the compensation of the locked course in the books of its finance document (never the app tenant).
     * Shows what was prepared, the posted bookings whose amount differs, the rejected ones and the leaders who are not
     * on the eligible list; a refusal is shown as a plain message per `details.reason`.
     */
    async requestCompensation(): Promise<void> {
      const course = store.course();
      if (!course || !store.canManage()) return;
      const i18n = store.i18n;
      if (!course.isLocked) {
        await store.alertService.notify(i18n.request_error_title(), escapeHtml(i18n.request_notLocked()));
        return;
      }
      const books = store.finance()?.accountingTenantId ?? '';
      if (!books) {
        await store.alertService.notify(i18n.request_error_title(), escapeHtml(i18n.request_noFinance()));
        return;
      }
      if (!await store.alertService.confirm(i18n.request_confirm(), true)) return;
      try {
        const result = await store.courseService.requestCompensation(course.okey, books);
        const message = compensationSummary(result, key => this.personName(key), minor => this.money(minor), {
          written: i18n.request_done_written(), external: i18n.request_done_external(), kept: i18n.request_done_kept(),
          cancelled: i18n.request_done_cancelled(), unlisted: i18n.request_done_unlisted(),
        });
        await store.alertService.notify(i18n.request_done_title(), message);
      } catch (error) {
        console.warn('CourseTableStore.requestCompensation: the request failed.', error);
        await store.alertService.notify(i18n.request_error_title(), escapeHtml(i18n[compensationErrorKey(error)]()));
      }
    },

    /******************************** missing J+S numbers (§5.4, §8) ******************************************* */
    /** Asks for the number of one person and stores it; an invalid one leaves an inline error under the person. */
    async promptMissingNumber(personKey: string): Promise<void> {
      if (!store.canManage()) return;
      const value = await store.alertService.okrPrompt(
        fill(store.i18n.number_title(), { name: this.personName(personKey) }), store.i18n.number_placeholder());
      if (value === undefined) return;
      await this.setMissingNumber(personKey, value);
    },

    /** `externalIds.js` of the person, after `isValidExternalId('js', …)`; invalid → inline error, nothing written. */
    async setMissingNumber(personKey: string, value: string): Promise<boolean> {
      if (!store.canManage() || !personKey) return false;
      const number = (value ?? '').replace(/\s+/g, '');
      if (!isValidExternalId('js', number)) {
        patchState(store, { numberErrors: { ...store.numberErrors(), [personKey]: store.i18n.number_invalid() } });
        return false;
      }
      const { [personKey]: _cleared, ...rest } = store.numberErrors();   // eslint-disable-line @typescript-eslint/no-unused-vars
      patchState(store, { numberErrors: rest });
      await store.courseService.setExternalId(personKey, 'js', number);
      void store.alertService.showToast(store.i18n.number_saved());
      return true;
    },
  })),
);
