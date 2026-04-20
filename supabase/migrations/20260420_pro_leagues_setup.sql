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

-- Active Table Match Sessions (For Scoreboards & iPads)
CREATE TABLE IF NOT EXISTS pro_match_sessions (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  league_id UUID REFERENCES pro_leagues(id) ON DELETE CASCADE,
  table_number INTEGER NOT NULL, -- e.g. 1, 2, 3...
  p1_name TEXT NOT NULL,
  p2_name TEXT NOT NULL,
  p1_score INTEGER DEFAULT 0,
  p2_score INTEGER DEFAULT 0,
  status TEXT DEFAULT 'active', -- 'active', 'p1_won', 'p2_won'
  bracket_match_id TEXT NOT NULL, -- e.g. 'r0_m0' mapped from BracketEngine
  group_index INTEGER, -- To track if it belongs to a group stage
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(league_id, table_number) -- One active match per table per league
);

-- RLS for match sessions
ALTER TABLE pro_match_sessions ENABLE ROW LEVEL SECURITY;

-- Allow public read for displays
CREATE POLICY "Public read match sessions" ON pro_match_sessions FOR SELECT USING (true);

-- Allow organizers and game logic to update/insert
CREATE POLICY "Organizers full access match sessions" ON pro_match_sessions 
FOR ALL USING (true) WITH CHECK (true); -- Note: Simplified for staging, should secure by auth.uid() = organizer_id in prod
