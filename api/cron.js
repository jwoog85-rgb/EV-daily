import Parser from 'rss-parser';
import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';

export const config = { maxDuration: 60 };

const parser = new Parser({ timeout: 15000 });
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const FEEDS = {
  korea: {
    lang: 'ko',
    langName: 'Korean',
    urls: [
      'https://news.google.com/rss/search?q=%EC%A0%84%EA%B8%B0%EC%B0%A8&hl=ko&gl=KR&ceid=KR:ko',
      'https://news.google.com/rss/search?q=EV+%EB%B0%B0%ED%84%B0%EB%A6%AC&hl=ko&gl=KR&ceid=KR:ko',
    ],
  },
  japan: {
    lang: 'ja',
    langName: 'Japanese',
    urls: [
      'https://news.google.com/rss/search?q=%E9%9B%BB%E6%B0%97%E8%87%AA%E5%8B%95%E8%BB%8A&hl=ja&gl=JP&ceid=JP:ja',
      'https://news.google.com/rss/search?q=EV+%E3%83%90%E3%83%83%E3%83%86%E3%83%AA%E3%83%BC&hl=ja&gl=JP&ceid=JP:ja',
    ],
  },
  us: {
    lang: 'en',
    langName: 'English',
    urls: [
      'https://electrek.co/feed/',
      'https://insideevs.com/rss/articles/all/',
      'https://news.google.com/rss/search?q=electric+vehicle+OR+EV&hl=en&gl=US&ceid=US:en',
    ],
  },
};

const CATEGORIES = ['국내 완성차', '해외 완성차', '배터리', '충전 인프라', '정책', '시장 동향'];

function extractSource(title) {
  const m = title.match(/ - ([^-]{2,40})$/);
  return m ? m[1].trim() : null;
}

function cleanTitle(title) {
  return title.replace(/ - [^-]{2,40}$/, '').trim();
}

async function fetchFeeds(urls) {
  const results = await Promise.allSettled(urls.map((u) => parser.parseURL(u)));
  const items = [];
  results.forEach((r) => {
    if (r.status === 'fulfilled') items.push(...r.value.items);
  });
  return items;
}

async function processCountry(country) {
  const config = FEEDS[country];
  console.log(`[${country}] fetching feeds...`);
  const rawItems = await fetchFeeds(config.urls);
  console.log(`[${country}] got ${rawItems.length} raw items`);

  if (rawItems.length === 0) return { country, saved: 0 };

  rawItems.sort(
    (a, b) =>
      new Date(b.pubDate || b.isoDate || 0) - new Date(a.pubDate || a.isoDate || 0)
  );
  const top = rawItems.slice(0, 8);

  const itemsText = top
    .map((item, i) => {
      const desc = (item.contentSnippet || item.content || '')
        .replace(/<[^>]+>/g, '')
        .slice(0, 300);
      return `${i + 1}. TITLE: ${cleanTitle(item.title)}\n   DESC: ${desc}`;
    })
    .join('\n\n');

  const prompt = `You are processing ${config.langName} EV/automotive news for a Korean news app.

For each numbered item, output:
- title_ko: Concise Korean title (translate if needed; if already Korean, polish)
- summary_ko: Exactly 2 Korean sentences capturing the key facts and implication
- category: ONE of: ${CATEGORIES.join(' / ')}

Rules:
- Keep brand/company/people names in original Latin form (Tesla, Toyota, Hyundai, BYD, Rivian, etc.)
- Convert Japanese katakana brand names to Latin (テスラ → Tesla)
- Korean must be natural, news-style, not literal translation
- 2 sentences exactly, no more no less

Items:
${itemsText}

Output a JSON array of exactly ${top.length} objects with keys (title_ko, summary_ko, category) in the same order. No markdown, no explanation.`;

  console.log(`[${country}] sending ${top.length} headlines to Claude`);

  const message = await anthropic.messages.create({
    model: 'claude-haiku-4-5',
    max_tokens: 3000,
    system: 'You output ONLY a valid JSON array. No code fences, no preamble, no explanation.',
    messages: [{ role: 'user', content: prompt }],
  });

  const text = message.content[0].text.replace(/```json/gi, '').replace(/```/g, '').trim();
  let processed;
  try {
    processed = JSON.parse(text);
  } catch (e) {
    console.error(`[${country}] JSON parse failed. Response preview:`, text.slice(0, 300));
    throw e;
  }
  console.log(`[${country}] Claude returned ${processed.length} processed items`);

  const records = top
    .map((item, i) => {
      const p = processed[i];
      if (!p) return null;
      return {
        country,
        title: p.title_ko,
        summary: p.summary_ko,
        category: p.category,
        source: extractSource(item.title) || item.creator || new URL(item.link).hostname,
        source_url: item.link,
        pub_date: item.pubDate || item.isoDate || new Date().toISOString(),
        original_title: cleanTitle(item.title),
      };
    })
    .filter(Boolean);

  console.log(`[${country}] upserting ${records.length} records...`);
  const { error } = await supabase
    .from('news')
    .upsert(records, { onConflict: 'source_url', ignoreDuplicates: false });

  if (error) {
    console.error(`[${country}] supabase error:`, error);
    throw new Error(error.message);
  }

  console.log(`[${country}] done!`);
  return { country, saved: records.length };
}

export default async function handler(req, res) {
  const authHeader = req.headers.authorization;
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    console.log('=== ENV CHECK ===');
    console.log('ANTHROPIC_API_KEY exists:', !!process.env.ANTHROPIC_API_KEY);
    console.log('ANTHROPIC_API_KEY length:', process.env.ANTHROPIC_API_KEY?.length || 0);
    console.log('ANTHROPIC_API_KEY prefix:', process.env.ANTHROPIC_API_KEY?.slice(0, 10) || 'EMPTY');

    console.log('SUPABASE_URL:', process.env.SUPABASE_URL || 'EMPTY');
    console.log('SUPABASE_SERVICE_KEY length:', process.env.SUPABASE_SERVICE_KEY?.length || 0);
    
    const results = await Promise.allSettled([
      processCountry('korea'),
      processCountry('japan'),
      processCountry('us'),
    ]);

    const summary = results.map((r, i) => {
      const country = ['korea', 'japan', 'us'][i];
      if (r.status === 'fulfilled') return r.value;
      return { country, error: r.reason?.message || 'unknown error' };
    });

    console.log('Final summary:', JSON.stringify(summary));
    res.status(200).json({
      ok: true,
      time: new Date().toISOString(),
      results: summary,
    });
  } catch (e) {
    console.error('Cron failed:', e);
    console.error('Stack:', e.stack);
    res.status(500).json({ error: e.message, stack: e.stack });
  }
}
