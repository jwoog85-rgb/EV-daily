import { createClient } from '@supabase/supabase-js';
import Anthropic from '@anthropic-ai/sdk';
import pptxgen from 'pptxgenjs';
import { GLISIS_LOGO_BASE64 } from './_logo.js';

export const config = { maxDuration: 60 };

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ===== Brand palette =====
const COLOR_BLUE = '005A9C';
const COLOR_DARK = '111827';
const COLOR_GRAY = '6B7280';
const COLOR_LIGHT_GRAY = 'E5E7EB';
const COLOR_BG_GRAY = 'F9FAFB';
const COLOR_WHITE = 'FFFFFF';

const FONT = 'Calibri';

// ===== Sector configs =====
const SECTOR_CONFIG = {
  ev: {
    title: 'EV Weekly Report',
    titleMonth: 'EV Monthly Report',
    indexTitle: 'All Articles This Week',
    indexSubtitle: 'Source data — EV market across Korea, Japan, US',
    contextLabel: 'EV market',
    categories: ['국내 완성차', '해외 완성차', '배터리', '충전 인프라', '정책', '시장 동향'],
    categoryColors: {
      '국내 완성차': '005A9C',
      '해외 완성차': '4F46E5',
      '배터리':      '8B5CF6',
      '충전 인프라':  '0D9488',
      '정책':        'D97706',
      '시장 동향':    'E11D48',
    },
  },
  cpo: {
    title: 'CPO Weekly Report',
    titleMonth: 'CPO Monthly Report',
    indexTitle: 'All Articles This Week',
    indexSubtitle: 'Source data — Charging Point Operators across Korea, Japan, US',
    contextLabel: 'EV charging operator (CPO) industry',
    categories: ['사업 확장', '기술·제품', '제휴·파트너십', '요금·서비스', '투자·M&A', '정책·규제'],
    categoryColors: {
      '사업 확장':      '005A9C',
      '기술·제품':      '4F46E5',
      '제휴·파트너십':   '8B5CF6',
      '요금·서비스':    '0D9488',
      '투자·M&A':       'D97706',
      '정책·규제':      'E11D48',
    },
  },
};

const COUNTRY_LABELS = { korea: '한국', japan: '일본', us: '미국' };
const COUNTRY_CODES  = { korea: 'KR', japan: 'JP', us: 'US' };

// ===== Date helpers =====
function formatDate(d) {
  const date = new Date(d);
  return `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, '0')}.${String(date.getDate()).padStart(2, '0')}`;
}

// ===== Claude analysis =====
async function generateAnalysis(articles, periodLabel, sectorConfig) {
  const articleList = articles.map((a, i) => {
    const country = COUNTRY_LABELS[a.country] || a.country;
    return `${i + 1}. [${country}/${a.category}] ${a.title}\n   ${a.summary_long || a.summary || ''}`;
  }).join('\n\n');

  const prompt = `You are analyzing ${articles.length} ${sectorConfig.contextLabel} news articles from ${periodLabel} for an executive weekly report.

Articles:
${articleList}

Generate a JSON object with these exact keys:

{
  "highlights": [
    "1번째 핵심 하이라이트 (한 줄, 80자 이내)",
    "2번째 핵심 하이라이트",
    "3번째 핵심 하이라이트"
  ],
  "category_picks": {
    "${sectorConfig.categories[0]}": <article number>,
    "${sectorConfig.categories[1]}": <article number>,
    "${sectorConfig.categories[2]}": <article number>,
    "${sectorConfig.categories[3]}": <article number>,
    "${sectorConfig.categories[4]}": <article number>,
    "${sectorConfig.categories[5]}": <article number>
  },
  "implications": [
    {"title": "인사이트 제목", "detail": "2~3 문장 설명. 시장 영향, 관련 업체, 향후 전망 등을 포함."},
    {"title": "두 번째", "detail": "..."},
    {"title": "세 번째", "detail": "..."},
    {"title": "네 번째", "detail": "..."}
  ]
}

Rules:
- highlights: pick the 3 most impactful stories of the week. Korean, news-style, concise.
- category_picks: for EACH of the 6 categories, pick the BEST representative article number (1-${articles.length}). If a category has zero articles, use the closest match.
- implications: 4 strategic insights synthesized from the week's articles. Korean, professional tone for executives.
- Korean throughout. Brand names in original Latin form (Tesla, ChargePoint, EVgo, etc.)
- Return ONLY the JSON object. No markdown fences, no preamble.`;

  const response = await anthropic.messages.create({
    model: 'claude-haiku-4-5',
    max_tokens: 2500,
    system: 'You output ONLY a valid JSON object. No code fences, no preamble.',
    messages: [{ role: 'user', content: prompt }],
  });

  const text = response.content[0].text
    .replace(/```json/gi, '').replace(/```/g, '').trim();
  return JSON.parse(text);
}

