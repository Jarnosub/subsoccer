const { createClient } = require('@supabase/supabase-js');
const sb = createClient(
  'https://ujxmmrsmdwrgcwatdhvx.supabase.co',
  'sb_publishable_hMb0ml4fl2A9GLqm28gemg_CAE5vY8t'
);

async function check() {
  // All public_tracking sorted by client_time, with browser_lang
  const { data: all } = await sb
    .from('public_tracking')
    .select('client_time, event_type, game_code, source_partner, browser_lang, location, user_agent')
    .order('client_time', { ascending: true })
    .limit(200);

  console.log('PUBLIC_TRACKING - rivejä:', all?.length);

  // First entry overall
  console.log('\nENSIMMÄINEN TAPAHTUMA:', all?.[0]?.client_time, '|', all?.[0]?.event_type, '|', all?.[0]?.browser_lang);

  // Find unique browser languages
  const langs = [...new Set(all?.map(r => r.browser_lang).filter(Boolean))];
  console.log('\nKIELET:', langs);

  // First non-Finnish language
  const intl = all?.find(r => r.browser_lang && !r.browser_lang.startsWith('fi'));
  console.log('\nENSIMMÄINEN EI-SUOMENKIELINEN:', intl?.client_time, '|', intl?.browser_lang, '|', intl?.game_code, '|', intl?.event_type);

  // All non-Finnish sorted by date
  const intlAll = all?.filter(r => r.browser_lang && !r.browser_lang.startsWith('fi'));
  console.log('\nKAIKKI KANSAINVÄLISET (' + intlAll?.length + '):');
  intlAll?.slice(0, 15).forEach(r => 
    console.log(' ', r.client_time?.substring(0,10), '|', r.browser_lang?.padEnd(8), '|', r.game_code, '|', r.event_type)
  );

  // Days from first event to today
  const firstDate = new Date(all?.[0]?.client_time);
  const today = new Date('2026-06-01');
  console.log('\nPÄIVIÄ ENSIMMÄISESTÄ TAPAHTUMASTA:', Math.round((today-firstDate)/(1000*60*60*24)));
}

check().catch(console.error);
