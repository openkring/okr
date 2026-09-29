import { FieldValue } from 'firebase-admin/firestore';

/** Tiny in-memory Firestore stand-in for the step tests: collection/doc/where(==, array-contains)/get/batch/getAll. */
export function fakeFirestore(seed = {}) {
  const store = new Map();                                     // 'col/id' → data
  for (const [col, docs] of Object.entries(seed)) for (const [id, data] of Object.entries(docs)) store.set(`${col}/${id}`, structuredClone(data));
  const snapOf = (col, id) => {
    const data = store.get(`${col}/${id}`);
    return { id, exists: data !== undefined, ref: docRef(col, id), data: () => data, get: (f) => data?.[f] };
  };
  const docRef = (col, id) => ({
    id, path: `${col}/${id}`,
    get: async () => snapOf(col, id),
    set: async (data, opt) => write(col, id, data, opt),
  });
  const write = (col, id, data, opt) => {
    const prev = opt?.merge ? (store.get(`${col}/${id}`) ?? {}) : {};
    const next = { ...prev };
    for (const [k, v] of Object.entries(data)) { if (v && (v.__delete || (v instanceof FieldValue && v.isEqual(FieldValue.delete())))) delete next[k]; else next[k] = v; }
    store.set(`${col}/${id}`, next);
  };
  const query = (col, filters) => ({
    where: (f, op, v) => query(col, [...filters, [f, op, v]]),
    get: async () => ({
      docs: [...store.keys()].filter(k => k.startsWith(col + '/')).map(k => k.slice(col.length + 1))
        .map(id => snapOf(col, id))
        .filter(s => filters.every(([f, op, v]) => op === '==' ? s.data()[f] === v : (s.data()[f] ?? []).includes(v))),
    }),
  });
  return {
    store,
    collection: (col) => ({ doc: (id) => docRef(col, String(id)), where: (f, op, v) => query(col, [[f, op, v]]), get: () => query(col, []).get() }),
    batch() {
      const ops = [];
      return {
        set: (ref, data, opt) => ops.push(() => ref.set(data, opt)),
        delete: (ref) => ops.push(() => store.delete(ref.path)),
        commit: async () => { for (const op of ops) await op(); },
      };
    },
    getAll: async (...refs) => Promise.all(refs.map(r => r.get())),
  };
}

export const fakeDelete = { __delete: true };
