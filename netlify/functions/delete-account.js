const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://ujxmmrsmdwrgcwatdhvx.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_hMb0ml4fl2A9GLqm28gemg_CAE5vY8t';

exports.handler = async function (event, context) {
    // CORS preflight
    if (event.httpMethod === 'OPTIONS') {
        return {
            statusCode: 204,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Headers': 'Authorization, Content-Type',
                'Access-Control-Allow-Methods': 'POST, OPTIONS'
            },
            body: ''
        };
    }

    if (event.httpMethod !== 'POST') {
        return {
            statusCode: 405,
            headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
            body: JSON.stringify({ error: 'Method Not Allowed' })
        };
    }

    // Extract Bearer token
    const authHeader = event.headers['authorization'] || event.headers['Authorization'] || '';
    const token = authHeader.replace(/^Bearer\s+/i, '');

    if (!token) {
        return {
            statusCode: 401,
            headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
            body: JSON.stringify({ error: 'Missing or invalid Authorization header' })
        };
    }

    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!serviceRoleKey) {
        console.error('SUPABASE_SERVICE_ROLE_KEY is not configured');
        return {
            statusCode: 500,
            headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
            body: JSON.stringify({ error: 'Server configuration error' })
        };
    }

    try {
        // 1. Verify the user's identity using their token
        const supabaseUser = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
            global: { headers: { Authorization: `Bearer ${token}` } }
        });

        const { data: { user }, error: authError } = await supabaseUser.auth.getUser();

        if (authError || !user) {
            console.error('Auth verification failed:', authError?.message);
            return {
                statusCode: 401,
                headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
                body: JSON.stringify({ error: 'Invalid or expired token' })
            };
        }

        const userId = user.id;
        console.log(`Deleting account for user: ${userId}`);

        // 2. Use Admin client for privileged operations
        const supabaseAdmin = createClient(SUPABASE_URL, serviceRoleKey, {
            auth: { autoRefreshToken: false, persistSession: false }
        });

        // 3. Delete the user's row from the 'players' table
        const { error: deletePlayerError } = await supabaseAdmin
            .from('players')
            .delete()
            .eq('id', userId);

        if (deletePlayerError) {
            console.error('Failed to delete player row:', deletePlayerError.message);
            return {
                statusCode: 500,
                headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
                body: JSON.stringify({ error: 'Failed to delete player data' })
            };
        }

        // 4. Delete the user from Supabase Auth
        const { error: deleteAuthError } = await supabaseAdmin.auth.admin.deleteUser(userId);

        if (deleteAuthError) {
            console.error('Failed to delete auth user:', deleteAuthError.message);
            return {
                statusCode: 500,
                headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
                body: JSON.stringify({ error: 'Failed to delete auth account' })
            };
        }

        console.log(`Successfully deleted account for user: ${userId}`);

        return {
            statusCode: 200,
            headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
            body: JSON.stringify({ success: true, message: 'Account deleted successfully' })
        };

    } catch (error) {
        console.error('Account deletion error:', error.message);
        return {
            statusCode: 500,
            headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
            body: JSON.stringify({ error: error.message || 'Failed to delete account' })
        };
    }
};
