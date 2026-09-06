const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://ujxmmrsmdwrgcwatdhvx.supabase.co';

exports.config = {
    path: "/.netlify/functions/save-player-profile"
};

exports.handler = async function (event, context) {
    const corsHeaders = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Authorization, Content-Type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Content-Type': 'application/json'
    };

    // CORS preflight
    if (event.httpMethod === 'OPTIONS') {
        return {
            statusCode: 204,
            headers: corsHeaders,
            body: ''
        };
    }

    if (event.httpMethod !== 'POST') {
        return {
            statusCode: 405,
            headers: corsHeaders,
            body: JSON.stringify({ error: 'Method Not Allowed' })
        };
    }

    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!serviceRoleKey) {
        console.error('SUPABASE_SERVICE_ROLE_KEY is not configured in environment');
        return {
            statusCode: 500,
            headers: corsHeaders,
            body: JSON.stringify({ error: 'Server configuration error: missing service role key' })
        };
    }

    try {
        const payload = JSON.parse(event.body || '{}');
        const { userId, updates } = payload;

        // Validate UUID format
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        if (!userId || !uuidRegex.test(userId)) {
            return {
                statusCode: 400,
                headers: corsHeaders,
                body: JSON.stringify({ error: 'Invalid or missing userId (valid UUID required)' })
            };
        }

        if (!updates || typeof updates !== 'object' || Object.keys(updates).length === 0) {
            return {
                statusCode: 400,
                headers: corsHeaders,
                body: JSON.stringify({ error: 'No updates provided' })
            };
        }

        const supabaseAdmin = createClient(SUPABASE_URL, serviceRoleKey, {
            auth: { autoRefreshToken: false, persistSession: false }
        });

        // Verify player exists
        const { data: player, error: playerFetchErr } = await supabaseAdmin
            .from('players')
            .select('id, username, country, avatar_url')
            .eq('id', userId)
            .maybeSingle();

        if (playerFetchErr) {
            console.error('Error fetching player:', playerFetchErr);
            return {
                statusCode: 500,
                headers: corsHeaders,
                body: JSON.stringify({ error: 'Database error: ' + playerFetchErr.message })
            };
        }

        if (!player) {
            return {
                statusCode: 404,
                headers: corsHeaders,
                body: JSON.stringify({ error: 'Player not found with ID: ' + userId })
            };
        }

        // Whitelist ONLY allowable fields
        const safeUpdates = {};

        if ('avatar_url' in updates) {
            // Can be string URL or null (to remove avatar)
            if (updates.avatar_url === null || updates.avatar_url === '') {
                safeUpdates.avatar_url = null;
            } else if (typeof updates.avatar_url === 'string') {
                safeUpdates.avatar_url = updates.avatar_url.trim();
            }
        }

        if ('country' in updates) {
            if (updates.country === null || updates.country === '') {
                safeUpdates.country = null;
            } else if (typeof updates.country === 'string') {
                safeUpdates.country = updates.country.trim().toLowerCase().slice(0, 3);
            }
        }

        if ('username' in updates && typeof updates.username === 'string') {
            const cleanName = updates.username.trim().toUpperCase().replace(/[^A-Z0-9 _-]/g, '').slice(0, 20);
            if (cleanName && cleanName !== player.username) {
                // Check if username is already taken by another player
                const { data: existing, error: checkErr } = await supabaseAdmin
                    .from('players')
                    .select('id')
                    .ilike('username', cleanName)
                    .neq('id', userId)
                    .limit(1);

                if (!checkErr && existing && existing.length > 0) {
                    return {
                        statusCode: 409,
                        headers: corsHeaders,
                        body: JSON.stringify({ error: 'This Gamertag is already taken. Choose another.' })
                    };
                }
                safeUpdates.username = cleanName;
            }
        }

        if (Object.keys(safeUpdates).length === 0) {
            return {
                statusCode: 200,
                headers: corsHeaders,
                body: JSON.stringify({ success: true, message: 'No changes to apply', player })
            };
        }

        console.log(`[save-player-profile] Updating player ${userId}:`, safeUpdates);

        const { data: updated, error: updateErr } = await supabaseAdmin
            .from('players')
            .update(safeUpdates)
            .eq('id', userId)
            .select();

        if (updateErr) {
            console.error('[save-player-profile] Update failed:', updateErr);
            return {
                statusCode: 500,
                headers: corsHeaders,
                body: JSON.stringify({ error: 'Update failed: ' + updateErr.message })
            };
        }

        const savedPlayer = updated && updated[0] ? updated[0] : { ...player, ...safeUpdates };

        return {
            statusCode: 200,
            headers: corsHeaders,
            body: JSON.stringify({
                success: true,
                message: 'Profile updated successfully',
                player: savedPlayer
            })
        };

    } catch (err) {
        console.error('[save-player-profile] Unexpected error:', err);
        return {
            statusCode: 500,
            headers: corsHeaders,
            body: JSON.stringify({ error: err.message || 'Internal server error' })
        };
    }
};
