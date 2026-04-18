// 백엔드 API 클라이언트 (fetch 기반).
// 데모 모드: 서버 미연결 시 빈 데이터 반환 대신 에러 throw. 상위에서 잡아 UI 상태 결정.

const BASE = import.meta.env.VITE_API_BASE || 'http://127.0.0.1:8000';

// 스크리너는 첫 요청 시 KIS 호출이 30여 개 누적돼 20초까지 걸릴 수 있어 별도 TTL 적용.
const DEFAULT_TIMEOUT_MS = 15000;
const SCREENER_TIMEOUT_MS = 30000;

async function request(path, { method = 'GET', body, timeout = DEFAULT_TIMEOUT_MS } = {}) {
  const init = { method };
  if (body !== undefined) {
    init.headers = { 'Content-Type': 'application/json' };
    init.body = JSON.stringify(body);
  }
  const controller = new AbortController();
  const timerId = setTimeout(() => controller.abort(), timeout);
  init.signal = controller.signal;
  try {
    const resp = await fetch(`${BASE}${path}`, init);
    if (!resp.ok) {
      const text = await resp.text().catch(() => '');
      throw new Error(`HTTP ${resp.status}: ${text.slice(0, 200)}`);
    }
    return await resp.json();
  } catch (e) {
    if (e.name === 'AbortError') {
      throw new Error(`요청 시간 초과 (${Math.round(timeout / 1000)}s)`);
    }
    throw e;
  } finally {
    clearTimeout(timerId);
  }
}

const getJSON = (p, opts) => request(p, opts);

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
  search: (q) => getJSON(`/api/search?q=${encodeURIComponent(q)}`),
  themes: () => getJSON('/api/themes'),
  sectors: (codes) =>
    request('/api/sectors', { method: 'POST', body: { codes } }),
  screener: {
    closingBet: ({ force = false } = {}) =>
      getJSON(`/api/screener/closing-bet${force ? '?force=true' : ''}`, {
        timeout: SCREENER_TIMEOUT_MS,
      }),
    marketRegime: ({ force = false } = {}) =>
      getJSON(`/api/screener/market-regime${force ? '?force=true' : ''}`, {
        timeout: SCREENER_TIMEOUT_MS,
      }),
    pullbackSwing: ({ force = false } = {}) =>
      getJSON(`/api/screener/pullback-swing${force ? '?force=true' : ''}`, {
        timeout: SCREENER_TIMEOUT_MS,
      }),
    breakoutSwing: ({ force = false } = {}) =>
      getJSON(`/api/screener/breakout-swing${force ? '?force=true' : ''}`, {
        timeout: SCREENER_TIMEOUT_MS,
      }),
    trendTemplate: (code) => getJSON(`/api/screener/trend-template/${code}`),
    vcp: (code) => getJSON(`/api/screener/vcp/${code}`),
    darvasBox: (code) => getJSON(`/api/screener/darvas-box/${code}`),
    referenceCandle: (code, lookback = 10) =>
      getJSON(`/api/screener/reference-candle/${code}?lookback=${lookback}`),
  },
  // keep legacy key for backwards compat
  closingBet: ({ force = false } = {}) =>
    getJSON(`/api/screener/closing-bet${force ? '?force=true' : ''}`, {
      timeout: SCREENER_TIMEOUT_MS,
    }),
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
