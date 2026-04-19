// 백엔드 API 클라이언트 (fetch 기반).
// 데모 모드: 서버 미연결 시 빈 데이터 반환 대신 에러 throw. 상위에서 잡아 UI 상태 결정.

const BASE = import.meta.env.VITE_API_BASE || 'http://127.0.0.1:8000';

async function request(path, { method = 'GET', body } = {}) {
  const init = { method };
  if (body !== undefined) {
    init.headers = { 'Content-Type': 'application/json' };
    init.body = JSON.stringify(body);
  }
  const resp = await fetch(`${BASE}${path}`, init);
  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    throw new Error(`HTTP ${resp.status}: ${text.slice(0, 200)}`);
  }
  return resp.json();
}

const getJSON = (p) => request(p);

export const api = {
  health: () => getJSON('/api/health'),
  volumeRank: ({ market = 'ALL', topN = 60 } = {}) =>
    getJSON(`/api/volume-rank?market=${market}&top_n=${topN}`),
  price: (code) => getJSON(`/api/price/${code}`),
  chart: (code, { days = 180, indicators = true } = {}) =>
    getJSON(
      `/api/chart/${code}?period=D&days=${days}&indicators=${indicators}`,
    ),
  investorTrend: (code) => getJSON(`/api/investor-trend/${code}`),
  minuteChart: (code, { timeUnit = 1 } = {}) =>
    getJSON(`/api/minute-chart/${code}?time_unit=${timeUnit}`),
  index: () => getJSON('/api/index'),
  investorSummary: (topN = 10) => getJSON(`/api/investor-summary?top_n=${topN}`),
  marketFlow: () => getJSON('/api/market-flow'),
  search: (q) => getJSON(`/api/search?q=${encodeURIComponent(q)}`),
  themes: () => getJSON('/api/themes'),
  screener: {
    closingBet: ({ force = false } = {}) =>
      getJSON(`/api/screener/closing-bet${force ? '?force=true' : ''}`),
    marketRegime: ({ force = false } = {}) =>
      getJSON(`/api/screener/market-regime${force ? '?force=true' : ''}`),
    pullbackSwing: ({ force = false } = {}) =>
      getJSON(`/api/screener/pullback-swing${force ? '?force=true' : ''}`),
    breakoutSwing: ({ force = false } = {}) =>
      getJSON(`/api/screener/breakout-swing${force ? '?force=true' : ''}`),
    trendTemplate: (code) => getJSON(`/api/screener/trend-template/${code}`),
    vcp: (code) => getJSON(`/api/screener/vcp/${code}`),
    darvasBox: (code) => getJSON(`/api/screener/darvas-box/${code}`),
    referenceCandle: (code, lookback = 10) =>
      getJSON(`/api/screener/reference-candle/${code}?lookback=${lookback}`),
  },
  // keep legacy key for backwards compat
  closingBet: ({ force = false } = {}) =>
    getJSON(`/api/screener/closing-bet${force ? '?force=true' : ''}`),
  journal: {
    list: () => getJSON('/api/journal'),
    stats: () => getJSON('/api/journal/stats'),
    add: (payload) => request('/api/journal', { method: 'POST', body: payload }),
    update: (id, payload) =>
      request(`/api/journal/${id}`, { method: 'PUT', body: payload }),
    delete: (id) => request(`/api/journal/${id}`, { method: 'DELETE' }),
    remove: (id) => request(`/api/journal/${id}`, { method: 'DELETE' }),
    tracking: (id) => getJSON(`/api/journal/${id}/tracking`),
  },
  daily: {
    save: (market = 'ALL') =>
      request(`/api/daily-save?market=${market}`, { method: 'POST' }),
    list: () => getJSON('/api/daily-history'),
    byDate: (date) => getJSON(`/api/daily-history?date=${date}`),
    compare: (d1, d2) => getJSON(`/api/daily-history/compare?d1=${d1}&d2=${d2}`),
  },
};
