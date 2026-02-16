# ️ Kehitys- ja Varmuuskopiointiohjeet (Supabase CLI)

Tämä projekti (`ujxmmrsmdwrgcwatdhvx`) käyttää ammattimaista työnkulkua. Tietokantaa hallitaan koodina (Migrations), ei manuaalisesti Dashboardin kautta.

## 🚀 1. Supabase CLI:n käyttöönotto (Tärkein)

Supabase CLI mahdollistaa tietokannan rakenteen hakemisen paikalliseksi koodiksi.

### Asennus (Mac):
```bash
brew install supabase/tap/supabase
```

### Alustus:
1. Kirjaudu sisään: `supabase login`
2. Alusta projekti: `supabase init`
3. Linkitä live-projektiin: `supabase link --project-ref ujxmmrsmdwrgcwatdhvx`

### Rakenteen haku (Schema Pull):
Tämä komento hakee live-tietokannan rakenteen ja luo siitä migraatiotiedoston:
```bash
supabase db pull
```

## 4. Ennen "Production Ready" -siirtoa
1. Luo uusi "Production" projekti Supabaseen.
2. Aja SQL-skriptit sinne.
3. Älä koske vanhaan "Development" projektiin ennen kuin uusi on todettu toimivaksi.
4. Jos mahdollista, käytä `db dev` ja `db push` työnkulkuja.