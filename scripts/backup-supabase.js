const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

// Supabase staging keys (matching the app configuration)
const SUPA_URL = 'https://ujxmmrsmdwrgcwatdhvx.supabase.co';
const SUPA_KEY = 'sb_publishable_hMb0ml4fl2A9GLqm28gemg_CAE5vY8t';
const supabase = createClient(SUPA_URL, SUPA_KEY);

const BACKUP_DIR = path.join(__dirname, '../backups');

// Helper to format as CSV
function jsonToCsv(jsonArray, headers) {
  if (!jsonArray || jsonArray.length === 0) return '';
  
  const csvRows = [headers.join(',')];
  
  for (const row of jsonArray) {
    const values = headers.map(header => {
      const val = row[header];
      if (val === null || val === undefined) {
        return '';
      }
      const strVal = String(val);
      // Escape quotes and wrap in quotes if it contains commas, quotes, or newlines
      if (strVal.includes(',') || strVal.includes('"') || strVal.includes('\n') || strVal.includes('\r')) {
        return `"${strVal.replace(/"/g, '""')}"`;
      }
      return strVal;
    });
    csvRows.push(values.join(','));
  }
  
  return csvRows.join('\n');
}

async function backupTable(tableName, orderColumn) {
  console.log(`Backing up table: ${tableName}...`);
  let allData = [];
  let page = 0;
  const pageSize = 1000;
  
  while (true) {
    let query = supabase.from(tableName).select('*').range(page * pageSize, (page + 1) * pageSize - 1);
    if (orderColumn) {
      query = query.order(orderColumn, { ascending: true });
    }
    
    const { data, error } = await query;
    if (error) {
      console.error(`Error fetching page ${page} of ${tableName}:`, error);
      throw error;
    }
    
    if (!data || data.length === 0) break;
    allData.push(...data);
    
    console.log(`  Fetched ${allData.length} rows...`);
    if (data.length < pageSize) break;
    page++;
  }
  
  return allData;
}

async function runBackup() {
  try {
    // Ensure backup directory exists
    if (!fs.existsSync(BACKUP_DIR)) {
      fs.mkdirSync(BACKUP_DIR, { recursive: true });
    }
    
    const timestampStr = new Date().toISOString().split('T')[0];
    
    // Config for all tables to backup
    const tablesToBackup = [
      {
        name: 'public_tracking',
        order: 'client_time',
        headers: ['id', 'client_time', 'event_type', 'game_code', 'match_score', 'source_partner', 'user_agent', 'browser_lang', 'location', 'is_returning', 'session_duration']
      },
      {
        name: 'tournament_history',
        order: 'created_at',
        headers: ['id', 'created_at', 'tournament_name', 'status', 'winner_name', 'second_place_name', 'third_place_name', 'start_datetime', 'end_datetime', 'max_participants', 'tournament_type', 'latitude', 'longitude', 'organizer_id', 'event_id', 'game_id']
      },
      {
        name: 'players',
        order: 'created_at',
        headers: ['id', 'created_at', 'username', 'elo', 'wins', 'losses', 'country', 'city', 'is_admin']
      },
      {
        name: 'matches',
        order: 'created_at',
        headers: ['id', 'created_at', 'player1', 'player2', 'winner', 'tournament_name', 'tournament_id', 'event_id', 'player1_score', 'player2_score', 'is_verified_table', 'elo_capped', 'game_id']
      },
      {
        name: 'events',
        order: 'created_at',
        headers: ['id', 'event_name', 'event_type', 'game_id', 'start_datetime', 'end_datetime', 'organizer_id', 'status', 'max_participants', 'description', 'is_public', 'image_url', 'created_at', 'location', 'address', 'latitude', 'longitude', 'brand_logo_url', 'primary_color']
      },
      {
        name: 'event_registrations',
        order: 'created_at',
        headers: ['id', 'event_id', 'player_id', 'registered_at', 'status', 'checked_in', 'tournament_id', 'created_at']
      },
      {
        name: 'games',
        order: 'created_at',
        headers: ['id', 'created_at', 'unique_code', 'game_name', 'owner_id', 'location', 'latitude', 'longitude', 'is_public', 'serial_number', 'verified', 'registered_at', 'image_url', 'privacy_mode', 'model']
      },
      {
        name: 'teams',
        order: 'created_at',
        headers: ['id', 'name', 'tag', 'logo_url', 'captain_id', 'combined_elo', 'created_at']
      }
    ];

    for (const t of tablesToBackup) {
      const data = await backupTable(t.name, t.order);
      const csv = jsonToCsv(data, t.headers);
      
      fs.writeFileSync(path.join(BACKUP_DIR, `${t.name}_${timestampStr}.csv`), csv, 'utf8');
      fs.writeFileSync(path.join(BACKUP_DIR, `${t.name}_latest.csv`), csv, 'utf8');
      fs.writeFileSync(path.join(BACKUP_DIR, `${t.name}_latest.json`), JSON.stringify(data, null, 2), 'utf8');
      console.log(`✓ ${t.name} backup saved successfully (${data.length} rows)`);
    }

    // Create a README in backups
    const readmeContent = `# Subsoccer Analytics Databackup Archive
Created automatically on ${new Date().toLocaleString('fi-FI')}

This directory contains versioned and latest exports of all critical tables from Supabase:
- \`public_tracking\` (All user session, match play, and click telemetry events)
- \`tournament_history\` (All event-linked, standalone, and mobile tournaments)
- \`players\` (All registered profiles, ELO, and match metadata)
- \`matches\` (All individual match outcomes, scores, and ELO calculations)
- \`events\` (All multi-day or single tournaments schedules and locations)
- \`event_registrations\` (All participant linkages to events and brackets)
- \`games\` (All registered Subsoccer game tables, serials, and map locations)
- \`teams\` (All player-formed competitive clubs and combined team ELO)

CSV files are comma-delimited, UTF-8 encoded, with properly escaped quotes/commas.
`;
    fs.writeFileSync(path.join(BACKUP_DIR, 'README.md'), readmeContent, 'utf8');
    
    console.log("✓ Backup archive completed successfully!");
  } catch (err) {
    console.error("Backup failed:", err);
    process.exit(1);
  }
}

runBackup();