// ===== Slide builders =====

function addLogoTopRight(slide) {
  slide.addImage({
    data: GLISIS_LOGO_BASE64,
    x: 11.83, y: 0.185, w: 1.31, h: 0.375,
  });
}

function addSectionTitle(slide, title) {
  slide.addText(title, {
    x: 0.625, y: 0.285, w: 11, h: 0.55,
    fontSize: 26, bold: true, color: COLOR_DARK, fontFace: FONT,
    valign: 'top',
  });
}

function buildTitleSlide(pres, weekStart, weekEnd, reportTitle) {
  const slide = pres.addSlide();
  slide.addShape('rect', {
    x: 7.5, y: 0, w: 5.833, h: 7.5,
    fill: { color: COLOR_BG_GRAY }, line: { type: 'none' },
  });
  slide.addImage({
    data: GLISIS_LOGO_BASE64,
    x: 1.03, y: 2.47, w: 4.6, h: 1.29,
  });
  slide.addText(reportTitle, {
    x: 2.5, y: 3.9, w: 3.2, h: 0.55,
    fontSize: 24, bold: true, color: COLOR_BLUE, fontFace: FONT,
    align: 'right',
  });
  slide.addText(`${weekStart} — ${weekEnd}`, {
    x: 2.5, y: 4.55, w: 3.2, h: 0.4,
    fontSize: 15, color: COLOR_GRAY, fontFace: FONT,
    align: 'right',
  });
}

