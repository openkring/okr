import { Injectable, inject } from '@angular/core';
import { FieldPath } from 'firebase/firestore';
import { Observable } from 'rxjs';

import { ActivityService } from '@okr/activity-data-access';
import { getCourseIndex } from '@okr/calendar-course-util';
import { ENV } from '@okr/shared-config';
import { FirestoreService } from '@okr/shared-data-access';
import { I18nService } from '@okr/shared-i18n';
import {
  AttendanceEntry, AvatarInfo, CalEventCollection, CalEventModel, CourseCollection, CourseFinanceDocId, CourseFinanceModel,
  CourseFinanceSubcollection, CourseModel, PersonCollection, UserModel
} from '@okr/shared-models';
import { die, getSystemQuery, isValidExternalId, removeUndefinedFields } from '@okr/shared-util-core';

import { PFX } from './scope';

/**
 * Fields the server maintains (a trigger mirrors them from `trainers` / `responsiblePersons`) and the
 * Firestore rules deny a client write for. `update()` never sends them (a whole-model write would put a
 * stale copy back); `create()` leaves them absent (the rules accept absent or `[]` on create only).
 */
const SERVER_MAINTAINED_FIELDS = ['trainerKeys', 'responsibleKeys'] as const;

/** Shallow copy of the course without the server-maintained fields; safe to pass to a whole-model write. */
function withoutServerKeys(course: CourseModel): CourseModel {
  const copy: Partial<CourseModel> = { ...course };
  for (const field of SERVER_MAINTAINED_FIELDS) delete copy[field];
  return copy as CourseModel;
}

@Injectable({
  providedIn: 'root',
})
export class CourseService {
  private readonly env = inject(ENV);
  private readonly firestoreService = inject(FirestoreService);
  private readonly activityService = inject(ActivityService);
  private readonly i18nService = inject(I18nService);
  private readonly i18n = this.i18nService.translateAll({
    create_conf:  PFX + 'create.conf',
    create_error: PFX + 'create.error',
    update_conf:  PFX + 'update.conf',
    update_error: PFX + 'update.error',
    delete_conf:  PFX + 'delete.conf',
    delete_error: PFX + 'delete.error',
    finance_conf: PFX + 'finance.conf',
  });

  /*-------------------------- CRUD operations --------------------------------*/
  /**
   * Create a new course. `trainerKeys` / `responsibleKeys` are server-maintained and never written here.
   * @returns the document id of the new course or undefined if the operation failed
   */
  public async create(course: CourseModel, currentUser?: UserModel): Promise<string | undefined> {
    const payload = withoutServerKeys(course);
    payload.index = getCourseIndex(course);
    const key = await this.firestoreService.createModel<CourseModel>(CourseCollection, payload, this.i18n.create_conf(), this.i18n.create_error(), currentUser);
    void this.activityService.log('course', 'create', currentUser, this.activityPayload(course));
    return key;
  }

  /**
   * Lookup a course by its document id (tenant-scoped, archived courses are not returned).
   */
  public read(key: string | undefined): Observable<CourseModel | undefined> {
    return this.firestoreService.readTenantModel<CourseModel>(CourseCollection, key, this.env.tenantId);
  }

  /**
   * Update a course. `trainerKeys` / `responsibleKeys` are stripped from the payload: updateModel merges,
   * so the server's values stay untouched and the rules (which deny a client write of them) never see them.
   * @returns the key of the updated course or undefined if the operation failed
   */
  public async update(course: CourseModel, currentUser?: UserModel): Promise<string | undefined> {
    const payload = withoutServerKeys(course);
    payload.index = getCourseIndex(course);
    const key = await this.firestoreService.updateModel<CourseModel>(CourseCollection, payload, false, this.i18n.update_conf(), this.i18n.update_error(), currentUser);
    void this.activityService.log('course', 'update', currentUser, this.activityPayload(course));
    return key;
  }

  /**
   * A course is never deleted: it is archived (deleting-models skill; `FirestoreService.deleteModel`
   * applies `getDeletePatch`). Its calevents keep their `courseKey`.
   */
  public async archive(course: CourseModel, currentUser?: UserModel): Promise<void> {
    await this.firestoreService.deleteModel<CourseModel>(CourseCollection, course, this.i18n.delete_conf(), this.i18n.delete_error(), currentUser);
    void this.activityService.log('course', 'delete', currentUser, this.activityPayload(course));
  }

