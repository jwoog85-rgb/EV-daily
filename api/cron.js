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

function buildGoogleNewsUrl(query, locale) {
  return `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&${locale}`;
}

function buildSiteFiltered(sites, keywords, locale) {
  const sitesQuery = sites.map((s) => `site:${s}`).join(' OR ');
  return buildGoogleNewsUrl(`(${sitesQuery}) (${keywords})`, locale);
}

// ===== Sector configs =====

// EV sector — same as before
const EV_FEEDS = {
  korea: {
    lang: 'ko', langName: 'Korean',
    urls: [
      buildSiteFiltered(
        ['etnews.com', 'hankyung.com', 'mk.co.kr', 'mt.co.kr', 'biz.chosun.com'],
        '전기차 OR EV OR 배터리 OR 충전',
        'hl=ko&gl=KR&ceid=KR:ko'),
      buildSiteFiltered(
        ['edaily.co.kr', 'fnnews.com', 'sedaily.com', 'thebell.co.kr'],
        '전기차 OR EV OR 배터리',
        'hl=ko&gl=KR&ceid=KR:ko'),
    ],
  },
  japan: {
    lang: 'ja', langName: 'Japanese',
    urls: [
      buildSiteFiltered(
        ['response.jp', 'car.watch.impress.co.jp', 'nikkei.com', 'itmedia.co.jp'],
        '電気自動車 OR EV OR バッテリー OR 充電',
        'hl=ja&gl=JP&ceid=JP:ja'),
      buildSiteFiltered(
        ['carview.yahoo.co.jp', 'autocar.jp', 'kuruma-news.jp', 'webcg.net'],
        '電気自動車 OR EV OR バッテリー',
        'hl=ja&gl=JP&ceid=JP:ja'),
    ],
  },
  us: {
    lang: 'en', langName: 'English',
    urls: [
      'https://electrek.co/feed/',
      'https://insideevs.com/rss/articles/all/',
      'https://cleantechnica.com/feed/',
      buildSiteFiltered(
        ['theverge.com', 'reuters.com', 'bloomberg.com', 'wsj.com', 'cnbc.com'],
        'electric vehicle OR EV OR battery',
        'hl=en&gl=US&ceid=US:en'),
    ],
  },
};

// CPO sector — Charging Point Operator companies
const CPO_FEEDS = {
  korea: {
    lang: 'ko', langName: 'Korean',
    // Step 1: company-name searches (priority)
    urls: [
      buildGoogleNewsUrl(
        '"GS차지비" OR "채비" OR "파워큐브" OR "에버온" OR "SK일렉링크" OR "이브이시스" OR "EVSIS" OR "한국전기차충전서비스" OR "볼트업"',
        'hl=ko&gl=KR&ceid=KR:ko'),
      buildGoogleNewsUrl(
        '"플러그링크" OR "Pluglink" OR "휴맥스이브이" OR "스타코프" OR "차지인" OR "전기차 충전사업자" OR "충전소 사업"',
        'hl=ko&gl=KR&ceid=KR:ko'),
    ],
  },
  japan: {
    lang: 'ja', langName: 'Japanese',
    urls: [
      buildGoogleNewsUrl(
        '"e-Mobility Power" OR "eMP" OR "ENECHANGE" OR "Tesla Japan" OR "Terra Charge" OR "Terra Motors" OR "PowerX"',
        'hl=ja&gl=JP&ceid=JP:ja'),
      buildGoogleNewsUrl(
        '"Plugo" OR "EneGate" OR "Jigowatts" OR "bp pulse Japan" OR "MC Retail Energy" OR "充電サービス" OR "EV充電 事業者"',
        'hl=ja&gl=JP&ceid=JP:ja'),
    ],
  },
  us: {
    lang: 'en', langName: 'English',
    urls: [
      buildGoogleNewsUrl(
        '"Tesla Supercharger" OR "ChargePoint" OR "Electrify America" OR "EVgo" OR "Blink Charging"',
        'hl=en&gl=US&ceid=US:en'),
      buildGoogleNewsUrl(
        '"EV Connect" OR "Ionna" OR "Shell Recharge" OR "bp pulse" OR "FLO" charging OR "EV charging operator" OR "charging network"',
        'hl=en&gl=US&ceid=US:en'),
    ],
  },
};

