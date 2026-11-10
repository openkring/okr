// A small in-memory Firestore for the credit and billing specs: doc get/set/create/update, simple collection
// queries (where ==, ranges, array-contains) and transactions with optimistic
// concurrency like Firestore (versions per document, recorded on get, checked at commit, retried on conflict).
// Test-only: imported by *.spec.ts, never by production code.
import type { Firestore } from 'firebase-admin/firestore';

export type Doc = Record<string, unknown>;
export type Store = Record<string, Doc>; // keyed by full path

export function fakeDb(store: Store): Firestore {
  const versions: Record<string, number> = {};
  const ver = (p: string) => versions[p] ?? 0;
  const bump = (p: string) => { versions[p] = ver(p) + 1; };
  const docRef = (path: string): unknown => ({
    path,
    id: path.split('/').pop(),
    get: async () => ({ id: path.split('/').pop(), exists: store[path] !== undefined, data: () => (store[path] ? { ...store[path] } : undefined) }),
    set: async (d: Doc) => { store[path] = d; bump(path); },
    create: async (d: Doc) => {
      if (store[path] !== undefined) throw Object.assign(new Error(`document ${path} already exists`), { code: 6 });
      store[path] = d;
      bump(path);
    },
    update: async (d: Doc) => {
      if (!store[path]) throw new Error(`no document ${path}`);
      store[path] = { ...store[path], ...d };
      bump(path);
    },
    collection: (name: string) => colRef(`${path}/${name}`),
  });
  let autoId = 0;
  type Filter = { field: string; op: string; value: unknown };
  const matches = (d: Doc, f: Filter): boolean => {
    const v = d[f.field] as never;
    switch (f.op) {
      case '==': return v === f.value;
      case '>=': return v >= (f.value as never);
      case '>': return v > (f.value as never);
      case '<=': return v <= (f.value as never);
      case '<': return v < (f.value as never);
      case 'array-contains': return Array.isArray(v) && (v as unknown[]).includes(f.value);
      default: throw new Error(`fakeDb: unsupported operator ${f.op}`);
    }
  };
  // a query over the direct children of a collection path; equality, range and array-contains filters
  const query = (path: string, filters: Filter[]): unknown => ({
    where: (field: string, op: string, value: unknown) => query(path, [...filters, { field, op, value }]),
    get: async () => {
      const docs = Object.keys(store)
        .filter((p) => p.startsWith(`${path}/`) && !p.slice(path.length + 1).includes('/'))
        .filter((p) => filters.every((f) => matches(store[p], f)))
        .map((p) => ({ id: p.split('/').pop(), ref: docRef(p), data: () => ({ ...store[p] }) }));
      return { docs, empty: docs.length === 0, size: docs.length };
    },
  });
  const colRef = (path: string): unknown => ({
    path,
    doc: (id?: string) => docRef(`${path}/${id ?? `auto${++autoId}`}`),
    where: (field: string, op: string, value: unknown) => query(path, [{ field, op, value }]),
    get: async () => (query(path, []) as { get(): Promise<unknown> }).get(),
  });
  const pathOf = (r: unknown) => (r as { path: string }).path;
  return {
    collection: (name: string) => colRef(name),
    runTransaction: async <T>(fn: (tx: unknown) => Promise<T>): Promise<T> => {
      for (let attempt = 0; attempt < 5; attempt++) {
        const reads = new Map<string, number>();
        const writes: (() => void)[] = [];
        const result = await fn({
          get: async (r: unknown) => {
            const p = pathOf(r);
            reads.set(p, ver(p));
            const snap = await (r as { get(): Promise<unknown> }).get();
            await new Promise(res => setTimeout(res, 0)); // let a concurrent transaction read too
            return snap;
          },
          set: (r: unknown, d: Doc) => writes.push(() => { store[pathOf(r)] = d; bump(pathOf(r)); }),
          update: (r: unknown, d: Doc) => writes.push(() => { store[pathOf(r)] = { ...store[pathOf(r)], ...d }; bump(pathOf(r)); }),
        });
        if ([...reads].every(([p, v]) => ver(p) === v)) { writes.forEach(w => w()); return result; }
      }
      throw new Error('too much contention');
    },
  } as unknown as Firestore;
}