function buildExecSummary(pres, stats, highlights, sectorConfig) {
  const slide = pres.addSlide();
  addLogoTopRight(slide);
  addSectionTitle(slide, 'Executive Summary');

  const statsTop = 1.3;
  const leftStart = 0.625;
  const totalCardW = 2.6;
  const countryCardW = 2.0;
  const cardH = 1.5;
  const cardGap = 0.25;

  slide.addShape('rect', {
    x: leftStart, y: statsTop, w: totalCardW, h: cardH,
    fill: { color: COLOR_BLUE }, line: { type: 'none' },
  });
  slide.addText('TOTAL ARTICLES', {
    x: leftStart, y: statsTop + 0.18, w: totalCardW, h: 0.4,
    fontSize: 11, bold: true, color: COLOR_WHITE, fontFace: FONT,
    align: 'center',
  });
  slide.addText(String(stats.total), {
    x: leftStart, y: statsTop + 0.5, w: totalCardW, h: 1.0,
    fontSize: 56, bold: true, color: COLOR_WHITE, fontFace: FONT,
    align: 'center',
  });

  const countries = [
    [`${COUNTRY_LABELS.korea} ${COUNTRY_CODES.korea}`, stats.byCountry.korea || 0],
    [`${COUNTRY_LABELS.japan} ${COUNTRY_CODES.japan}`, stats.byCountry.japan || 0],
    [`${COUNTRY_LABELS.us} ${COUNTRY_CODES.us}`, stats.byCountry.us || 0],
  ];
  countries.forEach(([label, count], i) => {
    const x = leftStart + totalCardW + cardGap + (countryCardW + cardGap) * i;
    slide.addShape('rect', {
      x, y: statsTop, w: countryCardW, h: cardH,
      fill: { color: COLOR_BG_GRAY },
      line: { color: COLOR_LIGHT_GRAY, width: 1 },
    });
    slide.addText(label, {
      x, y: statsTop + 0.18, w: countryCardW, h: 0.4,
      fontSize: 11, bold: true, color: COLOR_GRAY, fontFace: FONT,
      align: 'center',
    });
    slide.addText(String(count), {
      x, y: statsTop + 0.5, w: countryCardW, h: 1.0,
      fontSize: 48, bold: true, color: COLOR_DARK, fontFace: FONT,
      align: 'center',
    });
  });

  const catTop = 3.2;
  slide.addText('Category Distribution', {
    x: leftStart, y: catTop, w: 5.0, h: 0.4,
    fontSize: 14, bold: true, color: COLOR_DARK, fontFace: FONT,
  });
  const barTop = catTop + 0.5;
  const maxCount = Math.max(...Object.values(stats.byCategory), 1);
  const barMaxW = 3.5;
  const rowH = 0.4;
  sectorConfig.categories.forEach((cat, i) => {
    const count = stats.byCategory[cat] || 0;
    const y = barTop + rowH * i;
    slide.addText(cat, {
      x: leftStart, y, w: 1.3, h: rowH,
      fontSize: 11, color: COLOR_DARK, fontFace: FONT, valign: 'middle',
    });
    const barW = barMaxW * (count / maxCount);
    if (barW > 0) {
      slide.addShape('rect', {
        x: leftStart + 1.4, y: y + 0.08, w: barW, h: 0.22,
        fill: { color: COLOR_BLUE }, line: { type: 'none' },
      });
    }
    slide.addText(String(count), {
      x: leftStart + 1.4 + barW + 0.08, y, w: 0.5, h: rowH,
      fontSize: 11, bold: true, color: COLOR_DARK, fontFace: FONT,
      valign: 'middle',
    });
  });

  const hlLeft = 7.0;
  const hlTop = 3.2;
  const hlW = 5.7;
  slide.addText('This Week Highlights', {
    x: hlLeft, y: hlTop, w: hlW, h: 0.4,
    fontSize: 14, bold: true, color: COLOR_DARK, fontFace: FONT,
  });
  highlights.slice(0, 3).forEach((hl, i) => {
    const y = hlTop + 0.55 + 1.05 * i;
    slide.addShape('ellipse', {
      x: hlLeft, y, w: 0.36, h: 0.36,
      fill: { color: COLOR_BLUE }, line: { type: 'none' },
    });
    slide.addText(String(i + 1), {
      x: hlLeft, y, w: 0.36, h: 0.36,
      fontSize: 13, bold: true, color: COLOR_WHITE, fontFace: FONT,
      align: 'center', valign: 'middle',
    });
    slide.addText(hl, {
      x: hlLeft + 0.55, y: y - 0.02, w: hlW - 0.55, h: 0.95,
      fontSize: 12, color: COLOR_DARK, fontFace: FONT,
    });
  });
}

