# 🛡️ Varmuuskopiointiohjeet

Tämä projekti (`ujxmmrsmdwrgcwatdhvx`) on Supabasen ilmaisella tasolla, joten automaattisia varmuuskopioita ei ole. Tee varmuuskopio aina ennen suuria muutoksia.

## 1. Datan varmuuskopiointi (Table Editor)
1. Mene Supabase Dashboard -> Table Editor.
2. Valitse taulu (esim. `players` tai `games`).
3. Klikkaa **Export to CSV**.
*Tee tämä jokaiselle taululle, jossa on tärkeää dataa.*

## 2. Rakenteen ja asetusten varmuuskopiointi (SQL)
Säilytä aina uusin versio `database/master_fix.sql` tai vastaavasta tiedostosta. Jos teet muutoksia Dashboardin UI:n kautta (esim. lisäät sarakkeen), muista päivittää se myös SQL-tiedostoon.

Voit myös hakea nykyisen rakenteen SQL-muodossa:
1. Mene **Database** -> **Functions** tai **Tables**.
2. Supabase ei tarjoa suoraa "Dump"-nappia Dashboardilla, joten CLI on tähän paras.

## 3. Täydellinen varmuuskopio (Supabase CLI)
Tämä on varmin tapa tallentaa kaikki (taulut, RLS-oikeudet, näkymät).

**Komento:**
```bash
supabase db dump --project-ref ujxmmrsmdwrgcwatdhvx -f backup_pvm.sql
```

## 4. Ennen "Production Ready" -siirtoa
1. Luo uusi "Production" projekti Supabaseen.
2. Aja SQL-skriptit sinne.
3. Älä koske vanhaan "Development" projektiin ennen kuin uusi on todettu toimivaksi.
4. Jos mahdollista, käytä `db dev` ja `db push` työnkulkuja.