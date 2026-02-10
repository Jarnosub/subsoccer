# 📅 Event & Tournament Architecture Plan

## Nykyinen Ongelma
- Event (tapahtuma) ja Tournament (turnaus) sekoittuvat
- Osallistujat rekisteröityvät suoraan eventtiin → ei tee järkeä
- Pelipöydät linkitetty eventtiin → kuuluvat turnauksiin

---

## ✅ Uusi Arkkitehtuuri

### Hierarkia
```
EVENT (Tapahtuma)
  └─ TOURNAMENT 1 (Turnaus)
       ├─ Pelipöytä (game_id)
       ├─ Osallistujat (max_participants)
       └─ Rankatut matsit
  └─ TOURNAMENT 2 (Turnaus)
       ├─ Pelipöytä
       ├─ Osallistujat
       └─ Rankatut matsit
```

### EVENT = Kehys
- **Tarkoitus**: Isompi tapahtuma joka kestää useamman päivän/tunnin
- **Esimerkkejä**: 
  - "Helsinki Championship Weekend 23-25 Jan"
  - "Pasila Weekly League"
  - "Friday Night Games"
- **Ei sisällä**:
  - ❌ Osallistujia (ei max_participants)
  - ❌ Pelipöytää (ei game_id)
  - ❌ Rekisteröitymistä
- **Sisältää**:
  - ✅ Nimi, kuvaus, päivämäärät
  - ✅ Sijainti (vapaamuotoinen teksti)
  - ✅ Kuva
  - ✅ Järjestäjä (organizer_id)

### TOURNAMENT = Varsinainen peli
- **Tarkoitus**: Yksittäinen rankattu turnaus
- **Linkitetty eventtiin**: tournament_history.event_id
- **Sisältää**:
  - ✅ Pelipöytä (game_id) - YKSI pöytä per turnaus
  - ✅ Osallistujat (max_participants)
  - ✅ Turnauksen aika (created_at)
  - ✅ Tulokset ja ranking (jo olemassa)
  - ✅ Event linkki (event_id) - OPTIONAL

**Yksinkertainen malli:**
- 1 tournament = 1 pelipöytä
- Event voi sisältää monta tournamenttia eri pöydillä
- Esim: Event "Helsinki Open" → Tournament "Pasila #1" + Tournament "Kallio #2"

---

## 🎯 Käyttötapaukset

### Case 1: Multi-day Championship
```
EVENT: "Helsinki Open Championship"
- Dates: 23-25 Jan 2026
- Location: "Helsinki City Centre"
- Description: "3-day subsoccer championship..."

TOURNAMENTS:
├─ Day 1 Morning Tournament (Pasila Table #1, max 8 players)
├─ Day 1 Afternoon Finals (Pasila Table #1, max 4 players)
├─ Day 2 Eliminations (Kallio Table #2, max 16 players)
└─ Day 3 Grand Finals (Pasila Table #1, max 8 players)
```

### Case 2: Weekly League
```
EVENT: "Pasila Weekly League - March"
- Dates: 1-31 Mar 2026
- Location: "Pasila Sports Center"

TOURNAMENTS (joka viikko):
├─ Week 1 Tournament (5 Mar, Table #1)
├─ Week 2 Tournament (12 Mar, Table #1)
├─ Week 3 Tournament (19 Mar, Table #1)
└─ Week 4 Finals (26 Mar, Table #1)
```

### Case 3: Quick Single Tournament
```
EVENT: null (ei tarvita eventtiä)

TOURNAMENT: "Friday Quick Game"
- Table: Kallio #2
- Date: 14 Feb 2026 18:00
- Max: 8 players
- event_id: null
```

---

## 📊 Database Changes Needed

### ✅ Existing Tables (PERFECT!)
```sql
-- events table: Eventit ilman game_id/max_participants
-- tournament_history: Jo sisältää event_id + game_id
-- event_registrations: Voidaan käyttää tournament registrationeille
--   (linkitetään sekä event_id että tournament_id kautta)
-- event_games: Ei tarvita (voidaan poistaa tai jättää)
```

### Frontend Changes