  /*-------------------------- LIST / QUERY --------------------------------*/
  /**
   * All courses of one group in this tenant, newest first.
   * Needs the index `courses: tenants, isArchived, groupKey, startDate desc`.
   */
  public list(groupKey: string): Observable<CourseModel[]> {
    return this.firestoreService.searchData<CourseModel>(
      CourseCollection,
      [...getSystemQuery(this.env.tenantId), { key: 'groupKey', operator: '==', value: groupKey }],
      'startDate',
      'desc',
    );
  }

  /**
   * The calevents that belong to a course, oldest first.
   * Needs the index `calevents: tenants, isArchived, courseKey, startDate`.
   */
  public listCourseEvents(courseKey: string): Observable<CalEventModel[]> {
    return this.firestoreService.searchData<CalEventModel>(
      CalEventCollection,
      [...getSystemQuery(this.env.tenantId), { key: 'courseKey', operator: '==', value: courseKey }],
      'startDate',
      'asc',
    );
  }

  /*-------------------------- FINANCE (protected sub-document) --------------------------------*/
  /**
   * The amounts of a course (`courses/{key}/finance/settings`). Most users may not read them: a denial
   * is the normal answer and emits `undefined` — no toast, no error, no retry storm.
   * `undefined` also means «not set up yet».
   */
  public readFinance(courseKey: string): Observable<CourseFinanceModel | undefined> {
    return this.firestoreService.readObjectQuiet<CourseFinanceModel>(this.financePath(courseKey));
  }

  /** Overwrite the finance settings of a course (the document is created on first save). */
  public async saveFinance(courseKey: string, finance: CourseFinanceModel): Promise<void> {
    if (!courseKey) die('CourseService.saveFinance: courseKey is mandatory.');
    const data = removeUndefinedFields(structuredClone(finance));
    await this.firestoreService.updateObject(`${CourseCollection}/${courseKey}/${CourseFinanceSubcollection}`, CourseFinanceDocId, data, true, this.i18n.finance_conf());
  }

  /*-------------------------- CALEVENT / PERSON FIELD WRITES --------------------------------*/
  /** Attach a calevent to a course (or detach it with ''). Writes ONLY `courseKey`. */
  public async setCourseKey(caleventKey: string, courseKey: string): Promise<void> {
    await this.firestoreService.updateFields(CalEventCollection, caleventKey, { courseKey }, this.i18n.update_error());
  }

  /**
   * Save attendance entries of one calevent: ONE `updateDoc` with a field path `attendance.<personKey>`
   * per entry (never the whole map, never the whole model), so two trainers marking different people at
   * the same moment do not overwrite each other. `confirmedBy` / `confirmedAt` are written alongside when given.
   */
  public async writeAttendance(caleventKey: string, entries: AttendanceEntry[], confirmedBy?: AvatarInfo, confirmedAt?: string): Promise<void> {
    const pairs: (readonly [string | FieldPath, unknown])[] = entries.map(e => [new FieldPath('attendance', e.person.key), { ...e }] as const);
    if (confirmedBy) pairs.push(['attendanceConfirmedBy', { ...confirmedBy }] as const);
    if (confirmedAt !== undefined) pairs.push(['attendanceConfirmedAt', confirmedAt] as const);
    if (pairs.length === 0) return;
    await this.firestoreService.updateFieldPaths(CalEventCollection, caleventKey, pairs, this.i18n.update_error());
  }

  /**
   * Set one external id of a person (`externalIds.<key>`, e.g. the J+S person number under `js`).
   * Writes ONLY that field; the value must satisfy the rule of its key (`isValidExternalId`).
   */
  public async setExternalId(personKey: string, key: string, value: string): Promise<void> {
    if (!isValidExternalId(key, value)) die(`CourseService.setExternalId: '${value}' is not a valid external id for '${key}'.`);
    await this.firestoreService.updateFields(PersonCollection, personKey, { [`externalIds.${key}`]: value }, this.i18n.update_error());
  }

  /*-------------------------- helpers --------------------------------*/
  private financePath(courseKey: string): string {
    return `${CourseCollection}/${courseKey}/${CourseFinanceSubcollection}/${CourseFinanceDocId}`;
  }

  private activityPayload(course: CourseModel): string {
    return `${course.startDate}-${course.endDate}: ${course.name}`;
  }
}
