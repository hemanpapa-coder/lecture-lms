import { DRIVE_FOLDERS, getDriveClient, findFileByName, readJsonFile, writeJsonFile, listFiles, trashFile } from '@/lib/googleDrive';
import crypto from 'crypto';
// 테이블별 대상 폴더 매핑
const TABLE_FOLDER_MAP: Record<string, () => string> = {
  users: DRIVE_FOLDERS.SYSTEM,
  courses: DRIVE_FOLDERS.SYSTEM,
  evaluations: DRIVE_FOLDERS.SYSTEM,
  archive_pages: DRIVE_FOLDERS.ARCHIVE,
  board_questions: DRIVE_FOLDERS.BOARD,
  error_reports: DRIVE_FOLDERS.ERRORS,
  exam_submissions: DRIVE_FOLDERS.EXAMS,
  assignments: DRIVE_FOLDERS.ASSIGNMENTS,
  class_attendances: DRIVE_FOLDERS.WORKSPACE, // assuming they are stored per user
};

const getTargetFolder = (table: string) => {
  const folderFunc = TABLE_FOLDER_MAP[table] || DRIVE_FOLDERS.SYSTEM;
  return folderFunc();
};

export class PostgrestBuilder implements PromiseLike<any> {
  private _table: string;
  private _method: 'select' | 'insert' | 'update' | 'delete' = 'select';
  private _columns: string = '*';
  private _filters: any[] = [];
  private _order: { column: string, ascending: boolean } | null = null;
  private _single: boolean = false;
  private _maybeSingle: boolean = false;
  private _limit: number | null = null;
  private _data: any = null; // for insert/update

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
    return this; // Typescript mock
  }

  // Promise-like then
  then<TResult1 = any, TResult2 = never>(
    onfulfilled?: ((value: any) => TResult1 | PromiseLike<TResult1>) | undefined | null,
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | undefined | null
  ): Promise<TResult1 | TResult2> {
    return this.execute().then(onfulfilled, onrejected);
  }

  async execute() {
    try {
      const folderId = getTargetFolder(this._table);
      // fileName convention: tb_[tableName]_[id].json
      const allFiles = await listFiles(folderId, { nameContains: `tb_${this._table}_` });

      if (this._method === 'insert') {
        const results = [];
        for (const record of this._data) {
          const id = record.id || crypto.randomUUID();
          const fileName = `tb_${this._table}_${id}.json`;
          const finalRecord = { ...record, id, created_at: record.created_at || new Date().toISOString() };
          await writeJsonFile(folderId, fileName, finalRecord);
          results.push(finalRecord);
        }
        return { data: this._single || this._maybeSingle ? results[0] : results, error: null };
      }

      // Fetch all contents for filtering/updating/deleting
      let records: any[] = [];
      const drive = getDriveClient();
      for (const file of allFiles) {
        if (!file.id) continue;
        const data = await readJsonFile<any>(file.id);
        if (data) {
          records.push({ _fileId: file.id, ...data });
        }
      }

      // Apply Filters
      for (const filter of this._filters) {
        records = records.filter(record => {
          if (filter.type === 'eq') return record[filter.column] === filter.value;
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
        for (const record of records) {
          const updated = { ...record, ...this._data };
          const fileId = updated._fileId;
          delete updated._fileId;
          await writeJsonFile(folderId, `tb_${this._table}_${updated.id}.json`, updated, fileId);
          updatedRecords.push(updated);
        }
        return { data: updatedRecords, error: null };
      }

      if (this._method === 'delete') {
        for (const record of records) {
          await trashFile(record._fileId);
        }
        return { data: null, error: null };
      }

      // SELECT
      if (this._order) {
        records.sort((a, b) => {
          const va = a[this._order!.column];
          const vb = b[this._order!.column];
          if (va < vb) return this._order!.ascending ? -1 : 1;
          if (va > vb) return this._order!.ascending ? 1 : -1;
          return 0;
        });
      }

      // Clean up internal property
      const finalData = records.map(r => {
        const copy = { ...r };
        delete copy._fileId;
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

      // If count is requested
      return { data: returnData, error: null, count: finalData.length };
    } catch (error: any) {
      console.error('DriveDB Error:', error);
      return { data: null, error: { message: error.message } };
    }
  }
}

export const createDriveMockClient = (authData?: any) => {
  return {
    from: (table: string) => new PostgrestBuilder(table),
    auth: {
      getUser: async () => {
        // If authData is injected from session token
        if (authData?.uid) return { data: { user: { id: authData.uid, email: authData.email } }, error: null };
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
               console.warn("Storage upload not implemented in mock client yet!");
               return { error: null, data: { path } }
           },
           getPublicUrl: (path: string) => {
                return { data: { publicUrl: path } }
           }
       })
   }
  };
};
