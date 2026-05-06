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

function buildGoogleNewsUrl(sites, keywords, locale) {
  const sitesQuery = sites.map((s) => `site:${s}`).join(' OR ');
  const fullQuery = `(${sitesQuery}) (${keywords})`;
  return `https://news.google.com/rss/search?q=${encodeURIComponent(fullQuery)}&${locale}`;
}

const FEEDS = {
  korea: {
    lang: 'ko',
    langName: 'Korean',
    urls: [
      buildGoogleNewsUrl(
        ['etnews.com', 'hankyung.com', 'mk.co.kr', 'mt.co.kr', 'biz.chosun.com'],
        '전기차 OR EV OR 배터리 OR 충전',
        'hl=ko&gl=KR&ceid=KR:ko'
      ),
      buildGoogleNewsUrl(
        ['edaily.co.kr', 'fnnews.com', 'sedaily.com', 'thebell.co.kr'],
        '전기차 OR EV OR 배터리',
        'hl=ko&gl=KR&ceid=KR:ko'
      ),
    ],
  },
  japan: {
    lang: 'ja',
    langName: 'Japanese',
    urls: [
      buildGoogleNewsUrl(
        ['response.jp', 'car.watch.impress.co.jp', 'nikkei.com', 'itmedia.co.jp'],
        '電気自動車 OR EV OR バッテリー OR 充電',
        'hl=ja&gl=JP&ceid=JP:ja'
      ),
      buildGoogleNewsUrl(
        ['carview.yahoo.co.jp', 'autocar.jp', 'kuruma-news.jp', 'webcg.net'],
        '電気自動車 OR EV OR バッテリー',
        'hl=ja&gl=JP&ceid=JP:ja'
      ),
    ],
  },
  us: {
    lang: 'en',
    langName: 'English',
    urls: [
      'https://electrek.co/feed/',
      'https://insideevs.com/rss/articles/all/',
      'https://cleantechnica.com/feed/',
      buildGoogleNewsUrl(
        ['theverge.com', 'reuters.com', 'bloomberg.com', 'wsj.com', 'cnbc.com'],
        'electric vehicle OR EV OR battery',
        'hl=en&gl=US&ceid=US:en'
      ),
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
  results.forEach((r, idx) => {
    if (r.status === 'fulfilled') {
      items.push(...r.value.items);
    } else {
      console.warn(`feed ${idx} failed:`, r.reason?.message || r.reason);
    }
  });
  return items;
}

async function processCountry(country) {
  const conf = FEEDS[country];
  console.log(`[${country}] fetching feeds...`);
  const rawItems = await fetchFeeds(conf.urls);
  console.log(`[${country}] got ${rawItems.length} raw items`);

  if (rawItems.length === 0) return { country, saved: 0 };

  rawItems.sort(
    (a, b) =>
      new Date(b.pubDate || b.isoDate || 0) - new Date(a.pubDate || a.isoDate || 0)
  );

  const seen = new Set();
  const deduped = rawItems.filter((item) => {
    const key = item.link;
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const top = deduped.slice(0, 8);

  const itemsText = top
    .map((item, i) => {
      const desc = (item.contentSnippet || item.content || '')
        .replace(/<[^>]+>/g, '')
        .slice(0, 400);
      return `${i + 1}. TITLE: ${cleanTitle(item.title)}\n   DESC: ${desc}`;
    })
    .join('\n\n');

  const prompt = `You are processing ${conf.langName} EV/automotive news for a Korean news app and analytical archive.

For each numbered item, output:
- title_ko: Concise Korean title (translate if needed; if already Korean, polish)
- summary_ko: Exactly 2 Korean sentences capturing the key facts (for quick scanning on the website)
- summary_long_ko: Exactly 4 Korean sentences providing deeper analysis (for archival/research):
  Sentence 1: Core fact - what happened
  Sentence 2: Specific details, numbers, or technical specs mentioned
  Sentence 3: Market context - related companies, competing products, or industry trend
  Sentence 4: Implication - why this matters for the EV industry going forward
- category: ONE of: ${CATEGORIES.join(' / ')}

Rules:
- Keep brand/company/people names in original Latin form (Tesla, Toyota, Hyundai, BYD, Rivian, etc.)
- Convert Japanese katakana brand names to Latin (テスラ → Tesla)
- Korean must be natural, news-style, not literal translation
- summary_ko: 2 sentences exactly. summary_long_ko: 4 sentences exactly.
- For summary_long_ko, draw on your knowledge of the EV industry to add useful context

Items:
${itemsText}

Output a JSON array of exactly ${top.length} objects with keys (title_ko, summary_ko, summary_long_ko, category) in the same order. No markdown, no explanation.`;

  const message = await anthropic.messages.create({
    model: 'claude-haiku-4-5',
    max_tokens: 6000,
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

  const records = top
    .map((item, i) => {
      const p = processed[i];
      if (!p) return null;
      return {
        country,
        title: p.title_ko,
        summary: p.summary_ko,
        summary_long: p.summary_long_ko,
        category: p.category,
        source: extractSource(item.title) || item.creator || new URL(item.link).hostname,
        source_url: item.link,
        pub_date: item.pubDate || item.isoDate || new Date().toISOString(),
        original_title: cleanTitle(item.title),
      };
    })
    .filter(Boolean);

  const { error } = await supabase
    .from('news')
    .upsert(records, { onConflict: 'source_url', ignoreDuplicates: false });

  if (error) {
    console.error(`[${country}] supabase error:`, error);
    throw new Error(error.message);
  }

  console.log(`[${country}] saved ${records.length} records`);
  return { country, saved: records.length };
}

export default async function handler(req, res) {
  const authHeader = req.headers.authorization;
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
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

    console.log('Cron run summary:', JSON.stringify(summary));
    res.status(200).json({
      ok: true,
      time: new Date().toISOString(),
      results: summary,
    });
  } catch (e) {
    console.error('Cron failed:', e);
    res.status(500).json({ error: e.message });
  }
}