function buildAllArticlesIndex(pres, articlesByCountry, sectorConfig) {
  const slide = pres.addSlide();
  addLogoTopRight(slide);
  addSectionTitle(slide, sectorConfig.indexTitle);
  const totalCount = Object.values(articlesByCountry).flat().length;
  slide.addText(`${sectorConfig.indexSubtitle} — ${totalCount} articles`, {
    x: 0.625, y: 0.85, w: 10, h: 0.3,
    fontSize: 11, color: COLOR_GRAY, fontFace: FONT,
  });

  const colTop = 1.3;
  const colLeftStart = 0.5;
  const colGap = 0.2;
  const totalW = 13.333 - colLeftStart * 2;
  const colW = (totalW - colGap * 2) / 3;
  const headerH = 0.5;
  const listTop = colTop + headerH + 0.18;
  const itemsBottom = 7.2;
  const itemsAreaH = itemsBottom - listTop;
  const maxItems = 8;
  const itemH = itemsAreaH / maxItems;

  ['korea', 'japan', 'us'].forEach((countryKey, colIdx) => {
    const x = colLeftStart + (colW + colGap) * colIdx;
    const country = COUNTRY_LABELS[countryKey];
    const code = COUNTRY_CODES[countryKey];
    const items = (articlesByCountry[countryKey] || []).slice(0, maxItems);

    slide.addShape('rect', {
      x, y: colTop, w: colW, h: headerH,
      fill: { color: COLOR_BLUE }, line: { type: 'none' },
    });
    slide.addText(country, {
      x: x + 0.2, y: colTop, w: 2.0, h: headerH,
      fontSize: 14, bold: true, color: COLOR_WHITE, fontFace: FONT,
      valign: 'middle',
    });
    slide.addText(code, {
      x: x + colW - 0.55, y: colTop, w: 0.4, h: headerH,
      fontSize: 10, bold: true, color: COLOR_WHITE, fontFace: FONT,
      align: 'right', valign: 'middle',
    });

    items.forEach((art, i) => {
      const y = listTop + itemH * i;
      const innerX = x + 0.05;
      const innerW = colW - 0.1;

      const topY = y + 0.05;
      const catColor = sectorConfig.categoryColors[art.category] || COLOR_GRAY;

      slide.addShape('ellipse', {
        x: innerX, y: topY + 0.02, w: 0.13, h: 0.13,
        fill: { color: catColor }, line: { type: 'none' },
      });
      slide.addText(art.category || '', {
        x: innerX + 0.2, y: topY, w: 1.5, h: 0.2,
        fontSize: 8, bold: true, color: catColor, fontFace: FONT,
      });
      slide.addText(art.source || '', {
        x: innerX + innerW - 1.5, y: topY, w: 1.5, h: 0.2,
        fontSize: 8, color: COLOR_GRAY, fontFace: FONT,
        align: 'right',
      });
      slide.addText(art.title || '', {
        x: innerX, y: topY + 0.22, w: innerW, h: itemH - 0.3,
        fontSize: 9, bold: true, color: COLOR_DARK, fontFace: FONT,
        hyperlink: { url: art.source_url || '' },
        lineSpacingMultiple: 1.18,
      });
      if (i < items.length - 1) {
        slide.addShape('rect', {
          x: innerX, y: y + itemH - 0.005, w: innerW, h: 0.005,
          fill: { color: COLOR_LIGHT_GRAY }, line: { type: 'none' },
        });
      }
    });
  });
}

function buildKMNGrid(pres, categoryArticles, sectorConfig) {
  const slide = pres.addSlide();
  addLogoTopRight(slide);
  addSectionTitle(slide, 'Key Market News');

  const gridTop = 0.92;
  const gridLeft = 0.5;
  const gapX = 0.18;
  const gapY = 0.18;
  const cols = 3;
  const rows = 2;
  const totalW = 13.333 - gridLeft * 2;
  const totalH = 7.5 - gridTop - 0.4;
  const cellW = (totalW - gapX * (cols - 1)) / cols;
  const cellH = (totalH - gapY * (rows - 1)) / rows;

  sectorConfig.categories.forEach((cat, i) => {
    const news = categoryArticles[cat];
    if (!news) return;
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = gridLeft + (cellW + gapX) * col;
    const y = gridTop + (cellH + gapY) * row;
    addKMNCard(slide, news, cat, x, y, cellW, cellH);
  });
}

