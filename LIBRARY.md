# SUBSOCCER GO - DEVELOPMENT LIBRARY & ARCHITECTURE

Tämä dokumentti toimii kehityskirjastona Subsoccer GO -alustan ekosysteemiin tehdyistä custom-logiikoista, laiteintegraatioista (IoT) ja erikoisominaisuuksista. Tämän avulla kaikki "taikuus" pysyy tallessa ja helposti monistettavissa tuotantoon.

---

## 1. INSTANT-PLAY (Mukautuva Ydinmoottori)
`instant-play.html` on rakennettu "kameleontiksi". Sama peruskoodi muuttuu täysin eri sovellukseksi pelkkien URL-parametrien avulla. Tämä mahdollistaa kymmenien eri asiakas- ja laitteistokenaarioiden pyörittämisen yhdestä tiedostosta.

**Käytössä olevat URL-konfiguraatiot:**

| Käyttötapaus | URL Esimerkki | Kuvaus |
| :--- | :--- | :--- |
| **Jättinäyttö (Host)** | `?mode=display&game_id=DEMO` | Tekee selaimesta passiivisen pistetaulun. Piilottaa kaikki napit ja maksumuurit. Jättinäyttö odottaa 0-0 "herätyssignaalia" ja kytkee sen kuultuaan pöydän fyysiset sähköt päälle. Se myös pystyttää 3 minuutin vartiointikellon hylättyjen pelien varalle. |
| **Sähköjen Reititin** | `?mode=display&game_id=DEMO&shelly=192.168.1.22` | Käytetään *vain kerran* tapahtumapaikalla. Tallentaa TV-selaimen laitemuistiin (localStorage) fyysisen Shelly-älypistorasian IP-osoitteen. |
| **Pelaajan Puhelin (Arcade)**| `?game_id=DEMO` | Normaali ohjain tila. Tämä vaatii pelaajalta (2.00€ Apple Pay) maksun. Kun maksu menee läpi, ohjain lähettää herätyksen TV:lle, joka sytyttää sähköt. "New Game" -nappi palauttaa aina takaisin maksumuuriin. |
| **B2B / Costco Kioski** | `?partner=costco&game_id=C-01&win_score=1` | Vähittäiskauppojen erikoistila. Vaihtaa käyttöliittymän kaksikieliseksi (Ranska/Englanti), ohittaa maksumuurit kokonaan ja asettaa "Sudden Death" (1 maalista poikki) -tilan jonojen lyhentämiseksi. |
| **Rento Tapahtumatila** | `?game_id=A&mode=casual` | Ottaa pois kaikki "Luo Pro Card" -mainokset ja pelkistää voittoruudun nopeaan hauskanpitoon ilman rekisteröitymispakkoa. Täydellinen messuille. |

---

## 2. LAITTEISTO (Shelly Plug S -IoT-Integraatio)
Pöydän fyysiset sähköt (valot ja tuulettimet) kytkeytyvät autonomisesti maksumuurin ja pelilogiikan ohjaamana.

**Toimintalogiikka:**
1. Jättinäyttö (TV) on yhdistetty samaan lokaaliin WiFi-verkkoon fyysisen Shelly-pistorasian kanssa.
2. Käyttäjä skannaa pöydän QR-koodin puhelimellaan omassa 4G/5G-verkossaan ja suorittaa maksun.
3. Puhelin lähettää Supabase-palvelimelle pilveen pienen `0-0` pingin.
4. Jättinäyttö nappaa pingin sekunnin murto-osassa, pudottaa QR-koodin pois ruudulta ja lähettää sisäverkossa paikallisen verkkokutsun (`fetch('http://192.168.1.22/relay/0?turn=on')`) Shellylle.
5. Pöydän sähköt syttyvät ja peli alkaa.
6. Pelin päätyttyä Jättinäyttö odottaa 12 sekuntia, pudottaa voittoruudun, nollaa taulunsa, lähettää `turn=off` -käskyn Shellylle ja palaa päivystämään QR-koodin kera.

---

## 3. MODERAATTORIN TYÖKALUT
Moderaattorin työkalut on koottu Pääsovellukseen (`index.html`) "Moderator Tools" -osioon, jotta operointi on kootusti yhdessä paikassa.

*   **QR EPS Vektori-Generaattori:** (`qr-batch-exporter.html`) Asennettiin moderaattorin paneeliin. Generoi satoja painovalmiita Adobe EPS -vektoritiedostoja kertaheitolla .zip kansioon, "SN: GER-SUB-X" sarjanumerojen kera. Täydellinen teippaajille ja tehtaalle.
*   **The Control Room:** (`control-room.html`) Visuaalinen ja auditiivinen "ohjaamo" turnauksille, joka striimaa WebRTC-datakanavilla otteluiden tulokset livenä 3D-malleihin tai OBS Studioon.
*   **Analytiikka:** Seuranta, joka pystyy lajittelemaan pelaajat, keräämään liidejä ja exporttaamaan CSV-tiedostoja partnerien / omistajien raportointia varten.

---

## 4. KÄYTTÖLIITTYMÄ / "THE FORGE" DESIGN
Kaikki sovellukset (`online-game`, `instant-play`, `single-game`) on yhtenäistetty näyttäväksi e-sports kokemukseksi:
*   Tumma Teema (The Forge): Tyylikäs `Deep Black #111` yhdistettynä Subsoccer Punaiseen `#E30613` ja kultaisiin korostuksiin `#D4AF37`.
*   Ammattimaiset Mikro-animaatiot: Pyörivät Pro Cardit, laser-efektit voittoruuduissa sekä viiveellä saapuvat visuaaliset checkmarkit maksumuureissa.
*   Unified Victory Screen: 3D-Tyyppinen, globaali voittoruutu lasersäteineen on kopioitu alkuperäisestä sovelluksesta jokaiseen pelitilaan.

---
*Created: Maaliskuu 2026*
*Tämä on virallinen tietokanta alustan mukautetusta logiikasta ja integraatioista.*
