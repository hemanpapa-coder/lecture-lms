import { db, auth } from '@/lib/firebase/client';
import { collection, getDocs, doc, setDoc, updateDoc, deleteDoc, onSnapshot, query, where, orderBy, limit } from 'firebase/firestore';

class FirestoreClientBuilder {
    private _table: string;
    private _method: 'select' | 'insert' | 'update' | 'delete' = 'select';
    private _filters: any[] = [];
    private _order: { column: string, ascending: boolean } | null = null;
    private _single: boolean = false;
    private _limit: number | null = null;
    private _data: any = null;

    constructor(table: string) {
        this._table = table;
    }

    select(columns: string = '*') {
        this._method = 'select';
        return this;
    }
    insert(data: any | any[]) { this._method = 'insert'; this._data = Array.isArray(data) ? data : [data]; return this; }
    update(data: any) { this._method = 'update'; this._data = data; return this; }
    delete() { this._method = 'delete'; return this; }
    eq(column: string, value: any) { this._filters.push({ type: '==', column, value }); return this; }
    neq(column: string, value: any) { this._filters.push({ type: '!=', column, value }); return this; }
    not(column: string, operator: string, value: any) { this._filters.push({ type: 'not', column, operator, value }); return this; }
    in(column: string, values: any[]) { this._filters.push({ type: 'in', column, values }); return this; }
    order(column: string, options?: { ascending?: boolean }) { this._order = { column, ascending: options?.ascending !== false }; return this; }
    limit(count: number) { this._limit = count; return this; }
    single() { this._single = true; return this; }
    maybeSingle() { this._single = true; return this; }

    then<TResult1 = any, TResult2 = never>(
        onfulfilled?: ((value: any) => TResult1 | PromiseLike<TResult1>) | undefined | null,
        onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | undefined | null
    ): Promise<TResult1 | TResult2> {
        return this.execute().then(onfulfilled, onrejected);
    }

    async execute() {
        try {
            const colRef = collection(db, this._table);

            if (this._method === 'insert') {
                const results = [];
                for (const record of this._data) {
                    const id = record.id || Date.now().toString() + Math.random().toString(36).substring(7);
                    const finalRecord = { ...record, id, created_at: record.created_at || new Date().toISOString() };
                    await setDoc(doc(db, this._table, id.toString()), finalRecord);
                    results.push(finalRecord);
                }
                return { data: this._single ? results[0] : results, error: null };
            }

            // Create Query
            let q = query(colRef);
            
            // To simplify execution logic on client, we fetch all and filter in memory, matching server behavior and bypassing Firestore indexing restrictions.
            const snapshot = await getDocs(q);
            let records: any[] = [];
            snapshot.forEach(d => records.push({ _docId: d.id, ...d.data() }));

            for (const filter of this._filters) {
                records = records.filter(record => {
                    if (filter.type === '==') return record[filter.column] === filter.value;
                    if (filter.type === '!=') return record[filter.column] !== filter.value;
                    if (filter.type === 'not') {
                        if (filter.operator === 'is') return record[filter.column] !== filter.value;
                        return record[filter.column] !== filter.value;
                    }
                    if (filter.type === 'in') return filter.values.includes(record[filter.column]);
                    return true;
                });
            }

            if (this._method === 'update') {
                const updated = [];
                for (const record of records) {
                    await updateDoc(doc(db, this._table, record._docId), this._data);
                    updated.push({ ...record, ...this._data });
                }
                return { data: updated, error: null };
            }

            if (this._method === 'delete') {
                for (const record of records) {
                    await deleteDoc(doc(db, this._table, record._docId));
                }
                return { data: null, error: null };
            }

            // SELECT logic
            if (this._order) {
                records.sort((a, b) => {
                    const va = a[this._order!.column];
                    const vb = b[this._order!.column];
                    if (va < vb) return this._order!.ascending ? -1 : 1;
                    if (va > vb) return this._order!.ascending ? 1 : -1;
                    return 0;
                });
            }

            const finalData = records.map(r => { const c = { ...r }; delete c._docId; return c; });
            let returnData: any = finalData;
            
            if (this._limit !== null) returnData = returnData.slice(0, this._limit);
            if (this._single) return { data: returnData.length > 0 ? returnData[0] : null, error: null };
            
            return { data: returnData, error: null, count: finalData.length };
        } catch (error: any) {
            console.error('Firestore Client Adapter Error:', error);
            return { data: null, error: { message: error.message } };
        }
    }
}

export function createClient() {
  return {
    auth: {
      signOut: async () => { await auth.signOut(); },
      getUser: async () => ({ data: { user: auth.currentUser }, error: null }),
      getSession: async () => ({ data: { session: auth.currentUser ? { user: auth.currentUser } : null }, error: null }),
    },
    // Realtime mocked using snapshot
    channel: (name: string) => ({
      on: (event: any, options: any, callback: any) => {
        const unsubscribe = onSnapshot(collection(db, options.table || options.schema), (snapshot) => {
             snapshot.docChanges().forEach((change) => {
                 if (change.type === "added" && options.event !== 'UPDATE') { // simplified mock for INSERT
                     callback({ new: change.doc.data(), old: null });
                 }
                 if (change.type === "modified" && options.event !== 'INSERT') {
                     callback({ new: change.doc.data(), old: change.doc.data() });
                 }
             });
        });
        return { subscribe: () => unsubscribe };
      },
    }),
    removeChannel: () => {},
    from: (table: string) => new FirestoreClientBuilder(table),
    storage: {
      from: () => ({
        upload: async () => ({ data: { path: '' }, error: null }),
        getPublicUrl: () => ({ data: { publicUrl: '' } })
      })
    }
  };
}
