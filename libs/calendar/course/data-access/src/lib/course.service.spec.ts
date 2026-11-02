import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FieldPath } from 'firebase/firestore';
import { firstValueFrom, Observable, of } from 'rxjs';

vi.mock('@angular/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@angular/core')>();
  return { ...actual, inject: vi.fn() };
});

import { inject } from '@angular/core';

import { ActivityService } from '@okr/activity-data-access';
import { BookingLineService } from '@okr/finance-booking-data-access';
import { ENV } from '@okr/shared-config';
import { FirestoreService } from '@okr/shared-data-access';
import { I18nService } from '@okr/shared-i18n';
import { AttendanceEntry, AvatarInfo, BookingCollection, CalEventCollection, CourseCollection, CourseFinanceModel, CourseModel, PersonCollection } from '@okr/shared-models';

import { CourseService } from './course.service';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyFn<R> = (...args: any[]) => R;
const firestore = {
  createModel: vi.fn<AnyFn<Promise<string>>>(async () => 'new-key'),
  updateModel: vi.fn<AnyFn<Promise<string>>>(async (_c: string, m: CourseModel) => m.okey),
  deleteModel: vi.fn<AnyFn<Promise<string>>>(async () => 'k'),
  readTenantModel: vi.fn<AnyFn<Observable<unknown>>>(() => of(undefined)),
  searchData: vi.fn<AnyFn<Observable<unknown[]>>>(() => of([])),
  readObjectQuiet: vi.fn<AnyFn<Observable<unknown>>>(() => of(undefined)),
  updateObject: vi.fn<AnyFn<Promise<string>>>(async () => 'settings'),
  updateFields: vi.fn<AnyFn<Promise<string>>>(async () => 'k'),
  updateFieldPaths: vi.fn<AnyFn<Promise<string>>>(async () => 'k'),
  getDataOnceStrict: vi.fn<AnyFn<Promise<unknown[]>>>(async () => []),
  readObjectStrict: vi.fn<AnyFn<Promise<unknown>>>(async () => null),
};
const bookingLines = { listForBookings: vi.fn<AnyFn<Promise<unknown[]>>>(async () => []) };
const activity = { log: vi.fn<AnyFn<Promise<undefined>>>(async () => undefined) };
const i18nService = {
  translateAll: (keys: Record<string, string>) => Object.fromEntries(Object.keys(keys).map(k => [k, () => keys[k]])),
};

function makeService(): CourseService {
  vi.mocked(inject).mockImplementation(((token: unknown) => {
    if (token === ENV) return { tenantId: 'scs' };
    if (token === FirestoreService) return firestore;
    if (token === ActivityService) return activity;
    if (token === BookingLineService) return bookingLines;
    if (token === I18nService) return i18nService;
    throw new Error('unexpected inject');
  }) as typeof inject);
  return new CourseService();
}

function avatar(key: string): AvatarInfo {
  return { key, name1: 'A', name2: 'B', modelType: 'person', type: '', subType: '', label: '' };
}

function serverMaintained(): CourseModel {
  const c = new CourseModel('scs');
  c.okey = 'c1';
  c.name = 'Herbstkurs';
  c.trainers = [avatar('p1')];
  c.trainerKeys = ['p1'];
  c.responsibleKeys = ['p1'];
  return c;
}

