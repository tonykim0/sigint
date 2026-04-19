// 백엔드 API 클라이언트 (fetch 기반).
// 데모 모드: 서버 미연결 시 빈 데이터 반환 대신 에러 throw. 상위에서 잡아 UI 상태 결정.

const BASE = import.meta.env.VITE_API_BASE || 'http://127.0.0.1:8000';
const API_TIMING_LOG =
  import.meta.env.DEV || import.meta.env.VITE_LOG_API_TIMING === 'true';
const SLOW_REQUEST_MS = 700;

// stale-while-revalidate 메모리 캐시.
// 같은 GET 경로를 탭 전환/중복 호출로 재요청할 때 즉시 캐시된 값 반환하고
// 백그라운드로 신선한 데이터를 받아 다음 접근용으로 채워둔다.
const _cacheStore = new Map(); // path -> { ts, data }
const _inflight = new Map();    // path -> Promise (동시 중복 요청 합침)
const DEFAULT_TTL = 60_000;      // 1분

async function request(path, { method = 'GET', body } = {}) {
  const init = { method };
  if (body !== undefined) {
    init.headers = { 'Content-Type': 'application/json' };
    init.body = JSON.stringify(body);
  }
  const started = performance.now();
  const resp = await fetch(`${BASE}${path}`, init);
  const totalMs = performance.now() - started;
  const serverMs = Number(resp.headers.get('X-Process-Time'));

  if (API_TIMING_LOG) {
    const summary = `${method} ${path} total=${totalMs.toFixed(1)}ms${
      Number.isFinite(serverMs) ? ` server=${serverMs.toFixed(1)}ms` : ''
    }`;
    if (totalMs >= SLOW_REQUEST_MS) {
      console.warn(`[api-slow] ${summary}`);
    } else {
      console.debug(`[api] ${summary}`);
    }
  }

  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    throw new Error(`HTTP ${resp.status}: ${text.slice(0, 200)}`);
  }
  return resp.json();
}

function getJSON(path, { ttl = DEFAULT_TTL, swr = true } = {}) {
  const cached = _cacheStore.get(path);
  const now = Date.now();
  const fresh = cached && now - cached.ts < ttl;

  if (cached && swr) {
    if (fresh) {
      // 캐시 신선: 즉시 반환
      return Promise.resolve(cached.data);
    }
    // stale: 일단 오래된 값 반환, 백그라운드로 갱신
    _refreshInBackground(path);
    return Promise.resolve(cached.data);
  }

  return _fetchAndCache(path);
}

function _fetchAndCache(path) {
  const existing = _inflight.get(path);
  if (existing) return existing;
  const p = request(path)
    .then((data) => {
      _cacheStore.set(path, { ts: Date.now(), data });
      return data;
    })
    .finally(() => _inflight.delete(path));
  _inflight.set(path, p);
  return p;
}

function _refreshInBackground(path) {
  if (_inflight.has(path)) return;
  _fetchAndCache(path).catch(() => {});
}

// 캐시 무효화가 필요한 경우 사용 (매매일지 등 쓰기 후)
export function invalidateCache(prefix = '') {
  if (!prefix) {
    _cacheStore.clear();
    return;
  }
  for (const key of _cacheStore.keys()) {
    if (key.startsWith(prefix)) _cacheStore.delete(key);
  }
}

// hover prefetch 등 명시적 예열용
export function prefetch(path) {
  _refreshInBackground(path);
}

export const api = {
  health: () => getJSON('/api/health'),
  volumeRank: ({ market = 'ALL', topN = 60 } = {}) =>
    getJSON(`/api/volume-rank?market=${market}&top_n=${topN}`),
  tradingUniverse: ({ market = 'ALL', limit = 60, force = false } = {}) =>
    getJSON(
      `/api/trading-universe?market=${market}&limit=${limit}${force ? '&force=true' : ''}`,
    ),
  price: (code) => getJSON(`/api/price/${code}`),
  chart: (code, { days = 180, indicators = true } = {}) =>
    getJSON(
      `/api/chart/${code}?period=D&days=${days}&indicators=${indicators}`,
    ),
  chartAnalysis: (code, { days = 120 } = {}) =>
    getJSON(`/api/chart-analysis/${code}?days=${days}`),
  investorTrend: (code) => getJSON(`/api/investor-trend/${code}`),
  minuteChart: (code, { timeUnit = 1, days = 1 } = {}) =>
    getJSON(`/api/minute-chart/${code}?time_unit=${timeUnit}&days=${days}`),
  index: () => getJSON('/api/index'),
  investorSummary: ({ topN = 10, force = false } = {}) =>
    getJSON(`/api/investor-summary?top_n=${topN}${force ? '&force=true' : ''}`),
  marketFlow: () => getJSON('/api/market-flow'),
  search: (q) => getJSON(`/api/search?q=${encodeURIComponent(q)}`),
  themes: () => getJSON('/api/themes'),
  themeTrend: (days = 7, { limit = 60 } = {}) =>
    getJSON(`/api/theme-trend?days=${days}&limit=${limit}`),
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
    add: (payload) => request('/api/journal', { method: 'POST', body: payload })
      .then((r) => (invalidateCache('/api/journal'), r)),
    update: (id, payload) =>
      request(`/api/journal/${id}`, { method: 'PUT', body: payload })
        .then((r) => (invalidateCache('/api/journal'), r)),
    delete: (id) => request(`/api/journal/${id}`, { method: 'DELETE' })
      .then((r) => (invalidateCache('/api/journal'), r)),
    remove: (id) => request(`/api/journal/${id}`, { method: 'DELETE' })
      .then((r) => (invalidateCache('/api/journal'), r)),
    tracking: (id) => request(`/api/journal/${id}/tracking`)
      .then((r) => (invalidateCache('/api/journal'), r)),
  },
  daily: {
    save: (market = 'ALL') =>
      request(`/api/daily-save?market=${market}`, { method: 'POST' }),
    list: () => getJSON('/api/daily-history'),
    byDate: (date, market = 'ALL') =>
      getJSON(`/api/daily-history?date=${date}&market=${market}`),
    compare: (d1, d2, market = 'ALL') =>
      getJSON(`/api/daily-history/compare?d1=${d1}&d2=${d2}&market=${market}`),
  },
};
