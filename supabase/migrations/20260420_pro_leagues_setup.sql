-- Migration to create isolated Pro Leagues architecture
-- This ensures NO existing code or events are affected.

CREATE TABLE IF NOT EXISTS pro_leagues (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  league_name TEXT NOT NULL,
  organizer_id UUID REFERENCES players(id),
  status TEXT DEFAULT 'enrolling', -- enrolling, drawing, group_stage, playoffs, completed
  group_size INTEGER DEFAULT 8,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS league_participants (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  league_id UUID REFERENCES pro_leagues(id) ON DELETE CASCADE,
  player_id UUID REFERENCES players(id),
  guest_name TEXT,
  assigned_group TEXT DEFAULT NULL, -- e.g. 'A', 'B' (NULL = waiting for draw)
  advanced_to_playoffs BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(league_id, player_id)
);

-- RLS (Row Level Security) basics to allow mobile clients to read/insert
ALTER TABLE pro_leagues ENABLE ROW LEVEL SECURITY;
ALTER TABLE league_participants ENABLE ROW LEVEL SECURITY;

-- Allow public read access to active leagues
CREATE POLICY "Public read active leagues" ON pro_leagues FOR SELECT USING (true);

-- Allow authenticated players to create a league
CREATE POLICY "Players can create active leagues" ON pro_leagues FOR INSERT WITH CHECK (auth.uid() = organizer_id);

-- Allow authenticated players to join leagues
CREATE POLICY "Players can insert own league registration" ON league_participants FOR INSERT WITH CHECK (auth.uid() = player_id);
CREATE POLICY "Public read league participants" ON league_participants FOR SELECT USING (true);

-- Allow organizers to add manual guests
CREATE POLICY "Organizers can add manual guests" ON league_participants 
FOR INSERT WITH CHECK (
  EXISTS (
    SELECT 1 FROM pro_leagues 
    WHERE pro_leagues.id = league_id 
    AND pro_leagues.organizer_id = auth.uid()
  )
);

-- Active Table Sessions: Hosting full Group Brackets on iPads
CREATE TABLE IF NOT EXISTS pro_table_sessions (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  league_id UUID REFERENCES pro_leagues(id) ON DELETE CASCADE,
  table_number INTEGER NOT NULL,
  group_name TEXT NOT NULL,
  group_players JSONB NOT NULL, -- The array of 8 players assigned to this table
  active_match_p1 TEXT,
  active_match_p2 TEXT,
  active_match_p1_score INTEGER DEFAULT 0,
  active_match_p2_score INTEGER DEFAULT 0,
  status TEXT DEFAULT 'bracket_view', -- 'bracket_view', 'match_playing', 'completed'
  group_winner TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(league_id, table_number) -- One active session per physical table per league
);

-- RLS for Table sessions
ALTER TABLE pro_table_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read table sessions" ON pro_table_sessions FOR SELECT USING (true);
CREATE POLICY "Organizers full access table sessions" ON pro_table_sessions FOR ALL USING (true) WITH CHECK (true);

