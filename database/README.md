# 📅 Subsoccer Events System - Database Setup

## Yleiskatsaus

Tämä kansio sisältää SQL-skriptit Subsoccer tapahtumakalenterin tietokantarakenteen luomiseen.

## 🗂️ Tiedostot

- `events_schema.sql` - Pääskripti: luo taulut, indeksit, RLS-policyt, views
- `events_update.sql` - **Päivitysskripti: jos olet jo ajanut events_schema.sql aiemmin**
- `storage_setup.sql` - Storage bucket setup -ohje event-kuville (UI-pohjainen)

## 🔄 Päivitys olemassa olevaan tietokantaan

Jos olet jo luonut events-taulun aiemmin ja haluat lisätä multi-table -tuen:
1. Aja `events_update.sql` SQL Editorissa
2. Tämä lisää: location/address/lat/lng -kentät, event_games junction table, päivitetyt views

## 🚀 Asennusohjeet

### Vaihe 1: Luo tietokantataulut

1. Avaa **Supabase Dashboard** → projekti `ujxmmrsmdwrgcwatdhvx`
2. Mene **SQL Editor** -välilehdelle
3. Klikkaa **New query**
4. Kopioi koko `events_schema.sql` sisältö editoriin
5. Klikkaa **RUN** (tai paina Ctrl/Cmd + Enter)
6. Tarkista että saat viestin: "Success. No rows returned"

### Vaihe 2: Luo Storage bucket (manuaalisesti)

1. Supabase Dashboard → **Storage**
2. Klikkaa **New bucket**
3. Täytä tiedot:
   - Bucket name: `event-images`
   - Public bucket: ✅ Kyllä
   - File size limit: `5242880` (5MB)
   - Allowed MIME types: `image/jpeg, image/png, image/webp`
4. Klikkaa **Create bucket**

### Vaihe 3: Aseta Storage policyt (valinnainen)

Storage policyt voidaan asettaa joko:

**Vaihtoehto A: SQL Editorissa**
- Kopioi `storage_setup.sql` sisältö
- Aja SQL Editorissa

**Vaihtoehto B: Dashboard UI:ssa (helpompi)**
- Storage → event-images → Policies
- Luo policyt käsin UI:n kautta

## 📊 Luodut taulut

### `events`
Tapahtumat (turnaukset, liigat, casual-pelit)
- event_name, start_datetime, **end_datetime** (useampi päiväiset eventit)
- game_id (valinnainen: jos on tietty pelipöytä)
- location (valinnainen: custom sijainti tekstinä)
- organizer_id (linkki pelaajaan)
- status, max_participants, description
- image_url (Supabase Storage)

**Huom:** Turnaukset voi linkittää eventtiin myöhemmin kun ne pelataan. Pelipöytä ei ole pakollinen.

### `event_registrations`
Tapahtumailmoittautumiset
- event_id, player_id
- status (registered/confirmed/cancelled)
- checked_in (boolean)

### `event_games`
Junction table (valinnainen käyttö tulevaisuudessa)
- event_id, game_id
- Voidaan käyttää myöhemmin jos halutaan linkittää useita pöytiä

### Päivitetyt taulut
- `tournament_history` + event_id (turnauksen voi linkittää eventtiin)
- `matches` + event_id (mätsit voi linkittää eventtiin)

### Views
- `events_with_participant_count` - Events + osallistujamäärät + location info
- `event_tables` - Listaa kaikki pöydät per event (jos käytetään)

## 🔍 Tietokannan tarkistus

Aja SQL Editorissa varmistaaksesi että kaikki toimi:

```sql
-- Tarkista taulut
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name IN ('events', 'event_registrations')
ORDER BY table_name;

-- Pitäisi palauttaa:
-- event_registrations
-- events
```

```sql
-- Tarkista RLS on päällä
SELECT tablename, rowsecurity 
FROM pg_tables 
WHERE schemaname = 'public' 
AND tablename IN ('events', 'event_registrations');

-- Pitäisi näyttää rowsecurity = true molemmille
```

```sql
-- Tarkista Storage bucket
SELECT * FROM storage.buckets WHERE id = 'event-images';

-- Pitäisi palauttaa rivi event-images bucketille
```

## 🎯 Seuraavat vaiheet

Kun tietokanta on valmis:

1. Frontend kehitys:
   - Events välilehti
   - Kalenterinäkymä
   - Create Event lomake
   - Registration system

2. Storage integration:
   - Image upload funktiot
   - Preview & crop
   - Delete old images

## 🔄 Rollback

Jos haluat poistaa kaikki muutokset:

```sql
-- VAROITUS: Poistaa kaikki event-datan!
DROP TABLE IF EXISTS public.event_registrations CASCADE;
DROP TABLE IF EXISTS public.events CASCADE;

-- Poista event_id sarakkeet
ALTER TABLE public.tournament_history DROP COLUMN IF EXISTS event_id;
ALTER TABLE public.matches DROP COLUMN IF EXISTS event_id;

-- Poista view
DROP VIEW IF EXISTS public.events_with_participant_count;

-- Poista funktiot
DROP FUNCTION IF EXISTS public.is_event_full(UUID);
DROP FUNCTION IF EXISTS public.get_player_events(UUID);
```

## 📝 Muistiinpanot

- RLS (Row Level Security) on päällä turvallisuuden vuoksi
- Public events ovat kaikkien nähtävissä
- Vain organizers voivat muokata omia tapahtumiaan
- Storage bucket on public → kuvat ovat julkisesti näkyvillä URL:n kautta
