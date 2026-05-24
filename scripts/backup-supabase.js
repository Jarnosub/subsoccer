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
    
    // 1. Backup public_tracking
    const trackingData = await backupTable('public_tracking', 'client_time');
    const trackingHeaders = ['id', 'client_time', 'event_type', 'game_code', 'match_score', 'source_partner', 'user_agent', 'browser_lang', 'location', 'is_returning', 'session_duration'];
    const trackingCsv = jsonToCsv(trackingData, trackingHeaders);
    
    fs.writeFileSync(path.join(BACKUP_DIR, `public_tracking_${timestampStr}.csv`), trackingCsv, 'utf8');
    fs.writeFileSync(path.join(BACKUP_DIR, 'public_tracking_latest.csv'), trackingCsv, 'utf8');
    fs.writeFileSync(path.join(BACKUP_DIR, 'public_tracking_latest.json'), JSON.stringify(trackingData, null, 2), 'utf8');
    console.log(`✓ public_tracking backup saved successfully (${trackingData.length} rows)`);

    // 2. Backup tournament_history
    const historyData = await backupTable('tournament_history', 'created_at');
    const historyHeaders = ['id', 'created_at', 'tournament_name', 'status', 'winner_name', 'second_place_name', 'third_place_name', 'start_datetime', 'end_datetime', 'max_participants', 'tournament_type', 'latitude', 'longitude', 'organizer_id', 'event_id', 'game_id'];
    const historyCsv = jsonToCsv(historyData, historyHeaders);
    
    fs.writeFileSync(path.join(BACKUP_DIR, `tournament_history_${timestampStr}.csv`), historyCsv, 'utf8');
    fs.writeFileSync(path.join(BACKUP_DIR, 'tournament_history_latest.csv'), historyCsv, 'utf8');
    fs.writeFileSync(path.join(BACKUP_DIR, 'tournament_history_latest.json'), JSON.stringify(historyData, null, 2), 'utf8');
    console.log(`✓ tournament_history backup saved successfully (${historyData.length} rows)`);
    
    // 3. Backup players (only non-sensitive schema info)
    const playersData = await backupTable('players', 'created_at');
    const playersHeaders = ['id', 'created_at', 'username', 'elo', 'wins', 'losses', 'country', 'city', 'is_admin'];
    const playersCsv = jsonToCsv(playersData, playersHeaders);
    
    fs.writeFileSync(path.join(BACKUP_DIR, `players_${timestampStr}.csv`), playersCsv, 'utf8');
    fs.writeFileSync(path.join(BACKUP_DIR, 'players_latest.csv'), playersCsv, 'utf8');
    fs.writeFileSync(path.join(BACKUP_DIR, 'players_latest.json'), JSON.stringify(playersData, null, 2), 'utf8');
    console.log(`✓ players backup saved successfully (${playersData.length} rows)`);

    // Create a README in backups
    const readmeContent = `# Subsoccer Analytics Databackup Archive
Created automatically on ${new Date().toLocaleString('fi-FI')}

This directory contains versioned and latest exports of critical analytics tables from Supabase:
- \`public_tracking\` (All user session, match play, and click telemetry events)
- \`tournament_history\` (All event-linked, standalone, and mobile tournaments)
- \`players\` (All registered profile ELO and match totals metadata)

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
