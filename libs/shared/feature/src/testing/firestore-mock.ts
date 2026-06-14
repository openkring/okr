import { vi } from 'vitest';
import { Observable, of, throwError } from 'rxjs';

/**
 * Test doubles for Firestore-backed services and stores.
 *
 * These helpers are dev-only (they import `vitest`) and live under `src/testing/`,
 * which is excluded from the library build. Import them in specs via
 * `@bk2/shared-feature/testing`.
 */

/** An Observable that emits the given list once (a collection stream). */
export function mockCollection<T>(items: T[]): Observable<T[]> {
  return of(items);
}

/** An Observable that emits a single document (or undefined) once. */
export function mockDoc<T>(item: T | undefined): Observable<T | undefined> {
  return of(item);
}

/** An Observable that errors immediately — for testing stream/error paths. */
export function mockError(message = 'mock-firestore-error'): Observable<never> {
  return throwError(() => new Error(message));
}

/**
 * A vitest mock of `FirestoreService` exposing the CRUD/query surface that the
 * CMS services use. Override individual methods per test as needed.
 */
export function createFirestoreServiceMock() {
  return {
    createModel: vi.fn().mockResolvedValue('new-id'),
    updateModel: vi.fn().mockResolvedValue('updated-id'),
    deleteModel: vi.fn().mockResolvedValue(undefined),
    readModel: vi.fn().mockReturnValue(of(undefined)),
    searchData: vi.fn().mockReturnValue(of([]))
  };
}
