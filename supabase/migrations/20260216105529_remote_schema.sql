


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "pg_graphql" WITH SCHEMA "graphql";






CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE OR REPLACE FUNCTION "public"."add_tournament_participant"("p_tournament_id" "uuid", "p_player_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
    v_existing UUID;
    v_event_id UUID;
BEGIN
    -- Get event_id from tournament
    SELECT event_id INTO v_event_id
    FROM public.tournament_history
    WHERE id = p_tournament_id
    LIMIT 1;
    
    IF v_event_id IS NULL THEN
        RAISE EXCEPTION 'Tournament not found or has no event_id';
    END IF;
    
    -- Check if already registered
    SELECT id INTO v_existing
    FROM public.event_registrations
    WHERE tournament_id = p_tournament_id
    AND player_id = p_player_id
    LIMIT 1;
    
    IF v_existing IS NOT NULL THEN
        RETURN false; -- Already registered
    END IF;
    
    -- Insert registration
    INSERT INTO public.event_registrations (
        event_id,
        tournament_id,
        player_id,
        status,
        registered_at
    ) VALUES (
        v_event_id,
        p_tournament_id,
        p_player_id,
        'registered',
        NOW()
    );
    
    RETURN true;
END;
$$;


ALTER FUNCTION "public"."add_tournament_participant"("p_tournament_id" "uuid", "p_player_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."advance_winner_to_next_round"("p_match_id" "uuid", "p_winner_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
    v_current_match RECORD;
    v_next_round INT;
    v_next_match_number INT;
    v_is_player1_slot BOOLEAN;
    v_update_field TEXT;
BEGIN
    -- Get current match details
    SELECT * INTO v_current_match 
    FROM public.tournament_matches 
    WHERE id = p_match_id;
    
    -- Calculate next round (rounds go: 8→4→2→1)
    v_next_round := v_current_match.round / 2;
    
    -- If already in final (round 1), no advancement needed
    IF v_next_round < 1 THEN
        RETURN true;
    END IF;
    
    -- Calculate which match in next round (match 1,2 → next match 1; match 3,4 → next match 2)
    v_next_match_number := CEIL(v_current_match.match_number::FLOAT / 2.0);
    
    -- Determine if winner goes to player1 or player2 slot (odd match numbers go to player1)
    v_is_player1_slot := (v_current_match.match_number % 2 = 1);
    
    -- Update next round match with winner
    IF v_is_player1_slot THEN
        UPDATE public.tournament_matches
        SET player1_id = p_winner_id
        WHERE tournament_id = v_current_match.tournament_id
        AND round = v_next_round
        AND match_number = v_next_match_number;
    ELSE
        UPDATE public.tournament_matches
        SET player2_id = p_winner_id
        WHERE tournament_id = v_current_match.tournament_id
        AND round = v_next_round
        AND match_number = v_next_match_number;
    END IF;
    
    RETURN true;
END;
$$;


ALTER FUNCTION "public"."advance_winner_to_next_round"("p_match_id" "uuid", "p_winner_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."approve_ownership_transfer"("transfer_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
    v_game_id UUID;
    v_new_owner_id UUID;
BEGIN
    -- Get transfer details
    SELECT game_id, new_owner_id INTO v_game_id, v_new_owner_id
    FROM public.ownership_transfer_requests
    WHERE id = transfer_id AND status = 'pending';
    
    IF NOT FOUND THEN
        RETURN false;
    END IF;
    
    -- Update game ownership
    UPDATE public.games
    SET owner_id = v_new_owner_id
    WHERE id = v_game_id;
    
    -- Mark transfer as approved
    UPDATE public.ownership_transfer_requests
    SET status = 'approved', resolved_at = NOW()
    WHERE id = transfer_id;
    
    RETURN true;
END;
$$;


ALTER FUNCTION "public"."approve_ownership_transfer"("transfer_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_guest_player"("p_username" "text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
    v_player_id UUID;
    v_existing_id UUID;
BEGIN
    -- Check if player already exists (case-insensitive)
    SELECT id INTO v_existing_id
    FROM public.players
    WHERE LOWER(username) = LOWER(p_username)
    LIMIT 1;
    
    IF v_existing_id IS NOT NULL THEN
        RETURN v_existing_id; -- Return existing player
    END IF;
    
    -- Create new guest player
    INSERT INTO public.players (username, elo, wins, created_at)
    VALUES (p_username, 1000, 0, NOW())
    RETURNING id INTO v_player_id;
    
    RETURN v_player_id;
END;
$$;


ALTER FUNCTION "public"."create_guest_player"("p_username" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."generate_tournament_bracket"("p_tournament_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
    v_participant_count INT;
    v_bracket_size INT;
    v_participants TEXT[]; -- MUUTETTU: TEXT[]
    v_participant_names TEXT[];
    v_player_index INT;
    bye_match RECORD;
    v_next_round INT;
    v_next_match_number INT;
    v_is_player1_slot BOOLEAN;
    v_temp_player_id TEXT; -- MUUTETTU: TEXT
    v_temp_player_name TEXT;
    v_current_round INT;
    v_matches_in_round INT;
    v_match_number INT;
BEGIN
    -- Haetaan osallistujat ja pakotetaan ID tekstiksi heti alussa
    SELECT 
        array_agg(
            CASE 
                WHEN player_id IS NOT NULL THEN player_id::text
                ELSE gen_random_uuid()::text 
            END 
            ORDER BY random()
        ),
        array_agg(player_name ORDER BY random())
    INTO v_participants, v_participant_names
    FROM public.event_registrations
    WHERE tournament_id = p_tournament_id AND status = 'registered';
    
    v_participant_count := array_length(v_participants, 1);
    
    IF v_participant_count IS NULL OR v_participant_count < 2 THEN
        RETURN false;
    END IF;
    
    -- Luodaan väliaikaiset profiilit vieraille (käytetään ::text vertailussa)
    FOR i IN 1..v_participant_count LOOP
        v_temp_player_id := v_participants[i];
        v_temp_player_name := v_participant_names[i];
        
        IF NOT EXISTS (SELECT 1 FROM public.players WHERE id::text = v_temp_player_id::text) THEN
            INSERT INTO public.players (id, username, elo, wins, created_at)
            VALUES (v_temp_player_id, v_temp_player_name, 1000, 0, NOW())
            ON CONFLICT (id) DO NOTHING;
        END IF;
    END LOOP;
    
    -- Tyhjennetään vanhat matsit
    DELETE FROM public.tournament_matches WHERE tournament_id = p_tournament_id;
    
    -- Generoidaan kaavio
    v_bracket_size := power(2, ceil(log(2, v_participant_count)));
    v_current_round := v_bracket_size / 2;
    v_matches_in_round := v_bracket_size / 2;
    v_player_index := 1;
    
    FOR v_match_number IN 1..v_matches_in_round LOOP
        INSERT INTO public.tournament_matches (
            tournament_id, round, match_number,
            player1_id, player2_id, status
        ) VALUES (
            p_tournament_id,
            v_current_round,
            v_match_number,
            CASE WHEN v_player_index <= v_participant_count THEN v_participants[v_player_index] ELSE NULL END,
            CASE WHEN v_player_index + 1 <= v_participant_count THEN v_participants[v_player_index + 1] ELSE NULL END,
            CASE 
                WHEN v_player_index <= v_participant_count AND v_player_index + 1 <= v_participant_count THEN 'pending'
                ELSE 'bye'
            END
        );
        v_player_index := v_player_index + 2;
    END LOOP;

    -- Generoidaan tyhjät kierrokset
    WHILE v_current_round > 1 LOOP
        v_current_round := v_current_round / 2;
        v_matches_in_round := v_matches_in_round / 2;
        FOR v_match_number IN 1..v_matches_in_round LOOP
            INSERT INTO public.tournament_matches (tournament_id, round, match_number, status)
            VALUES (p_tournament_id, v_current_round, v_match_number, 'pending');
        END LOOP;
    END LOOP;
    
    RETURN true;
END;
$$;


ALTER FUNCTION "public"."generate_tournament_bracket"("p_tournament_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_player_events"("player_id_input" "text") RETURNS TABLE("event_id" "uuid", "event_name" "text", "start_datetime" timestamp with time zone, "status" "text", "registration_status" "text", "checked_in" boolean)
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    RETURN QUERY
    SELECT 
        e.id,
        e.event_name,
        e.start_datetime,
        e.status,
        er.status as registration_status,
        er.checked_in
    FROM public.events e
    JOIN public.event_registrations er ON e.id = er.event_id
    WHERE er.player_id::text = player_id_input::text
    ORDER BY e.start_datetime ASC;
END;
$$;


ALTER FUNCTION "public"."get_player_events"("player_id_input" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_player_events"("player_uuid" "uuid") RETURNS TABLE("event_id" "uuid", "event_name" "text", "start_datetime" timestamp with time zone, "status" "text", "registration_status" "text", "checked_in" boolean)
    LANGUAGE "plpgsql"
    AS $$
BEGIN
    RETURN QUERY
    SELECT 
        e.id,
        e.event_name,
        e.start_datetime,
        e.status,
        er.status as registration_status,
        er.checked_in
    FROM public.events e
    JOIN public.event_registrations er ON e.id = er.event_id
    WHERE er.player_id = player_uuid
    ORDER BY e.start_datetime ASC;
END;
$$;


ALTER FUNCTION "public"."get_player_events"("player_uuid" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_event_full"("event_uuid" "uuid") RETURNS boolean
    LANGUAGE "plpgsql"
    AS $$
DECLARE
    current_count INTEGER;
    max_count INTEGER;
BEGIN
    SELECT 
        COUNT(DISTINCT player_id) FILTER (WHERE status = 'registered'),
        e.max_participants
    INTO current_count, max_count
    FROM public.event_registrations er
    JOIN public.events e ON e.id = er.event_id
    WHERE er.event_id = event_uuid
    GROUP BY e.max_participants;
    
    RETURN current_count >= max_count;
END;
$$;


ALTER FUNCTION "public"."is_event_full"("event_uuid" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."release_game_ownership"("p_game_id" "uuid", "p_player_id" "uuid") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
    -- Verify ownership and update
    UPDATE public.games
    SET owner_id = NULL, verified = false
    WHERE id = p_game_id AND owner_id = p_player_id;
    
    IF FOUND THEN
        -- Cancel any pending transfer requests for this game
        UPDATE public.ownership_transfer_requests
        SET status = 'cancelled', resolved_at = NOW()
        WHERE game_id = p_game_id AND status = 'pending';
        
        RETURN true;
    END IF;
    
    RETURN false;
END;
$$;


ALTER FUNCTION "public"."release_game_ownership"("p_game_id" "uuid", "p_player_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rls_auto_enable"() RETURNS "event_trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog'
    AS $$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$$;


ALTER FUNCTION "public"."rls_auto_enable"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."sync_tournament_match_to_matches"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
    v_player1_data RECORD;
    v_player2_data RECORD;
    v_winner_data RECORD;
    v_tournament_name TEXT;
    v_new_elo_p1 INT;
    v_new_elo_p2 INT;
    v_k_factor INT := 32;
    v_expected_p1 FLOAT;
    v_expected_p2 FLOAT;
    v_actual_p1 FLOAT;
    v_actual_p2 FLOAT;
    v_next_round INT;
    v_next_match_number INT;
    v_is_player1_slot BOOLEAN;
BEGIN
    -- Only process when match is completed (not bye)
    IF NEW.status = 'completed' AND OLD.status != 'completed' THEN
        
        -- Get player data
        SELECT * INTO v_player1_data FROM public.players WHERE id = NEW.player1_id;
        SELECT * INTO v_player2_data FROM public.players WHERE id = NEW.player2_id;
        SELECT * INTO v_winner_data FROM public.players WHERE id = NEW.winner_id;
        
        -- Get tournament name
        SELECT tournament_name INTO v_tournament_name 
        FROM public.tournament_history 
        WHERE id = NEW.tournament_id;
        
        IF v_player1_data.id IS NOT NULL AND v_player2_data.id IS NOT NULL THEN
            
            -- Calculate ELO changes
            v_expected_p1 := 1.0 / (1.0 + power(10, (v_player2_data.elo - v_player1_data.elo) / 400.0));
            v_expected_p2 := 1.0 - v_expected_p1;
            
            IF NEW.winner_id = NEW.player1_id THEN
                v_actual_p1 := 1.0;
                v_actual_p2 := 0.0;
            ELSE
                v_actual_p1 := 0.0;
                v_actual_p2 := 1.0;
            END IF;
            
            v_new_elo_p1 := v_player1_data.elo + round(v_k_factor * (v_actual_p1 - v_expected_p1));
            v_new_elo_p2 := v_player2_data.elo + round(v_k_factor * (v_actual_p2 - v_expected_p2));
            
            -- Update player ELO ratings
            UPDATE public.players SET elo = v_new_elo_p1 WHERE id = NEW.player1_id;
            UPDATE public.players SET elo = v_new_elo_p2 WHERE id = NEW.player2_id;
            
            -- Update winner's win count
            UPDATE public.players 
            SET wins = COALESCE(wins, 0) + 1 
            WHERE id = NEW.winner_id;
            
            -- Insert match record into matches table
            INSERT INTO public.matches (
                player1,
                player2,
                winner,
                tournament_name,
                tournament_id,
                created_at
            ) VALUES (
                v_player1_data.username,
                v_player2_data.username,
                v_winner_data.username,
                v_tournament_name,
                NEW.tournament_id,
                NEW.completed_at
            );
            
            -- Advance winner to next round
            v_next_round := NEW.round / 2;
            
            IF v_next_round >= 1 THEN
                v_next_match_number := CEIL(NEW.match_number::FLOAT / 2.0);
                v_is_player1_slot := (NEW.match_number % 2 = 1);
                
                IF v_is_player1_slot THEN
                    UPDATE public.tournament_matches
                    SET player1_id = NEW.winner_id
                    WHERE tournament_id = NEW.tournament_id
                    AND round = v_next_round
                    AND match_number = v_next_match_number;
                ELSE
                    UPDATE public.tournament_matches
                    SET player2_id = NEW.winner_id
                    WHERE tournament_id = NEW.tournament_id
                    AND round = v_next_round
                    AND match_number = v_next_match_number;
                END IF;
            END IF;
            
        END IF;
    END IF;
    
    RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."sync_tournament_match_to_matches"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."countries" (
    "id" bigint NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "name" "text",
    "code" "text"
);


ALTER TABLE "public"."countries" OWNER TO "postgres";


ALTER TABLE "public"."countries" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."countries_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."event_registrations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "event_id" "uuid" NOT NULL,
    "player_id" "uuid" NOT NULL,
    "registered_at" timestamp with time zone DEFAULT "now"(),
    "status" "text" DEFAULT 'registered'::"text" NOT NULL,
    "checked_in" boolean DEFAULT false,
    "tournament_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "event_registrations_status_check" CHECK (("status" = ANY (ARRAY['registered'::"text", 'confirmed'::"text", 'cancelled'::"text"])))
);


ALTER TABLE "public"."event_registrations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "event_name" "text" NOT NULL,
    "event_type" "text" DEFAULT 'tournament'::"text" NOT NULL,
    "game_id" "uuid",
    "start_datetime" timestamp with time zone NOT NULL,
    "end_datetime" timestamp with time zone,
    "organizer_id" "uuid",
    "status" "text" DEFAULT 'upcoming'::"text" NOT NULL,
    "max_participants" integer DEFAULT 16,
    "registration_deadline" timestamp with time zone,
    "description" "text",
    "is_public" boolean DEFAULT true,
    "image_url" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "location" "text",
    "address" "text",
    "latitude" double precision,
    "longitude" double precision,
    "brand_logo_url" "text",
    "primary_color" "text" DEFAULT '#FFD700'::"text",
    CONSTRAINT "events_event_type_check" CHECK (("event_type" = ANY (ARRAY['tournament'::"text", 'league'::"text", 'casual'::"text"]))),
    CONSTRAINT "events_status_check" CHECK (("status" = ANY (ARRAY['upcoming'::"text", 'ongoing'::"text", 'completed'::"text", 'cancelled'::"text"])))
);


ALTER TABLE "public"."events" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."events_with_participant_count" AS
SELECT
    NULL::"uuid" AS "id",
    NULL::"text" AS "event_name",
    NULL::"text" AS "event_type",
    NULL::"uuid" AS "game_id",
    NULL::timestamp with time zone AS "start_datetime",
    NULL::timestamp with time zone AS "end_datetime",
    NULL::"uuid" AS "organizer_id",
    NULL::"text" AS "status",
    NULL::integer AS "max_participants",
    NULL::timestamp with time zone AS "registration_deadline",
    NULL::"text" AS "description",
    NULL::boolean AS "is_public",
    NULL::"text" AS "image_url",
    NULL::timestamp with time zone AS "created_at",
    NULL::"text" AS "location",
    NULL::"text" AS "address",
    NULL::double precision AS "latitude",
    NULL::double precision AS "longitude",
    NULL::"text" AS "brand_logo_url",
    NULL::"text" AS "primary_color",
    NULL::bigint AS "registered_count",
    NULL::bigint AS "checked_in_count",
    NULL::"text" AS "game_name",
    NULL::"text" AS "game_location";


ALTER VIEW "public"."events_with_participant_count" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."games" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "unique_code" "text",
    "game_name" "text",
    "owner_id" "uuid" DEFAULT "gen_random_uuid"(),
    "location" "text",
    "latitude" double precision,
    "longitude" double precision,
    "is_public" boolean DEFAULT false,
    "serial_number" "text",
    "verified" boolean DEFAULT false,
    "registered_at" timestamp with time zone
);


ALTER TABLE "public"."games" OWNER TO "postgres";


COMMENT ON COLUMN "public"."games"."unique_code" IS 'Auto-generated from serial_number. Legacy field for backward compatibility.';



COMMENT ON COLUMN "public"."games"."serial_number" IS 'Primary game identifier from QR code sticker. Required for tournament eligibility and verified status.';



CREATE TABLE IF NOT EXISTS "public"."matches" (
    "id" bigint NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "player1" "text",
    "player2" "text",
    "winner" "text",
    "tournament_name" "text",
    "tournament_id" "uuid",
    "event_id" "uuid",
    "player1_score" integer,
    "player2_score" integer
);


ALTER TABLE "public"."matches" OWNER TO "postgres";


ALTER TABLE "public"."matches" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."matches_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."ownership_transfer_requests" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "game_id" "uuid" NOT NULL,
    "serial_number" "text" NOT NULL,
    "current_owner_id" "uuid" NOT NULL,
    "new_owner_id" "uuid" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "message" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "resolved_at" timestamp with time zone,
    CONSTRAINT "different_owners" CHECK (("current_owner_id" <> "new_owner_id")),
    CONSTRAINT "ownership_transfer_requests_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'approved'::"text", 'rejected'::"text", 'cancelled'::"text"])))
);


ALTER TABLE "public"."ownership_transfer_requests" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."players" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "username" "text" NOT NULL,
    "password" "text",
    "wins" bigint DEFAULT 0,
    "team" "text" DEFAULT '''NONE'''::"text",
    "rank" "text" DEFAULT '''SILVER'''::"text",
    "avatar_url" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "elo" integer DEFAULT 1300,
    "country" "text",
    "email" "text",
    "email_verified" boolean DEFAULT false,
    "full_name" "text",
    "phone" "text",
    "city" "text",
    "losses" integer DEFAULT 0,
    "is_admin" boolean DEFAULT false,
    "acquired_via" "text"
);


ALTER TABLE "public"."players" OWNER TO "postgres";


COMMENT ON COLUMN "public"."players"."email" IS 'Sähköpostiosoite salasanan palautusta varten';



COMMENT ON COLUMN "public"."players"."full_name" IS 'Pelaajan virallinen nimi';



CREATE TABLE IF NOT EXISTS "public"."tournament_history" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "tournament_name" "text",
    "winner_name" "text",
    "third_place_name" "text",
    "second_place_name" "text",
    "tournament_id" "uuid" DEFAULT "gen_random_uuid"(),
    "event_name" "text",
    "game_id" "uuid",
    "losses" bigint DEFAULT '0'::bigint,
    "matches_played" bigint DEFAULT '0'::bigint,
    "avatar_url" "text",
    "event_id" "uuid",
    "organizer_id" "uuid",
    "tournament_type" "text" DEFAULT 'elimination'::"text",
    "max_participants" integer DEFAULT 8,
    "status" "text" DEFAULT 'scheduled'::"text",
    "start_datetime" timestamp with time zone,
    "end_datetime" timestamp with time zone,
    CONSTRAINT "tournament_history_status_check" CHECK (("status" = ANY (ARRAY['scheduled'::"text", 'ongoing'::"text", 'completed'::"text", 'cancelled'::"text"]))),
    CONSTRAINT "tournament_history_tournament_type_check" CHECK (("tournament_type" = ANY (ARRAY['elimination'::"text", 'swiss'::"text", 'round_robin'::"text"])))
);


ALTER TABLE "public"."tournament_history" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."tournament_matches" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tournament_id" "uuid" NOT NULL,
    "round" integer NOT NULL,
    "match_number" integer NOT NULL,
    "player1_id" "uuid",
    "player2_id" "uuid",
    "winner_id" "uuid",
    "player1_score" integer DEFAULT 0,
    "player2_score" integer DEFAULT 0,
    "status" "text" DEFAULT 'pending'::"text",
    "started_at" timestamp with time zone,
    "completed_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "tournament_matches_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'in_progress'::"text", 'completed'::"text", 'bye'::"text"])))
);


ALTER TABLE "public"."tournament_matches" OWNER TO "postgres";


ALTER TABLE ONLY "public"."countries"
    ADD CONSTRAINT "countries_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."event_registrations"
    ADD CONSTRAINT "event_registrations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."event_registrations"
    ADD CONSTRAINT "event_registrations_unique" UNIQUE ("event_id", "tournament_id", "player_id");



ALTER TABLE ONLY "public"."events"
    ADD CONSTRAINT "events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."games"
    ADD CONSTRAINT "games_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."players"
    ADD CONSTRAINT "idx_players_email_unique" UNIQUE ("email");



ALTER TABLE ONLY "public"."tournament_matches"
    ADD CONSTRAINT "match_round_unique" UNIQUE ("tournament_id", "round", "match_number");



ALTER TABLE ONLY "public"."matches"
    ADD CONSTRAINT "matches_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ownership_transfer_requests"
    ADD CONSTRAINT "ownership_transfer_requests_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."players"
    ADD CONSTRAINT "players_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."tournament_history"
    ADD CONSTRAINT "tournament_history_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."tournament_matches"
    ADD CONSTRAINT "tournament_matches_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."players"
    ADD CONSTRAINT "unique_username" UNIQUE ("username");



CREATE INDEX "idx_event_registrations_created_at" ON "public"."event_registrations" USING "btree" ("created_at");



CREATE INDEX "idx_event_registrations_event_id" ON "public"."event_registrations" USING "btree" ("event_id");



CREATE INDEX "idx_event_registrations_player_id" ON "public"."event_registrations" USING "btree" ("player_id");



CREATE INDEX "idx_event_registrations_status" ON "public"."event_registrations" USING "btree" ("status");



CREATE INDEX "idx_event_registrations_tournament_id" ON "public"."event_registrations" USING "btree" ("tournament_id");



CREATE INDEX "idx_events_game_id" ON "public"."events" USING "btree" ("game_id");



CREATE INDEX "idx_events_organizer_id" ON "public"."events" USING "btree" ("organizer_id");



CREATE INDEX "idx_events_start_datetime" ON "public"."events" USING "btree" ("start_datetime");



CREATE INDEX "idx_events_status" ON "public"."events" USING "btree" ("status");



CREATE INDEX "idx_games_owner_id" ON "public"."games" USING "btree" ("owner_id");



CREATE UNIQUE INDEX "idx_games_serial_number_unique" ON "public"."games" USING "btree" ("serial_number") WHERE ("serial_number" IS NOT NULL);



CREATE INDEX "idx_games_verified" ON "public"."games" USING "btree" ("verified");



CREATE INDEX "idx_matches_event_id" ON "public"."matches" USING "btree" ("event_id");



CREATE INDEX "idx_ownership_transfers_current_owner" ON "public"."ownership_transfer_requests" USING "btree" ("current_owner_id");



CREATE INDEX "idx_ownership_transfers_game_id" ON "public"."ownership_transfer_requests" USING "btree" ("game_id");



CREATE INDEX "idx_ownership_transfers_new_owner" ON "public"."ownership_transfer_requests" USING "btree" ("new_owner_id");



CREATE INDEX "idx_ownership_transfers_status" ON "public"."ownership_transfer_requests" USING "btree" ("status");



CREATE INDEX "idx_players_email" ON "public"."players" USING "btree" ("email");



CREATE INDEX "idx_tournament_history_event_id" ON "public"."tournament_history" USING "btree" ("event_id");



CREATE INDEX "idx_tournament_history_organizer_id" ON "public"."tournament_history" USING "btree" ("organizer_id");



CREATE INDEX "idx_tournament_history_start_datetime" ON "public"."tournament_history" USING "btree" ("start_datetime");



CREATE INDEX "idx_tournament_history_status" ON "public"."tournament_history" USING "btree" ("status");



CREATE INDEX "idx_tournament_matches_players" ON "public"."tournament_matches" USING "btree" ("player1_id", "player2_id");



CREATE INDEX "idx_tournament_matches_round" ON "public"."tournament_matches" USING "btree" ("tournament_id", "round");



CREATE INDEX "idx_tournament_matches_status" ON "public"."tournament_matches" USING "btree" ("status");



CREATE INDEX "idx_tournament_matches_tournament" ON "public"."tournament_matches" USING "btree" ("tournament_id");



CREATE OR REPLACE VIEW "public"."events_with_participant_count" AS
 SELECT "e"."id",
    "e"."event_name",
    "e"."event_type",
    "e"."game_id",
    "e"."start_datetime",
    "e"."end_datetime",
    "e"."organizer_id",
    "e"."status",
    "e"."max_participants",
    "e"."registration_deadline",
    "e"."description",
    "e"."is_public",
    "e"."image_url",
    "e"."created_at",
    "e"."location",
    "e"."address",
    "e"."latitude",
    "e"."longitude",
    "e"."brand_logo_url",
    "e"."primary_color",
    "count"(DISTINCT "er"."player_id") FILTER (WHERE ("er"."status" = 'registered'::"text")) AS "registered_count",
    "count"(DISTINCT "er"."player_id") FILTER (WHERE ("er"."checked_in" = true)) AS "checked_in_count",
    "g"."game_name",
    "g"."location" AS "game_location"
   FROM (("public"."events" "e"
     LEFT JOIN "public"."event_registrations" "er" ON (("e"."id" = "er"."event_id")))
     LEFT JOIN "public"."games" "g" ON (("e"."game_id" = "g"."id")))
  GROUP BY "e"."id", "g"."game_name", "g"."location";



CREATE OR REPLACE TRIGGER "trigger_sync_tournament_match" AFTER UPDATE ON "public"."tournament_matches" FOR EACH ROW EXECUTE FUNCTION "public"."sync_tournament_match_to_matches"();



ALTER TABLE ONLY "public"."event_registrations"
    ADD CONSTRAINT "event_registrations_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."event_registrations"
    ADD CONSTRAINT "event_registrations_player_id_fkey" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."event_registrations"
    ADD CONSTRAINT "event_registrations_tournament_id_fkey" FOREIGN KEY ("tournament_id") REFERENCES "public"."tournament_history"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."events"
    ADD CONSTRAINT "events_game_id_fkey" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."games"
    ADD CONSTRAINT "games_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "public"."players"("id") ON UPDATE CASCADE;



ALTER TABLE ONLY "public"."matches"
    ADD CONSTRAINT "matches_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."ownership_transfer_requests"
    ADD CONSTRAINT "ownership_transfer_requests_current_owner_id_fkey" FOREIGN KEY ("current_owner_id") REFERENCES "public"."players"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."ownership_transfer_requests"
    ADD CONSTRAINT "ownership_transfer_requests_game_id_fkey" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."ownership_transfer_requests"
    ADD CONSTRAINT "ownership_transfer_requests_new_owner_id_fkey" FOREIGN KEY ("new_owner_id") REFERENCES "public"."players"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."tournament_history"
    ADD CONSTRAINT "tournament_history_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."tournament_history"
    ADD CONSTRAINT "tournament_history_game_id_fkey" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id");



ALTER TABLE ONLY "public"."tournament_history"
    ADD CONSTRAINT "tournament_history_organizer_id_fkey" FOREIGN KEY ("organizer_id") REFERENCES "public"."players"("id") ON UPDATE CASCADE;



ALTER TABLE ONLY "public"."tournament_matches"
    ADD CONSTRAINT "tournament_matches_tournament_id_fkey" FOREIGN KEY ("tournament_id") REFERENCES "public"."tournament_history"("id") ON DELETE CASCADE;



CREATE POLICY "Anyone can delete matches" ON "public"."tournament_matches" FOR DELETE USING (true);



CREATE POLICY "Anyone can delete ownership transfers" ON "public"."ownership_transfer_requests" FOR DELETE USING (true);



CREATE POLICY "Anyone can insert matches" ON "public"."tournament_matches" FOR INSERT WITH CHECK (true);



CREATE POLICY "Anyone can insert ownership transfers" ON "public"."ownership_transfer_requests" FOR INSERT WITH CHECK (true);



CREATE POLICY "Anyone can insert players" ON "public"."players" FOR INSERT WITH CHECK (true);



CREATE POLICY "Anyone can update matches" ON "public"."tournament_matches" FOR UPDATE USING (true);



CREATE POLICY "Anyone can update ownership transfers" ON "public"."ownership_transfer_requests" FOR UPDATE USING (true);



CREATE POLICY "Anyone can update players" ON "public"."players" FOR UPDATE USING (true);



CREATE POLICY "Anyone can view matches" ON "public"."tournament_matches" FOR SELECT USING (true);



CREATE POLICY "Anyone can view ownership transfers" ON "public"."ownership_transfer_requests" FOR SELECT USING (true);



CREATE POLICY "Anyone can view players" ON "public"."players" FOR SELECT USING (true);



CREATE POLICY "Enable read access for all users" ON "public"."countries" FOR SELECT USING (true);



CREATE POLICY "Public Access" ON "public"."event_registrations" USING (true) WITH CHECK (true);



CREATE POLICY "Public Access" ON "public"."events" USING (true) WITH CHECK (true);



CREATE POLICY "Public Access" ON "public"."games" USING (true) WITH CHECK (true);



CREATE POLICY "Public Access" ON "public"."players" USING (true) WITH CHECK (true);



CREATE POLICY "Public Access" ON "public"."tournament_history" USING (true) WITH CHECK (true);



CREATE POLICY "Users can view their own requests" ON "public"."ownership_transfer_requests" FOR SELECT TO "authenticated" USING (((("current_owner_id")::"text" = ("auth"."uid"())::"text") OR (("new_owner_id")::"text" = ("auth"."uid"())::"text")));



ALTER TABLE "public"."countries" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."event_registrations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."events" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."games" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."ownership_transfer_requests" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."players" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."tournament_history" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."tournament_matches" ENABLE ROW LEVEL SECURITY;




ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";


GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";

























































































































































GRANT ALL ON FUNCTION "public"."add_tournament_participant"("p_tournament_id" "uuid", "p_player_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."add_tournament_participant"("p_tournament_id" "uuid", "p_player_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."add_tournament_participant"("p_tournament_id" "uuid", "p_player_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."advance_winner_to_next_round"("p_match_id" "uuid", "p_winner_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."advance_winner_to_next_round"("p_match_id" "uuid", "p_winner_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."advance_winner_to_next_round"("p_match_id" "uuid", "p_winner_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."approve_ownership_transfer"("transfer_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."approve_ownership_transfer"("transfer_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."approve_ownership_transfer"("transfer_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."create_guest_player"("p_username" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."create_guest_player"("p_username" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_guest_player"("p_username" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."generate_tournament_bracket"("p_tournament_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."generate_tournament_bracket"("p_tournament_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."generate_tournament_bracket"("p_tournament_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_player_events"("player_id_input" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."get_player_events"("player_id_input" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_player_events"("player_id_input" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_player_events"("player_uuid" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."get_player_events"("player_uuid" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_player_events"("player_uuid" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_event_full"("event_uuid" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_event_full"("event_uuid" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_event_full"("event_uuid" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."release_game_ownership"("p_game_id" "uuid", "p_player_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."release_game_ownership"("p_game_id" "uuid", "p_player_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."release_game_ownership"("p_game_id" "uuid", "p_player_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."rls_auto_enable"() TO "anon";
GRANT ALL ON FUNCTION "public"."rls_auto_enable"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."rls_auto_enable"() TO "service_role";



GRANT ALL ON FUNCTION "public"."sync_tournament_match_to_matches"() TO "anon";
GRANT ALL ON FUNCTION "public"."sync_tournament_match_to_matches"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."sync_tournament_match_to_matches"() TO "service_role";


















GRANT ALL ON TABLE "public"."countries" TO "anon";
GRANT ALL ON TABLE "public"."countries" TO "authenticated";
GRANT ALL ON TABLE "public"."countries" TO "service_role";



GRANT ALL ON SEQUENCE "public"."countries_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."countries_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."countries_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."event_registrations" TO "anon";
GRANT ALL ON TABLE "public"."event_registrations" TO "authenticated";
GRANT ALL ON TABLE "public"."event_registrations" TO "service_role";



GRANT ALL ON TABLE "public"."events" TO "anon";
GRANT ALL ON TABLE "public"."events" TO "authenticated";
GRANT ALL ON TABLE "public"."events" TO "service_role";



GRANT ALL ON TABLE "public"."events_with_participant_count" TO "anon";
GRANT ALL ON TABLE "public"."events_with_participant_count" TO "authenticated";
GRANT ALL ON TABLE "public"."events_with_participant_count" TO "service_role";



GRANT ALL ON TABLE "public"."games" TO "anon";
GRANT ALL ON TABLE "public"."games" TO "authenticated";
GRANT ALL ON TABLE "public"."games" TO "service_role";



GRANT ALL ON TABLE "public"."matches" TO "anon";
GRANT ALL ON TABLE "public"."matches" TO "authenticated";
GRANT ALL ON TABLE "public"."matches" TO "service_role";



GRANT ALL ON SEQUENCE "public"."matches_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."matches_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."matches_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."ownership_transfer_requests" TO "anon";
GRANT ALL ON TABLE "public"."ownership_transfer_requests" TO "authenticated";
GRANT ALL ON TABLE "public"."ownership_transfer_requests" TO "service_role";



GRANT ALL ON TABLE "public"."players" TO "anon";
GRANT ALL ON TABLE "public"."players" TO "authenticated";
GRANT ALL ON TABLE "public"."players" TO "service_role";



GRANT ALL ON TABLE "public"."tournament_history" TO "anon";
GRANT ALL ON TABLE "public"."tournament_history" TO "authenticated";
GRANT ALL ON TABLE "public"."tournament_history" TO "service_role";



GRANT ALL ON TABLE "public"."tournament_matches" TO "anon";
GRANT ALL ON TABLE "public"."tournament_matches" TO "authenticated";
GRANT ALL ON TABLE "public"."tournament_matches" TO "service_role";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";


































CREATE OR REPLACE FUNCTION public.record_quick_match_v1(
    p1_id uuid,
    p2_id uuid,
    p1_new_elo int,
    p2_new_elo int,
    p1_won boolean,
    match_data jsonb
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- Päivitä Pelaaja 1 jos ei vieras
    IF p1_id IS NOT NULL THEN
        UPDATE public.players 
        SET elo = p1_new_elo,
            wins = CASE WHEN p1_won THEN wins + 1 ELSE wins END,
            losses = CASE WHEN NOT p1_won THEN losses + 1 ELSE losses END
        WHERE id = p1_id;
    END IF;

    -- Päivitä Pelaaja 2 jos ei vieras
    IF p2_id IS NOT NULL THEN
        UPDATE public.players 
        SET elo = p2_new_elo,
            wins = CASE WHEN NOT p1_won THEN wins + 1 ELSE wins END,
            losses = CASE WHEN p1_won THEN losses + 1 ELSE losses END
        WHERE id = p2_id;
    END IF;

    -- Lisää ottelu
    INSERT INTO public.matches (
        player1, player2, winner, 
        player1_score, player2_score, 
        tournament_id, tournament_name, 
        created_at
    ) VALUES (
        match_data->>'player1', match_data->>'player2', match_data->>'winner',
        (match_data->>'player1_score')::int, (match_data->>'player2_score')::int,
        (match_data->>'tournament_id')::uuid, match_data->>'tournament_name',
        NOW()
    );
END;
$$;
