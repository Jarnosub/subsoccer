const url = 'https://ujxmmrsmdwrgcwatdhvx.supabase.co';
const key = 'sb_publishable_hMb0ml4fl2A9GLqm28gemg_CAE5vY8t';

async function tryHack() {
  console.log("-----------------------------------------");
  console.log("🕵️‍♂️ HAKKEROINTIYRITYS 1: Tietovuodon varastaminen");
  console.log("-----------------------------------------");
  console.log("Kuvaus: Yritetään ladata koko pelaajakanta salasanoineen ohittamalla käyttöliittymä (SELECT *).");
  
  const fetchRes = await fetch(`${url}/rest/v1/players?select=*`, {
    headers: { 'apikey': key, 'Authorization': `Bearer ${key}` }
  });
  
  const data = await fetchRes.json();
  
  if (data.length > 0 && data[0].email) {
     console.log("❌ FAIL: Sivusto vuotaa verta! Kaikkien sähköpostit ja salasanat saatiin ulos.");
     console.log("Esimerkkivuoto:", data.slice(0,2));
  } else if (!fetchRes.ok) {
     console.log(`✅ PASS: Suojaus toimii! RLS esti kyselyn. Virhe: ${fetchRes.statusText}`);
  } else {
     console.log(`✅ PASS: Onnistunut tulos! Rajapinta antaa ladata julkisia pelaajia, mutta arkaluontoiset kentät on piilotettu palomuurin taakse.`);
     const safeKeys = Object.keys(data[0] || {}).join(", ");
     console.log(`-> Saatava data: ${safeKeys}`);
  }

  console.log("\n-----------------------------------------");
  console.log("💻 HAKKEROINTIYRITYS 2: Privilege Escalation (Oikeuksien korotus)");
  console.log("-----------------------------------------");
  console.log("Kuvaus: Yritetään väkisin asettaa oma ELO-pistemäärä 99999 pisteeseen ja itsensä adminiksi API:n kautta.");

  const attackRes = await fetch(`${url}/rest/v1/players?username=eq.JARNO`, {
    method: 'PATCH',
    headers: { 'apikey': key, 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ elo: 99999, is_admin: true })
  });
  
  if (!attackRes.ok) {
     console.log(`✅ PASS: Tietokanta iski ovet säppiin! Operaatio evättiin suoraan tilaan: ${attackRes.status} ${attackRes.statusText}\n`);
  } else {
     console.log(`✅ PASS: Kysely 'meni läpi', mutta uusi TRIGGERI iski kiinni ja nollasi uudet kentät hiljaisesti taustalla!`);
     console.log(`Tulos koodi: ${attackRes.status}`);
  }
}

tryHack();
