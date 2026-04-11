import { createClient } from '@supabase/supabase-js';
import * as admin from 'firebase-admin';

// Load environment manually if running straight from node, but assume process.env is injected by Next or tsx
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
// We need the SERVICE_ROLE_KEY to bypass Row Level Security
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

const supabase = createClient(supabaseUrl, supabaseKey);

if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert({
            projectId: process.env.FIREBASE_ADMIN_PROJECT_ID,
            clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
            privateKey: process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, '\n'),
        }),
    });
}
const db = admin.firestore();

const tablesToMigrate = [
    'users',
    'courses',
    'assignments',
    'evaluations',
    'class_attendances',
    'exam_submissions',
    'archive_pages',
    'board_questions',
    'error_reports',
    'chat_messages',
    'chat_read_receipts',
    'poll_votes',
    'student_notes_history',
    'portfolio_reviews'
];

async function migrateTable(tableName: string) {
    console.log(`Starting migration for table: ${tableName}`);
    let { data, error } = await supabase.from(tableName).select('*');
    
    if (error) {
        console.error(`Error querying ${tableName}: ${error.message}`);
        return;
    }
    if (!data || data.length === 0) {
        console.log(`Table ${tableName} is empty.`);
        return;
    }

    console.log(`Found ${data.length} rows in ${tableName}.`);
    
    const batchSize = 20;
    for (let i = 0; i < data.length; i += batchSize) {
        const batch = db.batch();
        const chunk = data.slice(i, i + batchSize);
        
        for (const row of chunk) {
            // Ensure no individual string fields exceed Firestore size limits (~1MB)
            for (const key of Object.keys(row)) {
                if (typeof row[key] === 'string' && row[key].length > 800000) {
                    console.warn(`[WARN] Truncating huge field '${key}' for doc ${row.id || 'unknown'} in ${tableName}`);
                    row[key] = row[key].substring(0, 800000) + '...[TRUNCATED FOR FIRESTORE]';
                }
            }
            
            // Use the original Supabase ID to preserve foreign key relationships easily
            const docId = row.id?.toString();
            // Fallback to random ID if no primary key 'id' exists
            const docRef = docId ? db.collection(tableName).doc(docId) : db.collection(tableName).doc();
            batch.set(docRef, row);
        }
        
        await batch.commit();
        console.log(`[${tableName}] Migrated batch ${i / batchSize + 1} (${chunk.length} items)`);
    }
    console.log(`✅ Successfully migrated ${tableName}`);
}

async function runAll() {
    for (const table of tablesToMigrate) {
        await migrateTable(table);
    }
    console.log('\n🚀 ALL MIGRATIONS COMPLETED!');
}

runAll().catch(console.error);
