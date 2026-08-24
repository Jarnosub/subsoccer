-- Digital Game Plays — tracking table for subsoccer.pro/play minigame
-- Records each completed game: who won, scores, session info

create table if not exists public.digital_game_plays (
  id           bigserial primary key,
  winner       text not null check (winner in ('player', 'cpu', 'draw')),
  score_player smallint not null default 0,
  score_cpu    smallint not null default 0,
  duration_s   numeric(5,1),      -- game duration in seconds (e.g. 14.2)
  player_name  text,              -- nickname for leaderboard
  country      text,              -- 2-letter ISO country code
  user_agent   text,              -- browser/device info (anonymized)
  created_at   timestamptz not null default now()
);

-- Index for time-based analytics queries
create index if not exists digital_game_plays_created_at_idx
  on public.digital_game_plays (created_at desc);

-- RLS: allow anonymous inserts (no auth required to track)
alter table public.digital_game_plays enable row level security;

create policy "Anyone can insert game result"
  on public.digital_game_plays
  for insert
  to anon, authenticated
  with check (true);

create policy "Authenticated can read analytics"
  on public.digital_game_plays
  for select
  to authenticated
  using (true);