function addKMNCard(slide, news, category, x, y, w, h) {
  const fontScale = 0.78;
  const titleSize = Math.round(13 * fontScale);
  const catSize = Math.round(10 * fontScale);
  const bodySize = Math.round(10 * fontScale);
  const sourceSize = Math.round(9 * fontScale);
  const linkSize = Math.round(9 * fontScale);
  const pad = 0.2;

  slide.addShape('rect', {
    x, y, w, h,
    fill: { color: COLOR_WHITE },
    line: { color: COLOR_LIGHT_GRAY, width: 1 },
  });
  slide.addShape('rect', {
    x, y, w: 0.05, h,
    fill: { color: COLOR_BLUE }, line: { type: 'none' },
  });

  let curY = y + pad;
  const innerX = x + pad + 0.05;
  const innerW = w - pad * 2 - 0.05;

  const catH = 0.24 * fontScale + 0.04;
  slide.addText(category, {
    x: innerX, y: curY, w: innerW, h: catH,
    fontSize: catSize, bold: true, color: COLOR_BLUE, fontFace: FONT,
  });
  curY += catH + 0.02;

  const titleH = 0.5 * fontScale + 0.1;
  slide.addText(news.title || '', {
    x: innerX, y: curY, w: innerW, h: titleH,
    fontSize: titleSize, bold: true, color: COLOR_DARK, fontFace: FONT,
    lineSpacingMultiple: 1.15,
  });
  curY += titleH + 0.04;

  const analysisText = news.summary_long || news.summary || '';
  let sentences = analysisText.split(/(?<=[.。!?])\s+/).filter(s => s.trim().length > 0);
  if (sentences.length === 0) sentences = [analysisText];

  const footerReserve = 0.5 * fontScale;
  const bodyTop = curY;
  const bodyH = (y + h) - bodyTop - footerReserve;

  const paragraphs = sentences.map((s, i) => ({
    text: '• ' + s.trim(),
    options: {
      fontSize: bodySize,
      color: COLOR_DARK,
      fontFace: FONT,
      breakLine: i < sentences.length - 1,
    },
  }));

  slide.addText(paragraphs, {
    x: innerX, y: bodyTop, w: innerW, h: bodyH,
    valign: 'top', lineSpacingMultiple: 1.3,
    paraSpaceAfter: 2,
  });

  const footerY = y + h - footerReserve + 0.06;
  slide.addShape('rect', {
    x: innerX, y: footerY - 0.04, w: innerW, h: 0.005,
    fill: { color: COLOR_LIGHT_GRAY }, line: { type: 'none' },
  });
  slide.addText(`출처: ${news.source || ''}`, {
    x: innerX, y: footerY, w: innerW * 0.5, h: 0.32,
    fontSize: sourceSize, bold: true, color: COLOR_DARK, fontFace: FONT,
    valign: 'middle',
  });
  slide.addText('원문 보기 →', {
    x: innerX + innerW * 0.5, y: footerY, w: innerW * 0.5, h: 0.32,
    fontSize: linkSize, bold: true, color: COLOR_BLUE, fontFace: FONT,
    align: 'right', valign: 'middle',
    hyperlink: { url: news.source_url || '' },
  });
}

function buildImplications(pres, insights) {
  const slide = pres.addSlide();
  addLogoTopRight(slide);
  addSectionTitle(slide, 'Implications & Trends');

  const insTop = 1.3;
  const insLeft = 0.625;
  const insW = 12.08;
  const insGap = 0.2;
  const insH = 1.25;

  insights.slice(0, 4).forEach((ins, i) => {
    const y = insTop + (insH + insGap) * i;
    slide.addShape('rect', {
      x: insLeft, y, w: insW, h: insH,
      fill: { color: COLOR_BG_GRAY },
      line: { color: COLOR_LIGHT_GRAY, width: 1 },
    });
    const numSize = 0.7;
    const numY = y + (insH - numSize) / 2;
    const numX = insLeft + 0.3;
    slide.addShape('ellipse', {
      x: numX, y: numY, w: numSize, h: numSize,
      fill: { color: COLOR_BLUE }, line: { type: 'none' },
    });
    slide.addText(`0${i + 1}`, {
      x: numX, y: numY, w: numSize, h: numSize,
      fontSize: 18, bold: true, color: COLOR_WHITE, fontFace: FONT,
      align: 'center', valign: 'middle',
    });
    const textX = numX + numSize + 0.3;
    const textW = insW - (numSize + 0.6 + 0.3);
    slide.addText(ins.title || '', {
      x: textX, y: y + 0.2, w: textW, h: 0.4,
      fontSize: 14, bold: true, color: COLOR_DARK, fontFace: FONT,
    });
    slide.addText(ins.detail || '', {
      x: textX, y: y + 0.6, w: textW, h: 0.6,
      fontSize: 11, color: COLOR_GRAY, fontFace: FONT,
    });
  });
}