describe('CourseService', () => {
  let service: CourseService;
  beforeEach(() => {
    vi.clearAllMocks();
    service = makeService();
  });

  describe('server-maintained keys', () => {
    it('update() sends neither trainerKeys nor responsibleKeys, and does not touch the caller\'s model', async () => {
      const course = serverMaintained();
      await service.update(course);
      const sent = firestore.updateModel.mock.calls[0][1] as unknown as Record<string, unknown>;
      expect('trainerKeys' in sent).toBe(false);
      expect('responsibleKeys' in sent).toBe(false);
      expect(sent['name']).toBe('Herbstkurs');
      expect(course.trainerKeys).toEqual(['p1']);
      expect(course.responsibleKeys).toEqual(['p1']);
    });

    it('create() sends neither of them', async () => {
      const key = await service.create(serverMaintained());
      expect(key).toBe('new-key');
      const sent = firestore.createModel.mock.calls[0][1] as unknown as Record<string, unknown>;
      expect('trainerKeys' in sent).toBe(false);
      expect('responsibleKeys' in sent).toBe(false);
    });

    it('recomputes the index on write', async () => {
      await service.update(serverMaintained());
      expect((firestore.updateModel.mock.calls[0][1] as CourseModel).index).toContain('n:Herbstkurs');
    });
  });

  describe('archive', () => {
    it('goes through deleteModel (archive/detach), never a hard delete', async () => {
      const course = serverMaintained();
      await service.archive(course);
      expect(firestore.deleteModel).toHaveBeenCalledWith(CourseCollection, course, expect.any(String), expect.any(String), undefined);
    });
  });

  describe('queries', () => {
    it('list() filters tenant + group, not archived, startDate desc', () => {
      void service.list('g1');
      const [coll, query, orderBy, order] = firestore.searchData.mock.calls[0] as unknown as [string, { key: string; operator: string; value: unknown }[], string, string];
      expect(coll).toBe(CourseCollection);
      expect(query).toContainEqual({ key: 'isArchived', operator: '==', value: false });
      expect(query).toContainEqual({ key: 'tenants', operator: 'array-contains-any', value: ['scs', 'system'] });
      expect(query).toContainEqual({ key: 'groupKey', operator: '==', value: 'g1' });
      expect([orderBy, order]).toEqual(['startDate', 'desc']);
    });

    it('listCourseEvents() filters tenant + courseKey, startDate asc', () => {
      void service.listCourseEvents('c1');
      const [coll, query, orderBy, order] = firestore.searchData.mock.calls[0] as unknown as [string, { key: string; operator: string; value: unknown }[], string, string];
      expect(coll).toBe(CalEventCollection);
      expect(query).toContainEqual({ key: 'courseKey', operator: '==', value: 'c1' });
      expect(query.some(q => q.key === 'tenants')).toBe(true);
      expect([orderBy, order]).toEqual(['startDate', 'asc']);
    });
  });

  describe('finance', () => {
    it('readFinance() reads the protected sub-document through the quiet reader', async () => {
      const finance = new CourseFinanceModel();
      firestore.readObjectQuiet.mockReturnValueOnce(of(finance));
      expect(await firstValueFrom(service.readFinance('c1'))).toBe(finance);
      expect(firestore.readObjectQuiet).toHaveBeenCalledWith('courses/c1/finance/settings');
    });

    it('readFinance() passes a denial (undefined) through', async () => {
      expect(await firstValueFrom(service.readFinance('c1'))).toBeUndefined();
    });

    it('saveFinance() overwrites courses/{key}/finance/settings and drops undefined fields', async () => {
      const finance = new CourseFinanceModel();
      await service.saveFinance('c1', finance);
      const [coll, key, data, force] = firestore.updateObject.mock.calls[0] as unknown as [string, string, Record<string, unknown>, boolean];
      expect(coll).toBe('courses/c1/finance');
      expect(key).toBe('settings');
      expect(force).toBe(true);
      expect('requestedBy' in data).toBe(false);
    });
  });

  describe('field writes', () => {
    it('setCourseKey() writes only courseKey', async () => {
      await service.setCourseKey('e1', 'c1');
      expect(firestore.updateFields).toHaveBeenCalledWith(CalEventCollection, 'e1', { courseKey: 'c1' }, expect.any(String));
    });

    it('writeAttendance() makes ONE write with a FieldPath per entry plus the confirmation', async () => {
      const entry = (key: string): AttendanceEntry => ({ person: avatar(key), presence: 'present', function: 'participant', by: 't1', at: '20260901180000' });
      await service.writeAttendance('e1', [entry('p1'), entry('p2')], avatar('t1'), '20260901190000');
      expect(firestore.updateFieldPaths).toHaveBeenCalledTimes(1);
      const [coll, key, pairs] = firestore.updateFieldPaths.mock.calls[0] as unknown as [string, string, [unknown, unknown][]];
      expect([coll, key]).toEqual([CalEventCollection, 'e1']);
      expect(pairs).toHaveLength(4);
      expect(pairs[0][0]).toBeInstanceOf(FieldPath);
      expect((pairs[0][0] as FieldPath).isEqual(new FieldPath('attendance', 'p1'))).toBe(true);
      expect((pairs[1][0] as FieldPath).isEqual(new FieldPath('attendance', 'p2'))).toBe(true);
      expect(pairs[2][0]).toBe('attendanceConfirmedBy');
      expect(pairs[3]).toEqual(['attendanceConfirmedAt', '20260901190000']);
    });

    it('writeAttendance() without confirmation writes only the entries', async () => {
      await service.writeAttendance('e1', [{ person: avatar('p1'), presence: 'absent', function: 'leader', by: 't1', at: 'x' }]);
      const pairs = firestore.updateFieldPaths.mock.calls[0][2] as unknown as unknown[];
      expect(pairs).toHaveLength(1);
    });

    it('writeAttendance() with nothing to write does not touch the database', async () => {
      await service.writeAttendance('e1', []);
      expect(firestore.updateFieldPaths).not.toHaveBeenCalled();
    });

    it('setExternalId() writes only externalIds.<key>', async () => {
      await service.setExternalId('p1', 'js', '123456789');
      expect(firestore.updateFields).toHaveBeenCalledWith(PersonCollection, 'p1', { 'externalIds.js': '123456789' }, expect.any(String));
    });

    it('setExternalId() refuses a value that does not fit its key', async () => {
      await expect(service.setExternalId('p1', 'js', '12')).rejects.toThrow();
      await expect(service.setExternalId('p1', 'a.b', '1')).rejects.toThrow();
      expect(firestore.updateFields).not.toHaveBeenCalled();
    });
  });
  describe('listPostedCompensation', () => {
    const booking = (okey: string, personKey: string, date = '20261015') => ({
      okey, date, status: 'posted', counterparty: personKey ? { ...avatar(personKey), name1: 'Anna', name2: 'Muster' } : undefined,
    });
    const line = (bookingKey: string, amount: number, side: 'debit' | 'credit' = 'debit') =>
      ({ bookingKey, [side === 'debit' ? 'debitAmount' : 'creditAmount']: { amount } });

    it('queries posted bookings of the books with the course- okey prefix, tenant and books scoped', async () => {
      await service.listPostedCompensation('scs-books');
      const [collection, query] = firestore.getDataOnceStrict.mock.calls[0] as [string, { key: string; operator: string; value: unknown }[]];
      expect(collection).toBe(BookingCollection);
      const tenants = query.find(q => q.key === 'tenants');
      expect(tenants?.value).toContain('scs');
      expect(query).toContainEqual({ key: 'accountingTenantId', operator: '==', value: 'scs-books' });
      expect(query).toContainEqual({ key: 'status', operator: '==', value: 'posted' });
      expect(query).toContainEqual({ key: '__name__', operator: '>=', value: 'course-' });
      expect(query.find(q => q.operator === '<')?.value).toMatch(/^course-/);
    });

    it('refuses without books instead of falling back to the app tenant', async () => {
      await expect(service.listPostedCompensation('')).rejects.toThrow();
      expect(firestore.getDataOnceStrict).not.toHaveBeenCalled();
    });

    it('returns nothing and reads no lines when there is no booking', async () => {
      expect(await service.listPostedCompensation('b')).toEqual([]);
      expect(bookingLines.listForBookings).not.toHaveBeenCalled();
    });

    it('takes the amount from the debit lines and the person from the counterparty', async () => {
      firestore.getDataOnceStrict.mockResolvedValueOnce([booking('course-c1-p1', 'p1'), booking('course-c1-p2', 'p2', '20270102')]);
      bookingLines.listForBookings.mockResolvedValueOnce([
        line('course-c1-p1', 4000), line('course-c1-p1', 4000, 'credit'), line('course-c1-p2', 2500), line('course-c1-p2', 2500, 'credit'),
      ]);
      const result = await service.listPostedCompensation('b');
      expect(bookingLines.listForBookings).toHaveBeenCalledWith('b', ['course-c1-p1', 'course-c1-p2']);
      expect(result).toEqual([
        { date: '20261015', personKey: 'p1', name: 'Anna Muster', amount: 4000 },
        { date: '20270102', personKey: 'p2', name: 'Anna Muster', amount: 2500 },
      ]);
    });

    it('skips a booking without a counterparty (anonymized)', async () => {
      firestore.getDataOnceStrict.mockResolvedValueOnce([booking('course-c1-p1', ''), booking('course-c1-p2', 'p2')]);
      bookingLines.listForBookings.mockResolvedValueOnce([line('course-c1-p2', 100)]);
      const result = await service.listPostedCompensation('b');
      expect(result.map(r => r.personKey)).toEqual(['p2']);
      expect(bookingLines.listForBookings).toHaveBeenCalledWith('b', ['course-c1-p2']);
    });
  });
  describe('listAll', () => {
    it('queries the tenant\'s courses without a group, newest first', () => {
      service.listAll();
      const [collection, query, orderBy, direction] = firestore.searchData.mock.calls[0] as [string, { key: string; value: unknown }[], string, string];
      expect(collection).toBe(CourseCollection);
      expect(query.some(q => q.key === 'groupKey')).toBe(false);
      expect(query.find(q => q.key === 'tenants')?.value).toContain('scs');
      expect([orderBy, direction]).toEqual(['startDate', 'desc']);
    });
  });

  describe('readFinanceStrict', () => {
    it('reads the finance document by path, from the server', async () => {
      const stored = new CourseFinanceModel();
      firestore.readObjectStrict.mockResolvedValueOnce(stored);
      expect(await service.readFinanceStrict('c1')).toBe(stored);
      expect(firestore.readObjectStrict).toHaveBeenCalledWith(`${CourseCollection}/c1/finance/settings`);
    });

    it('answers null when the server confirmed that there is no document', async () => {
      firestore.readObjectStrict.mockResolvedValueOnce(null);
      expect(await service.readFinanceStrict('c1')).toBeNull();
    });

    it('rejects when the read failed, instead of looking like a missing document', async () => {
      firestore.readObjectStrict.mockRejectedValueOnce(new Error('client is offline'));
      await expect(service.readFinanceStrict('c1')).rejects.toThrow('offline');
    });
  });
});
