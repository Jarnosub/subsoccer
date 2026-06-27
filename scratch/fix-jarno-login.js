#!/usr/bin/env node
/**
 * Admin: Migrate legacy "Jarno" player to Supabase Auth
 * 
 * Usage:
 *   node scratch/fix-jarno-login.js <SERVICE_ROLE_KEY> <EMAIL> <NEW_PASSWORD>
 * 
 * Get service_role key from: Supabase Dashboard → Settings → API → service_role (secret)
 */

const SUPABASE_URL = 'https://ujxmmrsmdwrgcwatdhvx.supabase.co';
const USERNAME = 'Jarno';

async function main() {
    const [,, serviceRoleKey, email, newPassword] = process.argv;

    if (!serviceRoleKey || !email || !newPassword) {
        console.error('\n❌ Usage: node scratch/fix-jarno-login.js <SERVICE_ROLE_KEY> <EMAIL> <NEW_PASSWORD>\n');
        console.error('  SERVICE_ROLE_KEY  → Supabase Dashboard → Settings → API → service_role (secret)');
        console.error('  EMAIL             → Sähköpostiosoite tilille (esim. jarno@subsoccer.com)');
        console.error('  NEW_PASSWORD      → Uusi salasana\n');
        process.exit(1);
    }

    const headers = {
        'apikey': serviceRoleKey,
        'Authorization': `Bearer ${serviceRoleKey}`,
        'Content-Type': 'application/json'
    };

    // 1. Find the player record
    console.log(`\n🔍 Etsitään pelaaja "${USERNAME}"...`);
    const findRes = await fetch(
        `${SUPABASE_URL}/rest/v1/players?username=ilike.${USERNAME}&select=id,username,email,is_admin`,
        { headers }
    );
    const players = await findRes.json();

    if (!players || players.length === 0) {
        console.error('❌ Pelaajaa ei löytynyt!');
        process.exit(1);
    }

    const player = players[0];
    console.log(`✅ Löytyi: id=${player.id}, username=${player.username}, email=${player.email || '(tyhjä)'}, admin=${player.is_admin}`);

    // 2. Check if Auth user already exists for this email
    console.log(`\n🔍 Tarkistetaan onko Auth-käyttäjä olemassa emaililla ${email}...`);
    const listRes = await fetch(
        `${SUPABASE_URL}/auth/v1/admin/users?page=1&per_page=50`,
        { headers }
    );
    const authUsers = await listRes.json();
    const existingAuth = authUsers.users?.find(u => u.email === email);

    let authUserId;

    if (existingAuth) {
        console.log(`⚠️  Auth-käyttäjä löytyi: ${existingAuth.id}`);
        
        // Update password
        console.log(`🔑 Päivitetään salasana...`);
        const updateRes = await fetch(
            `${SUPABASE_URL}/auth/v1/admin/users/${existingAuth.id}`,
            {
                method: 'PUT',
                headers,
                body: JSON.stringify({ password: newPassword, email_confirm: true })
            }
        );
        if (!updateRes.ok) {
            console.error('❌ Salasanan päivitys epäonnistui:', await updateRes.text());
            process.exit(1);
        }
        authUserId = existingAuth.id;
        console.log(`✅ Salasana päivitetty!`);
    } else {
        // Create new Auth user
        console.log(`📝 Luodaan uusi Auth-käyttäjä...`);
        const createRes = await fetch(
            `${SUPABASE_URL}/auth/v1/admin/users`,
            {
                method: 'POST',
                headers,
                body: JSON.stringify({
                    email: email,
                    password: newPassword,
                    email_confirm: true,
                    user_metadata: { username: USERNAME }
                })
            }
        );
        const newUser = await createRes.json();
        if (!createRes.ok) {
            console.error('❌ Auth-käyttäjän luonti epäonnistui:', JSON.stringify(newUser));
            process.exit(1);
        }
        authUserId = newUser.id;
        console.log(`✅ Auth-käyttäjä luotu: ${authUserId}`);
    }

    // 3. Update players table: set email and update id to Auth UUID
    console.log(`\n🔗 Linkitetään players-taulun rivi Auth-käyttäjään...`);
    const updatePlayerRes = await fetch(
        `${SUPABASE_URL}/rest/v1/players?id=eq.${player.id}`,
        {
            method: 'PATCH',
            headers: { ...headers, 'Prefer': 'return=minimal' },
            body: JSON.stringify({ 
                email: email,
                id: authUserId
            })
        }
    );

    if (!updatePlayerRes.ok) {
        const errText = await updatePlayerRes.text();
        console.warn(`⚠️  ID-päivitys epäonnistui (${errText}), yritetään pelkkä email...`);
        const emailOnlyRes = await fetch(
            `${SUPABASE_URL}/rest/v1/players?id=eq.${player.id}`,
            {
                method: 'PATCH',
                headers: { ...headers, 'Prefer': 'return=minimal' },
                body: JSON.stringify({ email: email })
            }
        );
        if (!emailOnlyRes.ok) {
            console.error('❌ Email-päivitys epäonnistui:', await emailOnlyRes.text());
        } else {
            console.log('✅ Email päivitetty (ID:tä ei muutettu)');
        }
    } else {
        console.log(`✅ Players-taulu päivitetty: id=${authUserId}, email=${email}`);
    }

    console.log(`\n${'='.repeat(50)}`);
    console.log(`✅ VALMIS! Kirjaudu sisään:`);
    console.log(`   Email: ${email}`);
    console.log(`   Salasana: ${newPassword}`);
    console.log(`   TAI käyttäjänimi: ${USERNAME} (vaatii auth.js-korjauksen)`);
    console.log(`${'='.repeat(50)}\n`);
}

main().catch(err => {
    console.error('💥 Virhe:', err);
    process.exit(1);
});
