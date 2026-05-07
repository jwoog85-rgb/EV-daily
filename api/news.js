import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

const VALID_TECH_TAGS = [
  'fast_charging', 'mcs', 'wireless', 'v2x',
  'standard', 'ai_management', 'payment', 'battery',
];

export default async function handler(req, res) {
  const sector = (req.query.sector || 'ev').toString();
  const country = (req.query.country || '').toString();
  const techTag = (req.query.tech_tag || '').toString();

  const validSectors = ['ev', 'cpo', 'tech'];
  const validCountries = ['korea', 'japan', 'us', 'global'];

  if (!validSectors.includes(sector)) {
    return res.status(400).json({
      error: 'Invalid sector. Use ev, cpo, or tech.',
    });
  }

  // For tech sector: country defaults to 'global'
  // For ev/cpo: country must be specified and valid
  let effectiveCountry;
  if (sector === 'tech') {
    effectiveCountry = 'global';
  } else {
    if (!validCountries.includes(country) || country === 'global') {
      return res.status(400).json({
        error: 'Invalid country. Use korea, japan, or us.',
      });
    }
    effectiveCountry = country;
  }

  // Validate tech_tag if provided (only relevant for tech sector)
  if (techTag && !VALID_TECH_TAGS.includes(techTag)) {
    return res.status(400).json({
      error: `Invalid tech_tag. Allowed: ${VALID_TECH_TAGS.join(', ')}`,
    });
  }

  try {
    let query = supabase
      .from('news')
      .select(
        'id, country, sector, tech_tag, title, summary, summary_long, category, source, source_url, pub_date'
      )
      .eq('sector', sector)
      .eq('country', effectiveCountry)
      .order('pub_date', { ascending: false })
      .limit(100);

    // Apply tech_tag filter if provided
    if (sector === 'tech' && techTag) {
      query = query.eq('tech_tag', techTag);
    }

    const { data, error } = await query;

    if (error) {
      console.error('news DB error:', error);
      return res.status(500).json({ error: error.message });
    }

    res.setHeader(
      'Cache-Control',
      'public, s-maxage=300, stale-while-revalidate=60'
    );
    res.status(200).json({
      sector,
      country: effectiveCountry,
      tech_tag: techTag || null,
      count: data?.length || 0,
      items: data || [],
    });
  } catch (e) {
    console.error('news handler failed:', e);
    res.status(500).json({ error: e.message });
  }
}
