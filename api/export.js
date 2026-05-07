import { createClient } from '@supabase/supabase-js';
import * as XLSX from 'xlsx';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

const COUNTRY_LABELS = {
  korea: '한국',
  japan: '일본',
  us: '미국',
};

const SECTOR_LABELS = {
  ev: 'EV',
  cpo: 'CPO',
};

function formatDate(d) {
  if (!d) return '';
  const date = new Date(d);
  if (isNaN(date.getTime())) return '';
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  const hh = String(date.getHours()).padStart(2, '0');
  const mi = String(date.getMinutes()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd} ${hh}:${mi}`;
}

function formatDateOnly(d) {
  const date = new Date(d);
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

export default async function handler(req, res) {
  const range = (req.query.range || 'week').toString();
  const sector = (req.query.sector || 'ev').toString();

  const allowedRanges = ['week', 'month', 'all'];
  const allowedSectors = ['ev', 'cpo'];

  if (!allowedRanges.includes(range)) {
    return res.status(400).json({ error: 'Invalid range. Use week, month, or all.' });
  }
  if (!allowedSectors.includes(sector)) {
    return res.status(400).json({ error: 'Invalid sector. Use ev or cpo.' });
  }

  // Build query
  let query = supabase
    .from('news')
    .select('country, sector, title, summary, summary_long, category, source, source_url, pub_date, original_title')
    .eq('sector', sector)
    .order('pub_date', { ascending: false });

  if (range === 'week') {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    query = query.gte('pub_date', sevenDaysAgo);
  } else if (range === 'month') {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    query = query.gte('pub_date', thirtyDaysAgo);
  }

  query = query.limit(10000);

  const { data, error } = await query;

  if (error) {
    console.error('export DB error:', error);
    return res.status(500).json({ error: error.message });
  }

  if (!data || data.length === 0) {
    return res.status(404).json({ error: '해당 기간에 데이터가 없습니다.' });
  }

  // Transform rows for Excel
  const rows = data.map((row) => ({
    날짜: formatDate(row.pub_date),
    국가: COUNTRY_LABELS[row.country] || row.country,
    카테고리: row.category || '',
    제목: row.title || '',
    '요약 (짧은)': row.summary || '',
    '심층 분석 (4문장)': row.summary_long || row.summary || '',
    출처: row.source || '',
    '원문 링크': row.source_url || '',
    원제: row.original_title || '',
  }));

  // Create workbook and worksheet
  const ws = XLSX.utils.json_to_sheet(rows);

  // Set column widths
  ws['!cols'] = [
    { wch: 17 },  // 날짜
    { wch: 7 },   // 국가
    { wch: 12 },  // 카테고리
    { wch: 50 },  // 제목
    { wch: 60 },  // 요약 (짧은)
    { wch: 90 },  // 심층 분석
    { wch: 18 },  // 출처
    { wch: 60 },  // 원문 링크
    { wch: 50 },  // 원제
  ];

  // Enable text wrap on summary columns
  const range_addr = XLSX.utils.decode_range(ws['!ref']);
  for (let R = range_addr.s.r + 1; R <= range_addr.e.r; ++R) {
    for (let C of [4, 5]) {
      const cellRef = XLSX.utils.encode_cell({ r: R, c: C });
      if (ws[cellRef]) {
        ws[cellRef].s = { alignment: { wrapText: true, vertical: 'top' } };
      }
    }
  }

  const wb = XLSX.utils.book_new();
  const sheetName = sector === 'cpo' ? 'CPO News' : 'EV News';
  XLSX.utils.book_append_sheet(wb, ws, sheetName);

  // Generate buffer
  const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

  // Generate filename
  const today = formatDateOnly(new Date());
  const sectorLabel = SECTOR_LABELS[sector];
  const rangeSuffix = range === 'week' ? '7days' : range === 'month' ? '30days' : 'all';
  const filename = `EV-Daily_${sectorLabel}_${today}_${rangeSuffix}.xlsx`;

  res.setHeader(
    'Content-Type',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  );
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.setHeader('Cache-Control', 'no-store');
  res.status(200).send(buffer);
}
