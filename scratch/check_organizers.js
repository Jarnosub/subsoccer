const { createClient } = require('@supabase/supabase-js');

const SUPA_URL = 'https://ujxmmrsmdwrgcwatdhvx.supabase.co';
const SUPA_KEY = 'sb_publishable_hMb0ml4fl2A9GLqm28gemg_CAE5vY8t';
const supabase = createClient(SUPA_URL, SUPA_KEY);

async function checkOrganizers() {
    try {
        const { data, error } = await supabase
            .from('tournament_history')
            .select('organizer_id')
            .not('organizer_id', 'is', null);

        if (error) {
            console.error('Error fetching tournament history:', error);
            return;
        }

        console.log('Total tournaments with organizer:', data.length);

        const counts = {};
        data.forEach(row => {
            counts[row.organizer_id] = (counts[row.organizer_id] || 0) + 1;
        });

        const sortedIds = Object.keys(counts).sort((a, b) => counts[b] - counts[a]);

        if (sortedIds.length > 0) {
            const { data: players, error: playersError } = await supabase
                .from('players')
                .select('id, username')
                .in('id', sortedIds);

            if (playersError) {
                console.error('Error fetching player names:', playersError);
                return;
            }

            console.log('Top Organizers:');
            sortedIds.forEach(id => {
                const player = players.find(p => p.id === id);
                if (player) {
                    console.log(`- ${player.username}: ${counts[id]} tournaments`);
                } else {
                    console.log(`- Unknown player (${id}): ${counts[id]} tournaments`);
                }
            });
        } else {
            console.log('No registered organizers found.');
        }
    } catch (e) {
        console.error('Unexpected error:', e);
    }
}

checkOrganizers();
