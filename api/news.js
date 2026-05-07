import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

export default async function handler(req, res) {
  const country = (req.query.country || '').toString();
  const sector = (req.query.sector || 'ev').toString();

  // Validate inputs
  const validCountries = ['korea', 'japan', 'us'];
  const validSectors = ['ev', 'cpo'];

  if (!validCountries.includes(country)) {
    return res.status(400).json({
      error: 'Invalid country. Use korea, japan, or us.',
    });
  }
  if (!validSectors.includes(sector)) {
    return res.status(400).json({
      error: 'Invalid sector. Use ev or cpo.',
    });
  }

  try {
    const { data, error } = await supabase
      .from('news')
      .select(
        'id, country, sector, title, summary, summary_long, category, source, source_url, pub_date'
      )
      .eq('country', country)
      .eq('sector', sector)
      .order('pub_date', { ascending: false })
      .limit(50);

    if (error) {
      console.error('news DB error:', error);
      return res.status(500).json({ error: error.message });
    }

    res.setHeader(
      'Cache-Control',
      'public, s-maxage=300, stale-while-revalidate=60'
    );
    res.status(200).json({
      country,
      sector,
      count: data?.length || 0,
      items: data || [],
    });
  } catch (e) {
    console.error('news handler failed:', e);
    res.status(500).json({ error: e.message });
  }
}
