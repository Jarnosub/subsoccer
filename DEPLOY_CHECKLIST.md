# 🧪 Subsoccer Go — Pre-Production Testing Protocol

> **Tämä tarkistuslista käydään läpi AINA ennen staging → main mergeä.**  
> Testaa staging-ympäristössä: https://staging--subsoccer-pro-live.netlify.app

---

## 📋 Pikakatsaus (TL;DR)

| # | Testi | Kesto | Kriittisyys |
|---|-------|-------|-------------|
| 1 | Kirjautuminen | 1 min | 🔴 |
| 2 | Quick Match (ottelu) | 2 min | 🔴 |
| 3 | ELO-pisteet päivittyvät | 1 min | 🔴 |
| 4 | Turnaus (luonti + pelaaminen) | 3 min | 🔴 |
| 5 | Leaderboard | 30 sek | 🟠 |
| 6 | Events (tapahtuman luonti) | 2 min | 🟠 |
| 7 | Live View (TV-näkymä) | 1 min | 🟠 |
| 8 | Profiili & asetukset | 1 min | 🟡 |
| 9 | Mobiili-responsiivisuus | 1 min | 🟡 |
| 10 | Konsoli-virheet | 30 sek | 🔴 |

**Minimi ennen tuotantoa:** Testit 1-4 ja 10 (noin 7 min).  
**Täysi testaus ennen isoja tapahtumia:** Kaikki 10 testiä (noin 13 min).

---

## 🔴 KRIITTISET TESTIT

### 1. Kirjautuminen
```
□ Avaa staging-URL
□ Kirjaudu olemassaolevalla käyttäjällä (username + salasana)
□ Tarkista: profiilisivu latautuu, username näkyy headerissa
□ Kirjaudu ulos
□ Kirjaudu Google-kirjautumisella (jos käytössä)
□ Testaa vieras-kirjautuminen (Guest)
```
**FAIL-kriteerit:** Kirjautuminen ei onnistu, sivu jää tyhjäksi, konsoli näyttää auth-virheitä.

---

### 2. Quick Match (ottelun tallennus)
```
□ Avaa Quick Match -näkymä
□ Hae pelaaja 1 nimellä → valitse
□ Hae pelaaja 2 nimellä → valitse
□ Paina "START MATCH"
□ Valitse voittaja (esim. Player 1 voittaa 5-3)
□ Tarkista: "Match recorded" -ilmoitus näkyy
□ Tarkista: ELO-muutos näkyy (esim. "+12")
□ Tarkista: Tuplaklikkaustesto — paina voittajaa nopeasti 2x → vain 1 ottelu tallentuu
```
**FAIL-kriteerit:** Ottelu ei tallennu, loading jää pyörimään, tuplaottelu tallentuu.

---

### 3. ELO-pisteet
```
□ Ottelun jälkeen: avaa voittajan profiili
□ Tarkista: ELO-luku on muuttunut (kasvanut voittajalla)
□ Tarkista: Match history näyttää uuden ottelun
□ Tarkista: Häviäjän ELO on laskenut
```
**FAIL-kriteerit:** ELO ei muutu, match history tyhjä, pisteet menevät väärinpäin.

---

### 4. Turnaus (tärkein tapahtumia varten)
```
□ Avaa "Tournaments" tai luo uusi turnaus Events-sivulta
□ Lisää vähintään 4 pelaajaa
□ Generoi bracket
□ Pelaa ensimmäinen ottelu → valitse voittaja
□ Tarkista: bracket päivittyy oikein (voittaja siirtyy seuraavalle kierrokselle)
□ Pelaa kaikki ottelut loppuun
□ Paina "FINISH TOURNAMENT"
□ Tarkista: voittaja, 2. sija ja 3. sija näkyvät oikein
□ Tarkista: ELO-pisteet päivittyvät kaikille pelaajille
```
**FAIL-kriteerit:** Bracket ei generoidu, ottelut eivät tallennu, turnaus ei mene "completed"-tilaan, ELO:t eivät päivity.

