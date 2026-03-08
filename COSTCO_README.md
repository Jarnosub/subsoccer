# Costco Retail Integration & QR Codes

Tähän tiedostoon on kerätty kaikki Costco-myyntipakkauksiin ja muihin vastaaviin retail-kampanjoihin liittyvät spesifit linkit, QR-logiikat ja mediat. 

Pitämällä nämä erillään varsinaisesta lähdekoodista ja käyttämällä omia ohjaussivuja, pystymme aina reagoimaan muutoksiin (esim. videoiden päivittämiseen) lennosta silloinkin, kun kymmeniätuhansia pakkauksia on jo painettu ja lähetetty asiakkaille.

## 1. Ohjevideo & "How to Play" (Costco-pakkaus)
Laatikon ulkokylkeen / ohjekirjaan painettava ohjevideon QR-koodi asennetaan osoittamaan tähän URL-osoitteeseen:

👉 **URL:** `https://subsoccer.pro/video.html`

Tämä sivu on täysin erillinen puhdas laskeutumissivu, joka:
- Näyttää virallisen Subsoccer "How to Play" -opastusvideon vertikaalisena Shorts-tyylisenä koko ruudun asettelulla.
- On täysin riisuttu kaikista muista linkeistä ja häiriötekijöistä ("Start playing" nappi yms. postettiin sekaannuksien estämiseksi).

**Videon vaihtaminen jälkikäteen:**
Jos video halutaan tulevaisuudessa vaihtaa uudempaan painosta (eli YouTube-URL muuttuu), riittää kun vaihdamme `video.html`-tiedoston koodiin riville 113 upotetun videon uuden YouTube ID:n (`Xbfkm2Ftejg`). Pakkausten tarrat toimivat silti edelleen!

> **Nykyinen YouTube URL:** `https://youtu.be/Xbfkm2Ftejg`

---

## 2. Instant Play (Pikapeli)
Pöytien läheisyyteen tai pakkaukseen kiinnitettävä skannattava QR-koodi itse digitaalisen pelitulostaulun käynnistämiseksi osoittaa suoraan Instant Play -aulaan:

👉 **URL:** `https://subsoccer.pro/instant-play.html`

**Aulan nykyinen logiikka (Vakioitu Apple-tyyliseksi):**
- Aula on täysin puhdas nollakitkan kokemus, jossa on vain "1 VS 1 MATCH - TAP TO START".
- Aulasta poistettiin "Host a Tournament" -ominaisuudet täydellisesti (Kaikilta käyttäjiltä, ei pelkästään Costcolta). Tämä estää pelaajia vahingossa eksymästä "Kirjaudu sisään" -seiniin ennen matseja.
- Ennen matsin alkua näytetään ruudulla viralliset säännöt (3 maalia voittaa), joka pakotetaan hyväksymään.
- *Huomio:* Enää ei tarvita erillisiä `?costco` URL-parametreja, sillä aula on vakioitu puhtaaksi kaikille käyttäjille!

## 3. Voittoruudun Upsell
Myynti ja ominaisuuksien tarjoaminen tapahtuu vasta matsin jälkeen:
1. **"NEW GAME GUESTS"**: Massiivinen punainen nappi rohkaisee jatkamaan pelaamista laitteella tilaa vaihtamatta.
2. **"CLAIM MY PRO CARD"**: Kultainen rekisteröitymispainike rohkaisee tilin luomiseen silloin kun pelaaja on jo täysin koukussa laitteeseen.


Tätä dokumenttia päivitetään aina, kun Costco-ohjeistukseen tai retail-laatikon logiikkaan tulee muutoksia.
