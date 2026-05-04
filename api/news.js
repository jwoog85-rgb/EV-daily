import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

export default async function handler(req, res) {
  const country = (req.query.country || 'korea').toString();
  const allowed = ['korea', 'japan', 'us'];

  if (!allowed.includes(country)) {
    return res.status(400).json({ error: 'Invalid country' });
  }

  const { data, error } = await supabase
    .from('news')
    .select('id, country, title, summary, category, source, source_url, pub_date, original_title')
    .eq('country', country)
    .order('pub_date', { ascending: false })
    .limit(15);

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  // Cache for 5 min on edge, allow stale-while-revalidate for 10 min
  res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=300, stale-while-revalidate=600');
  res.status(200).json({ items: data || [] });
}