const EV_CATEGORIES = ['국내 완성차', '해외 완성차', '배터리', '충전 인프라', '정책', '시장 동향'];
const CPO_CATEGORIES = ['사업 확장', '기술·제품', '제휴·파트너십', '요금·서비스', '투자·M&A', '정책·규제'];

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

async function processSegment(sector, country, feedsConfig, categories, sectorContext) {
  const conf = feedsConfig[country];
  console.log(`[${sector}/${country}] fetching feeds...`);
  const rawItems = await fetchFeeds(conf.urls);
  console.log(`[${sector}/${country}] got ${rawItems.length} raw items`);

  if (rawItems.length === 0) return { sector, country, saved: 0 };

  rawItems.sort(
    (a, b) =>
      new Date(b.pubDate || b.isoDate || 0) - new Date(a.pubDate || a.isoDate || 0)
  );

  // Dedupe by link
  const seen = new Set();
  const deduped = rawItems.filter((item) => {
    const key = item.link;
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const top = deduped.slice(0, 8);
  if (top.length === 0) return { sector, country, saved: 0 };

  const itemsText = top
    .map((item, i) => {
      const desc = (item.contentSnippet || item.content || '')
        .replace(/<[^>]+>/g, '')
        .slice(0, 400);
      return `${i + 1}. TITLE: ${cleanTitle(item.title)}\n   DESC: ${desc}`;
    })
    .join('\n\n');

  const prompt = `You are processing ${conf.langName} ${sectorContext} news for a Korean news app and analytical archive.

For each numbered item, output:
- title_ko: Concise Korean title (translate if needed; if already Korean, polish)
- summary_ko: Exactly 2 Korean sentences capturing the key facts (for quick scanning on the website)
- summary_long_ko: Exactly 4 Korean sentences providing deeper analysis (for archival/research):
  Sentence 1: Core fact - what happened
  Sentence 2: Specific details, numbers, or technical specs mentioned
  Sentence 3: Market context - related companies, competing products, or industry trend
  Sentence 4: Implication - why this matters for the industry going forward
- category: ONE of: ${categories.join(' / ')}

Rules:
- Keep brand/company/people names in original Latin form (Tesla, Toyota, ChargePoint, EVgo, etc.)
- Convert Japanese katakana brand names to Latin (テスラ → Tesla)
- Korean must be natural, news-style, not literal translation
- summary_ko: 2 sentences exactly. summary_long_ko: 4 sentences exactly.

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
    console.error(`[${sector}/${country}] JSON parse failed. Response preview:`, text.slice(0, 300));
    throw e;
  }

  const records = top
    .map((item, i) => {
      const p = processed[i];
      if (!p) return null;
      return {
        sector,
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
    console.error(`[${sector}/${country}] supabase error:`, error);
    throw new Error(error.message);
  }

  console.log(`[${sector}/${country}] saved ${records.length} records`);
  return { sector, country, saved: records.length };
}

export default async function handler(req, res) {
  const authHeader = req.headers.authorization;
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const tasks = [
      // EV sector
      processSegment('ev', 'korea', EV_FEEDS, EV_CATEGORIES, 'EV/automotive'),
      processSegment('ev', 'japan', EV_FEEDS, EV_CATEGORIES, 'EV/automotive'),
      processSegment('ev', 'us', EV_FEEDS, EV_CATEGORIES, 'EV/automotive'),
      // CPO sector
      processSegment('cpo', 'korea', CPO_FEEDS, CPO_CATEGORIES, 'EV charging operator (CPO)'),
      processSegment('cpo', 'japan', CPO_FEEDS, CPO_CATEGORIES, 'EV charging operator (CPO)'),
      processSegment('cpo', 'us', CPO_FEEDS, CPO_CATEGORIES, 'EV charging operator (CPO)'),
    ];

    const results = await Promise.allSettled(tasks);

    const summary = results.map((r, i) => {
      const sectorList = ['ev', 'ev', 'ev', 'cpo', 'cpo', 'cpo'];
      const countryList = ['korea', 'japan', 'us', 'korea', 'japan', 'us'];
      if (r.status === 'fulfilled') return r.value;
      return {
        sector: sectorList[i], country: countryList[i],
        error: r.reason?.message || 'unknown error',
      };
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
