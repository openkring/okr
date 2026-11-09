// A small in-memory Firestore for the credit specs: doc get/set/update and transactions with optimistic
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
    update: async (d: Doc) => {
      if (!store[path]) throw new Error(`no document ${path}`);
      store[path] = { ...store[path], ...d };
      bump(path);
    },
    collection: (name: string) => colRef(`${path}/${name}`),
  });
  let autoId = 0;
  const colRef = (path: string): unknown => ({ path, doc: (id?: string) => docRef(`${path}/${id ?? `auto${++autoId}`}`) });
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
