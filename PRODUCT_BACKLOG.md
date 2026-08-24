# 📋 Subsoccer Product Backlog (Käyttäjäpalautteista)

Tämä backlog kokoaa ja priorisoi käyttäjäpalautteesta (`public.feedback`) kerätyt kehitysehdotukset ja bugit selkeiksi, toteutusvalmiiksi kokonaisuuksiksi.

---

## 🚀 1. Quick Wins (Nopeat korjaukset — 15–30 min kpl)

Nämä ovat nopeita toteuttaa, mutta parantavat välittömästi käyttäjäkokemusta ja poistavat kitkaa.

| ID | Tehtävä | Tyyppi | Vaikutus | Vaiva | Tila |
|---|---|---|---|---|---|
| **QW-1** | **Automaattinen nimilogiikka Subsoccer Go:ssa**<br>Kirjautuneen käyttäjän nimi ja maa haetaan suoraan profiilista (`subsoccer_user`), jolloin tuloksen tallennus leaderboardille ei vaadi nimen uudelleenkirjoittamista. | Bug / UX | Korkea | 15 min | 🟡 Ready |
| **QW-2** | **Profiilikuvan välitön esikatselu**<br>Kun käyttäjä valitsee uuden profiilikuvan, kuva renderöidään heti käyttöliittymään esikatseltavaksi ennen "Save"-napin painamista. | Bug / UX | Keski | 20 min | 🟡 Ready |
| **QW-3** | **Käyttäjänimen merkkirajoituksen kasvattaminen**<br>Nostetaan nimikentän pituusrajoitusta ja skaalataan pitkät nimet sulavasti HUD- ja profiilinäkymissä. | Bug / UX | Keski | 15 min | 🟡 Ready |

---

## 🎯 2. Onboarding & Käyttäjien aktivointi (Conversion & Retention)

Tavoitteena konvertoida satunnaiset vieraspelaajat rekisteröityneiksi käyttäjiksi.

| ID | Tehtävä | Tyyppi | Vaikutus | Vaiva | Tila |
|---|---|---|---|---|---|
| **ONB-1** | **Profiilin luonti helpommin löydettäväksi**<br>Lisätään selkeä "Luo profiili" / "Kirjaudu" -painike suoraan päävalikon dropdowniin ja yläpalkkiin ensikertalaisille. | UX / Onboarding | Korkea | 30 min | 🟡 Ready |
| **ONB-2** | **Ensimmäisen pelin jälkeinen rekisteröitymis-prompt**<br>Kun uusi pelaaja pelaa pelin vieraana (Guest), pelin päättyessä näytetään houkutteleva prompti: *"Tallenna otteluhistoriasi ja tilastosi — Luo profiili 10 sekunnissa"*. | Growth / Retention | Erittäin korkea | 1 h | 🟡 Ready |

---

## 🏆 3. Yhteisö & Julkiset Turnaukset (Community & Virality)

Tavoitteena tuoda pelaajat yhteen fyysisille pöydille ja julkisiin tapahtumiin.

| ID | Tehtävä | Tyyppi | Vaikutus | Vaiva | Tila |
|---|---|---|---|---|---|
| **COM-1** | **Julkiset turnaukset & Tapahtumailmoitukset**<br>Mahdollisuus luoda julkinen turnaus tietylle lokaatiolle (esim. *"Perjantain viikkoturnaus @ Fat Tony's klo 18"*), joka näkyy kartalla/listassa ja johon muut pelaajat voivat ilmoittautua ennakkoon. | Feature | Erittäin korkea | 3–4 h | 💡 Suunniteltu |
| **COM-2** | **Kaverikutsu rekisteröityneille pelaajille**<br>Mahdollisuus haastaa alustaan rekisteröitynyt kaveri suoraan profiilihaun tai käyttäjänimen kautta (push-ilmoitus / linkki). | Feature | Korkea | 2–3 h | 💡 Suunniteltu |

---

## 💼 4. Kaupallistaminen & Pöytien omistajuus (Monetization & Hardware)

Tavoitteena yhdistää fyysiset Subsoccer-pöydät digitaaliseen profiiliin ja luoda lisämyyntiä.

| ID | Tehtävä | Tyyppi | Vaikutus | Vaiva | Tila |
|---|---|---|---|---|---|
| **BIZ-1** | **Oman pöydän rekisteröinti profiiliin**<br>Käyttäjä voi liittää ostamansa pöydän (Subsoccer 3, Subsoccer 7, Custom jne.) profiiliinsa. Profiilissa näkyy "Owner"-badge ja personoidut tarjoukset (lisävarusteet, uudet verkot, pallot, custom-tuolit). | Business / Feature | Erittäin korkea | 2 h | 💡 Suunniteltu |
| **BIZ-2** | **QR-koodi & Pöydän tunnistus pelin alussa**<br>Jos peli aloitetaan ilman virallista QR-koodia, peli kysyy: *"Pelaatko virallisella Subsoccer-pöydällä? Skannaa QR-koodi tai rekisteröi pöytä"* tai *"Pelaa ilman virallista pöytää"*. Lisää QR-skannausten määrää ja pöytien rekisteröintejä. | Growth / B2B | Korkea | 1.5 h | 💡 Suunniteltu |
