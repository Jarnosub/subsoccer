/**
 * Subsoccer Pro — Supabase Database Data Backup Script (API-based)
 * 
 * This script exports all table data from Supabase to a local JSON file.
 * It uses the Supabase REST API (via @supabase/supabase-js) and paginates
 * through large tables to bypass the 1000-row API limits.
 * 
 * Usage:
 *   1. Create a file named `.env.backup` in the project root.
 *   2. Add your Supabase Service Role Key:
 *      SUPABASE_SERVICE_ROLE_KEY=your-service-role-key-here
 *   3. Run the script:
 *      node scripts/backup-db-data.js
 */

const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

// 1. Configuration
const DEFAULT_SUPABASE_URL = 'https://ujxmmrsmdwrgcwatdhvx.supabase.co';
const BACKUP_DIR = path.join(__dirname, '..', 'database', 'backups');

const TABLES_TO_BACKUP = [
    'countries',
    'players',
    'games',
    'matches',
    'events',
    'event_registrations',
    'event_games',
    'event_moderators',
    'tournament_history',
    'tournament_matches',
    'ownership_transfer_requests',
    'hardware_registry',
    'qr_lobbies',
    'qr_lobby_participants',
    'payments',
    'card_orders',
    'pro_leagues',
    'league_participants',
    'pro_table_sessions',
    'public_tracking'
];

// Helper to parse key-value pairs from .env files without external dependencies
function loadEnvFile(filePath) {
    if (!fs.existsSync(filePath)) return;
    const content = fs.readFileSync(filePath, 'utf-8');
    content.split('\n').forEach(line => {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) return;
        const eqIdx = trimmed.indexOf('=');
        if (eqIdx === -1) return;
        const key = trimmed.slice(0, eqIdx).trim();
        let value = trimmed.slice(eqIdx + 1).trim();
        // Remove surrounding quotes if they exist
        if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
            value = value.slice(1, -1);
        }
        process.env[key] = value;
    });
}

// 2. Load Environment Variables
loadEnvFile(path.join(__dirname, '..', '.env'));
loadEnvFile(path.join(__dirname, '..', '.env.backup'));

const supabaseUrl = process.env.SUPABASE_URL || DEFAULT_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!serviceRoleKey) {
    console.error('\x1b[31m%s\x1b[0m', '❌ Error: SUPABASE_SERVICE_ROLE_KEY is not defined!');
    console.log('\nPlease set it either as an environment variable or create a \x1b[33m.env.backup\x1b[0m file in the project root containing:');
    console.log('SUPABASE_SERVICE_ROLE_KEY=your_secret_service_role_key\n');
    console.log('⚠️ Note: Do NOT use the public anon key. The Service Role Key is required to bypass Row Level Security (RLS) policies and read all tables.');
    process.exit(1);
}

// 3. Initialize Supabase Client
const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false }
});

// 4. Exporter Logic
async function backupTable(tableName) {
    console.log(`   Fetching table: \x1b[36m${tableName}\x1b[0m...`);
    let allData = [];
    let page = 0;
    const pageSize = 1000;
    let hasMore = true;

    while (hasMore) {
        const startRange = page * pageSize;
        const endRange = (page + 1) * pageSize - 1;

        // Perform range selection for pagination
        const { data, error } = await supabase
            .from(tableName)
            .select('*')
            .range(startRange, endRange)
            .order('created_at', { ascending: true, nullsFirst: true }).catch(() => {
                // Fallback if table doesn't have created_at column
                return supabase.from(tableName).select('*').range(startRange, endRange);
            });

        if (error) {
            // Some tables might not have a created_at column, retry without ordering
            if (error.message && error.message.includes('column') && error.message.includes('does not exist')) {
                const retryResult = await supabase
                    .from(tableName)
                    .select('*')
                    .range(startRange, endRange);
                if (retryResult.error) {
                    throw retryResult.error;
                }
                allData = allData.concat(retryResult.data);
                if (retryResult.data.length < pageSize) {
                    hasMore = false;
                } else {
                    page++;
                }
            } else {
                throw error;
            }
        } else {
            allData = allData.concat(data);
            if (data.length < pageSize) {
                hasMore = false;
            } else {
                page++;
            }
        }
    }
    console.log(`   ✅ \x1b[32m${tableName}\x1b[0m: Downloaded ${allData.length} rows.`);
    return allData;
}

async function run() {
    console.log('\x1b[35m%s\x1b[0m', '==================================================');
    console.log('\x1b[35m%s\x1b[0m', '   Subsoccer Pro — Supabase DB API-Data Exporter   ');
    console.log('\x1b[35m%s\x1b[0m', '==================================================');
    console.log(`🔗 Target URL: ${supabaseUrl}`);
    console.log(`📂 Output Directory: ${BACKUP_DIR}`);

    // Ensure backups directory exists
    if (!fs.existsSync(BACKUP_DIR)) {
        fs.mkdirSync(BACKUP_DIR, { recursive: true });
    }

    const backupData = {
        metadata: {
            timestamp: new Date().toISOString(),
            project: 'subsoccer-pro',
            projectRef: 'ujxmmrsmdwrgcwatdhvx',
            exportedBy: 'scripts/backup-db-data.js'
        },
        tables: {}
    };

    let errorCount = 0;

    for (const tableName of TABLES_TO_BACKUP) {
        try {
            const data = await backupTable(tableName);
            backupData.tables[tableName] = data;
        } catch (err) {
            // Log error but continue with other tables
            console.error(`   ❌ \x1b[31mFailed to backup table ${tableName}:\x1b[0m`, err.message || err);
            backupData.tables[tableName] = { error: err.message || err };
            errorCount++;
        }
    }

    // Save to file
    const dateStr = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    const timestampStr = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `db-data-backup-${timestampStr}.json`;
    const outputPath = path.join(BACKUP_DIR, filename);

    fs.writeFileSync(outputPath, JSON.stringify(backupData, null, 2), 'utf-8');

    console.log('\x1b[35m%s\x1b[0m', '--------------------------------------------------');
    if (errorCount === 0) {
        console.log('\x1b[32m%s\x1b[0m', `🎉 SUCCESS! Backup created successfully.`);
    } else {
        console.log('\x1b[33m%s\x1b[0m', `⚠️ Completed with ${errorCount} errors. Some tables could not be downloaded.`);
    }
    console.log(`📁 File saved to: \x1b[36m${outputPath}\x1b[0m`);
    console.log(`💾 File size: ${(fs.statSync(outputPath).size / 1024).toFixed(2)} KB`);
    console.log('\x1b[35m%s\x1b[0m', '==================================================');
}

run();
