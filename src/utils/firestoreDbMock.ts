import { adminDb } from '@/lib/firebase/admin';

export class PostgrestBuilder implements PromiseLike<any> {
    private _table: string;
    private _method: 'select' | 'insert' | 'update' | 'delete' = 'select';
    private _columns: string = '*';
    private _filters: any[] = [];
    private _order: { column: string, ascending: boolean } | null = null;
    private _single: boolean = false;
    private _maybeSingle: boolean = false;
    private _limit: number | null = null;
    private _data: any = null;

    constructor(table: string) {
        this._table = table;
    }

    select(columns: string = '*') {
        this._method = 'select';
        this._columns = columns;
        return this;
    }

    insert(data: any | any[]) {
        this._method = 'insert';
        this._data = Array.isArray(data) ? data : [data];
        return this;
    }

    update(data: any) {
        this._method = 'update';
        this._data = data;
        return this;
    }

    delete() {
        this._method = 'delete';
        return this;
    }

    eq(column: string, value: any) {
        this._filters.push({ type: 'eq', column, value });
        return this;
    }

    neq(column: string, value: any) {
        this._filters.push({ type: 'neq', column, value });
        return this;
    }

    not(column: string, operator: string, value: any) {
        this._filters.push({ type: 'not', column, operator, value });
        return this;
    }
    
    in(column: string, values: any[]) {
        this._filters.push({ type: 'in', column, values });
        return this;
    }

    order(column: string, options?: { ascending?: boolean }) {
        this._order = { column, ascending: options?.ascending !== false };
        return this;
    }

    limit(count: number) {
        this._limit = count;
        return this;
    }

    single() {
        this._single = true;
        return this;
    }

    maybeSingle() {
        this._maybeSingle = true;
        return this;
    }
    
    returns() {
        return this;
    }

    then<TResult1 = any, TResult2 = never>(
        onfulfilled?: ((value: any) => TResult1 | PromiseLike<TResult1>) | undefined | null,
        onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | undefined | null
    ): Promise<TResult1 | TResult2> {
        return this.execute().then(onfulfilled, onrejected);
    }

    private uuidv4() {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
            var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
    }

    async execute() {
        try {
            const collectionRef = adminDb.collection(this._table);

            if (this._method === 'insert') {
                const results = [];
                const batch = adminDb.batch();
                for (const record of this._data) {
                    const id = record.id || this.uuidv4();
                    const finalRecord = { ...record, id, created_at: record.created_at || new Date().toISOString() };
                    const docRef = collectionRef.doc(id.toString());
                    batch.set(docRef, finalRecord);
                    results.push(finalRecord);
                }
                await batch.commit();
                return { data: this._single || this._maybeSingle ? results[0] : results, error: null };
            }

            // Fetch all contents for filtering/updating/deleting (Fast enough for a few hundred records)
            const snapshot = await collectionRef.get();
            let records: any[] = [];
            snapshot.forEach(doc => {
                records.push({ _docId: doc.id, ...doc.data() });
            });

            // Apply Filters in-memory
            for (const filter of this._filters) {
                records = records.filter(record => {
                    if (filter.type === 'eq') return record[filter.column] === filter.value;
                    if (filter.type === 'neq') return record[filter.column] !== filter.value;
                    if (filter.type === 'not') {
                        if (filter.operator === 'is') return record[filter.column] !== filter.value;
                        return record[filter.column] !== filter.value;
                    }
                    if (filter.type === 'in') {
                        return filter.values.includes(record[filter.column]);
                    }
                    return true;
                });
            }

            if (this._method === 'update') {
                const updatedRecords = [];
                const batch = adminDb.batch();
                for (const record of records) {
                    const docRef = collectionRef.doc(record._docId);
                    const updateData = { ...this._data };
                    // Avoid overriding id unless specified
                    batch.update(docRef, updateData);
                    updatedRecords.push({ ...record, ...updateData });
                }
                await batch.commit();
                return { data: updatedRecords, error: null };
            }

            if (this._method === 'delete') {
                const batch = adminDb.batch();
                for (const record of records) {
                    batch.delete(collectionRef.doc(record._docId));
                }
                await batch.commit();
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

            const finalData = records.map(r => {
                const copy = { ...r };
                delete copy._docId;
                return copy;
            });
            
            let returnData: any = finalData;
            if (this._limit !== null) {
                returnData = returnData.slice(0, this._limit);
            }

            if (this._single) {
                if (returnData.length === 0) return { data: null, error: { message: 'Row not found' } };
                return { data: returnData[0], error: null };
            }
            if (this._maybeSingle) {
                return { data: returnData.length > 0 ? returnData[0] : null, error: null };
            }

            return { data: returnData, error: null, count: finalData.length };
        } catch (error: any) {
            console.error('FirestoreDbMock Error:', error);
            return { data: null, error: { message: error.message } };
        }
    }
}

export const createFirestoreMockClient = (authData?: any) => {
    return {
        from: (table: string) => new PostgrestBuilder(table),
        auth: {
            getUser: async () => {
                if (authData?.uid) {
                    // Try to fetch full user info from firestore users table
                    try {
                        const userDoc = await adminDb.collection('users').doc(authData.uid).get();
                        if (userDoc.exists) {
                            return { data: { user: userDoc.data() }, error: null };
                        }
                    } catch (e) {}
                    return { data: { user: { id: authData.uid, email: authData.email } }, error: null };
                }
                return { data: { user: null }, error: { message: 'Not authenticated' }};
            },
            getSession: async () => {
                if (authData?.uid) return { data: { session: { user: { id: authData.uid, email: authData.email } } }, error: null };
                return { data: { session: null }, error: { message: 'No session' }};
            }
        },
        storage: {
            from: (bucket: string) => ({
                upload: async (path: string, file: any, opts: any) => {
                    console.warn("Storage mock upload not fully implemented on server adapter");
                    return { error: null, data: { path } }
                },
                getPublicUrl: (path: string) => {
                    return { data: { publicUrl: path } }
                }
            })
        }
    };
};