// ===== Main handler =====
export default async function handler(req, res) {
  const range = (req.query.range || 'week').toString();
  const sector = (req.query.sector || 'ev').toString();
  const days = range === 'month' ? 30 : 7;

  if (!['ev', 'cpo'].includes(sector)) {
    return res.status(400).json({ error: 'Invalid sector. Use ev or cpo.' });
  }

  const sectorConfig = SECTOR_CONFIG[sector];

  try {
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
    const { data: articles, error } = await supabase
      .from('news')
      .select('country, sector, title, summary, summary_long, category, source, source_url, pub_date')
      .eq('sector', sector)
      .gte('pub_date', cutoff)
      .order('pub_date', { ascending: false })
      .limit(500);

    if (error) {
      console.error('DB error:', error);
      return res.status(500).json({ error: error.message });
    }
    if (!articles || articles.length < 6) {
      return res.status(400).json({
        error: '데이터가 부족합니다. 최소 6개 이상 필요해요.'
      });
    }

    const stats = {
      total: articles.length,
      byCountry: {},
      byCategory: {},
    };
    for (const a of articles) {
      stats.byCountry[a.country] = (stats.byCountry[a.country] || 0) + 1;
      if (a.category) {
        stats.byCategory[a.category] = (stats.byCategory[a.category] || 0) + 1;
      }
    }

    const articlesByCountry = { korea: [], japan: [], us: [] };
    for (const a of articles) {
      if (articlesByCountry[a.country] && articlesByCountry[a.country].length < 8) {
        articlesByCountry[a.country].push(a);
      }
    }

    const analysisSet = [
      ...articlesByCountry.korea,
      ...articlesByCountry.japan,
      ...articlesByCountry.us,
    ];

    const sortedByDate = [...articles].sort(
      (a, b) => new Date(a.pub_date) - new Date(b.pub_date)
    );
    const oldest = sortedByDate[0];
    const newest = sortedByDate[sortedByDate.length - 1];
    const weekStart = formatDate(oldest.pub_date);
    const weekEnd = formatDate(newest.pub_date);
    const periodLabel = `${weekStart} ~ ${weekEnd}`;

    let analysis;
    try {
      analysis = await generateAnalysis(analysisSet, periodLabel, sectorConfig);
    } catch (e) {
      console.error('Claude analysis failed:', e);
      analysis = {
        highlights: analysisSet.slice(0, 3).map(a => a.title),
        category_picks: {},
        implications: [],
      };
    }

    const categoryArticles = {};
    for (const cat of sectorConfig.categories) {
      const pickIdx = analysis.category_picks?.[cat];
      if (pickIdx && analysisSet[pickIdx - 1]) {
        categoryArticles[cat] = analysisSet[pickIdx - 1];
      } else {
        categoryArticles[cat] = analysisSet.find(a => a.category === cat)
                              || analysisSet[0];
      }
    }

    // ===== Build PPT =====
    const pres = new pptxgen();
    pres.layout = 'LAYOUT_WIDE';

    const reportTitle = range === 'month'
      ? sectorConfig.titleMonth
      : sectorConfig.title;

    buildTitleSlide(pres, weekStart, weekEnd, reportTitle);
    buildExecSummary(pres, stats, analysis.highlights || [], sectorConfig);
    buildAllArticlesIndex(pres, articlesByCountry, sectorConfig);
    buildKMNGrid(pres, categoryArticles, sectorConfig);
    buildImplications(pres, analysis.implications || []);

    const buffer = await pres.write({ outputType: 'nodebuffer' });

    const today = formatDate(new Date());
    const sectorLabel = sector === 'cpo' ? 'CPO' : 'EV';
    const rangeSuffix = range === 'month' ? '30days' : '7days';
    const filename = `${sectorLabel}-Report_${today}_${rangeSuffix}.pptx`;

    res.setHeader('Content-Type',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Cache-Control', 'no-store');
    res.status(200).send(Buffer.from(buffer));
  } catch (e) {
    console.error('PPT generation failed:', e);
    res.status(500).json({ error: e.message });
  }
}