---

### 10. Konsoli-virheet (AINA viimeiseksi)
```
□ Avaa selaimen DevTools → Console (F12 tai Cmd+Option+I)
□ Tarkista: EI punaisia virheitä (punaiset = blokkaavia)
□ Keltaiset varoitukset OK (kunhan eivät ole kriittisiä)
□ Erityisesti tarkista:
  - Ei "Failed to fetch" -virheitä
  - Ei "RLS policy" -virheitä  
  - Ei "undefined is not a function" -virheitä
```

---

## 🟠 KORKEA PRIORITEETTI

### 5. Leaderboard
```
□ Avaa Leaderboard-näkymä
□ Tarkista: pelaajat näkyvät ELO-järjestyksessä
□ Tarkista: äskettäinen ottelutulos näkyy oikeassa järjestyksessä
□ Filtterit toimivat (jos käytössä)
```

---

### 6. Events (tapahtumat)
```
□ Luo uusi tapahtuma (admin/moderaattori-oikeuksilla)
□ Lisää turnaus tapahtumaan
□ Testaa ilmoittautuminen pelaajana
□ Testaa tuplailmoittautumisen esto → "Already registered!" -viesti
□ Avaa turnauksen bracket
□ Tarkista: "Start tournament?" -vahvistus ilmestyy
```

---

### 7. Live View (TV-näkymä)
```
□ Avaa tapahtuman Live-linkki (?live=xxx)
□ Tarkista: koko näytön live-näkymä latautuu
□ Tarkista: turnauksen tiedot, bracket ja tulokset näkyvät
□ Tarkista: auto-refresh toimii (näkymä päivittyy 30 sekunnin välein)
□ Sulje live-näkymä → normaali sovellus palautuu
```

---

## 🟡 KESKITASO

### 8. Profiili & asetukset
```
□ Avaa oma profiilisivu
□ Tarkista: avatar, ELO, voitot/häviöt näkyvät
□ Vaihda kieli (FI/EN/SV/DE/ES) → teksti vaihtuu
□ Avaa match history → viimeisimmät ottelut näkyvät
```

---

### 9. Mobiili-responsiivisuus
```
□ Avaa staging-URL puhelimella (tai DevTools → mobiili-emulaatio)
□ Tarkista: navigaatio toimii (tab-palkit alhaalla)
□ Tarkista: Quick Match -lomake mahtuu ruutuun
□ Tarkista: modaalit (turnaus-bracket, pelaaja-kortti) aukeavat oikein
□ Tarkista: ei vaakasuuntaista scrollausta
```

---

## 🚀 Deploy-prosessi (kun testit OK)

```bash
# 1. Tee backup-tagi
git tag pre-merge-$(date +%Y-%m-%d) && git push origin --tags

# 2. Merge staging → main
git checkout main && git pull origin main
git merge staging --no-edit

# 3. Push tuotantoon
git push origin main

# 4. Odota Netlify-build (~1-2 min)
# 5. Tarkista tuotanto: https://subsoccer.pro
# 6. Avaa konsoli → ei virheitä
```

---

## ⚠️ Rollback (jos jotain menee pieleen)

```bash
git checkout main
git reset --hard pre-merge-$(date +%Y-%m-%d)
git push --force origin main
```

---

## 📝 Testauslokin pohja

Kopioi ja täytä ennen jokaista deployta:

```
Päivämäärä: ____
Testaaja: ____
Staging URL: https://staging--subsoccer-pro-live.netlify.app
Selain: ____

[x/□] 1. Kirjautuminen
[x/□] 2. Quick Match  
[x/□] 3. ELO-pisteet
[x/□] 4. Turnaus
[x/□] 5. Leaderboard
[x/□] 6. Events
[x/□] 7. Live View
[x/□] 8. Profiili
[x/□] 9. Mobiili
[x/□] 10. Konsoli-virheet

Huomiot: ____
Tulos: GO / NO-GO
```
