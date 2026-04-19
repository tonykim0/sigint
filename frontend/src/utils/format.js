// 숫자 포맷 유틸 — 한국식 억/조 단위 + 등락률 컬러.

const JO = 1_0000_0000_0000; // 1조 = 10^12
const UK = 1_0000_0000; // 1억 = 10^8

export function formatKRWCompact(value) {
  if (value == null || isNaN(value)) return '—';
  const sign = value < 0 ? '-' : '';
  const n = Math.abs(value);
  if (n >= JO) return `${sign}${(n / JO).toFixed(2)}조`;
  if (n >= UK) return `${sign}${(n / UK).toFixed(0)}억`;
  if (n >= 1_0000) return `${sign}${(n / 1_0000).toFixed(0)}만`;
  return `${sign}${n.toLocaleString('ko-KR')}`;
}

export function formatInt(value) {
  if (value == null || isNaN(value)) return '—';
  return Math.round(value).toLocaleString('ko-KR');
}

export function formatChangeRate(rate) {
  if (rate == null || isNaN(rate)) return '—';
  const sign = rate > 0 ? '+' : '';
  return `${sign}${rate.toFixed(2)}%`;
}

// 한국식: 상승=빨강, 하락=파랑, 0=회색
export function changeColor(rate) {
  if (rate == null || rate === 0) return 'text-fg-muted';
  return rate > 0 ? 'text-up' : 'text-down';
}

// NOTE: ETF/우선주/거래대금 필터는 백엔드 universe.py 에서 일괄 처리하므로
// 프론트 사이드에 같은 로직을 두지 않는다.

export function formatTime(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}