#### 1. Events Page
```javascript
// Event Card näyttää:
- Event name, dates, location, description, image
- "VIEW DETAILS" nappi
- EI näytä osallistujia

// Event Modal näyttää:
- Event info
- Lista turnauksista tässä eventissä (haetaan tournament_history.event_id)
- Järjestäjälle: "CREATE TOURNAMENT" nappi
- Muille: vain event info
```

#### 2. Tournament Creation (Uusi)
```javascript
// Kun järjestäjä klikkaa "CREATE TOURNAMENT":
showCreateTournamentForm(eventId) {
  // Lomake:
  - Tournament Name (optional, default: "Event Name - Tournament")
  - Game Table (dropdown) - PAKOLLINEN
  - Max Participants (default 8)
  - Start Time (default: now)
  - Link to Event (pre-filled jos kutsuttu event modalista)
  
  // Tallentaa tournament_history tauluun:
  - event_id = eventId
  - game_id = selected table
  - max_participants = selected
  - ... muut kentät
}
```

#### 3. Tournament Page (Nykyinen)
```javascript
// Lisätään:
- Event dropdown (optional) - linkitä turnaus eventtiin
- Jos event valittu: näytä event info tournamentissa
```

---

## 🚀 Implementation Steps

### Phase 1: Frontend Cleanup ✅ DONE
- [x] Poista game_id events-lomakkeesta
- [x] Poista max_participants events-lomakkeesta  
- [x] Poista event registration (registerForEvent, unregisterFromEvent)
- [x] Event modal: näytä vain info, ei participants
- [x] Event card: näytä vain event info

### Phase 2: Tournament Integration ✅ DONE
- [x] Hae eventissä olevat turnaukset (tournament_history WHERE event_id = ?)
- [x] Näytä tournament lista event modalissa (cards)
- [x] "CREATE TOURNAMENT" nappi järjestäjälle ✅
- [x] Create Tournament modal:
  - Tournament name (optional, default: event name)
  - Game table dropdown (YKSI pöytä)
  - Max participants (default: 8)
  - Tournament type (elimination/swiss/round_robin)
- [x] Save to tournament_history with event_id
- [x] Tournament registration buttons (REGISTER/UNREGISTER)
- [x] Database schema update (tournament_fields_update.sql)

### Phase 3: Tournament Page Update
- [ ] Lisää event dropdown tournament luomiseen
- [ ] Näytä event info jos tournament linkitetty

### Phase 4: Polish & Cleanup
- [ ] Tournament cards styling (show game table, participants, time)
- [ ] Registration status indicators
- [ ] "Tournament Full" logic
- [ ] Link Tournament Mode tab to run tournaments
- [ ] Optional: Poista event_games taulu (ei käytetä)
- [ ] Päivitä database dokumentaatio

---

## 💡 Tulevaisuus

### Mahdolliset lisäominaisuudet:
- Event-tason osallistuminen (ilman turnauspaikkaa) = "Interested" markings
- Event-chat tai kommentit
- Event-sarjat (tournament series tracking)
- Leaderboard per event (kaikki event-turnausten pisteet yhteensä)

---

## ❓ Questions to Resolve

1. **Poistetaanko event_registrations kokonaan?**
   - Vai säilytetään "interested in event" -ominaisuutta varten?
   
2. **Tarvitaanko event_games taulua?**
   - Voidaan hakea eventiin liittyvät pelipöydät tournament_history kautta
   - Todennäköisesti ei tarvita

3. **Tournament creation flow:**
   - Luodaanko turnaukset vain event modalista?
   - Vai voidaanko luoda turnaus normaalisti ja linkittää eventtiin jälkikäteen?
   - **Suositus**: Molemmat vaihtoehdot

---

## Summary

**Ydin-idea**: 
- Event = tapahtuman kehys (päivät, sijainti, markkinointi)
- Tournament = varsinainen peli jossa pelataan ja rankataan
- Pelaajat participoivat turnauksiin, ei eventteihin
- Event voi sisältää 0-N turnauksia
- Tournament voi olla event-linkitetty tai standalone
