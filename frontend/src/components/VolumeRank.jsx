import { useEffect, useMemo, useState } from 'react';
import { api } from '../utils/api.js';
import {
  changeColor,
  formatChangeRate,
  formatInt,
  formatKRWCompact,
} from '../utils/format.js';
import Card from './Card.jsx';

const MARKETS = [
  { id: 'ALL', label: 'ALL' },
  { id: 'KOSPI', label: 'KOSPI' },
  { id: 'KOSDAQ', label: 'KOSDAQ' },
];

const REFRESH_OPTIONS = [
  { value: 10, label: '10초' },
  { value: 15, label: '15초' },
  { value: 30, label: '30초' },
  { value: 0, label: '수동' },
];

function isMarketOpen() {
  const now = new Date();
  const kst = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Seoul' }));
  const h = kst.getHours();
  const m = kst.getMinutes();
  const total = h * 60 + m;
  const day = kst.getDay();
  return day >= 1 && day <= 5 && total >= 9 * 60 && total < 15 * 60 + 30;
}

const COLS = [
  { key: 'rank', label: '#', align: 'text-right', width: 'w-10' },
  { key: 'name', label: '종목명', align: 'text-left' },
  { key: 'price', label: '현재가', align: 'text-right' },
  { key: 'change_rate', label: '등락률', align: 'text-right' },
  { key: 'volume', label: '거래량', align: 'text-right' },
  { key: 'trade_value', label: '거래대금', align: 'text-right' },
];

function buildCodeThemeMap(themes) {
  // { code: { theme, color } }
  const map = {};
  for (const [theme, info] of Object.entries(themes || {})) {
    for (const code of info.codes || []) {
      map[code] = { theme, color: info.color };
    }
  }
  return map;
}

// KIS bstp_kor_isnm(업종명) → 고정 컬러. themes.json 에 없는 종목을 자동 분류할 때 사용.
// 문자열 해시로 팔레트 회전시키므로 신규 업종도 일관된 색상이 붙는다.
const SECTOR_PALETTE = [
  '#60a5fa', '#a78bfa', '#34d399', '#fb923c', '#f472b6',
  '#22d3ee', '#fbbf24', '#f87171', '#818cf8', '#4ade80',
  '#c084fc', '#fb7185', '#38bdf8', '#facc15', '#a3e635',
];

function sectorColor(name) {
  if (!name) return '#4b5563';
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) | 0;
  return SECTOR_PALETTE[Math.abs(h) % SECTOR_PALETTE.length];
}

function resolveTheme(item, codeMap) {
  const entry = codeMap[item.code];
  if (entry) return { theme: entry.theme, color: entry.color, source: 'theme' };
  const sector = (item.sector || '').trim();
  if (sector) return { theme: sector, color: sectorColor(sector), source: 'sector' };
  return { theme: '기타', color: '#4b5563', source: 'fallback' };
}

function buildGroups(items, codeMap) {
  const buckets = {}; // { theme: { color, items } }
  for (const item of items) {
    const { theme, color } = resolveTheme(item, codeMap);
    if (!buckets[theme]) buckets[theme] = { theme, color, items: [] };
    buckets[theme].items.push(item);
  }
  // sort by total trade_value desc; 기타 always last
  return Object.values(buckets).sort((a, b) => {
    if (a.theme === '기타') return 1;
    if (b.theme === '기타') return -1;
    const tvA = a.items.reduce((s, r) => s + (r.trade_value || 0), 0);
    const tvB = b.items.reduce((s, r) => s + (r.trade_value || 0), 0);
    return tvB - tvA;
  });
}

function getLeaders(items) {
  if (!items.length) return { topTV: null, topCR: null };
  const topTV = items.reduce((a, b) =>
    (a.trade_value || 0) >= (b.trade_value || 0) ? a : b,
  );
  const topCR = items.reduce((a, b) =>
    (a.change_rate || 0) >= (b.change_rate || 0) ? a : b,
  );
  return { topTV, topCR };
}

function LeaderBadge({ code, leaders }) {
  const { topTV, topCR } = leaders;
  const isTV = topTV?.code === code;
  const isCR = topCR?.code === code;
  if (isTV && isCR) {
    return (
      <span className="inline-block px-1.5 py-0.5 text-[10px] rounded bg-up/15 text-up border border-up/40 ml-1">
        대장주
      </span>
    );
  }
  if (isTV) {
    return (
      <span className="inline-block px-1.5 py-0.5 text-[10px] rounded bg-warn/15 text-warn border border-warn/40 ml-1">
        거래량대장
      </span>
    );
  }
  return null;
}

export default function VolumeRank({ onSelectCode }) {
  const [market, setMarket] = useState('ALL');
  const [items, setItems] = useState([]);
  const [themes, setThemes] = useState({});
  const [sectorMap, setSectorMap] = useState({}); // { code: 업종명 } — themes.json fallback
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);
  const [sort, setSort] = useState({ key: 'trade_value', dir: 'desc' });
  const [view, setView] = useState('list');
  const [refreshSec, setRefreshSec] = useState(15);
  const [lastUpdated, setLastUpdated] = useState(null);

  useEffect(() => {
    api
      .themes()
      .then((d) => setThemes(d.themes || {}))
      .catch(() => {});
  }, []);

  // 신규 종목이 items 에 포함되면 백그라운드로 업종 fetch.
  // sectorMap 은 누적만 되므로 캐시 히트율이 높다.
  useEffect(() => {
    if (!items.length) return;
    const missing = items.map((r) => r.code).filter((c) => !(c in sectorMap));
    if (missing.length === 0) return;
    let cancelled = false;
    api
      .sectors(missing)
      .then((d) => {
        if (cancelled) return;
        setSectorMap((prev) => ({ ...prev, ...(d.sectors || {}) }));
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [items, sectorMap]);

  const fetchItems = (mkt) => {
    setLoading(true);
    setErr(null);
    return api
      .volumeRank({ market: mkt, topN: 60 })
      .then((d) => {
        setItems(d.items || []);
        setLastUpdated(new Date());
      })
      .catch((e) => { setItems([]); setErr(e.message); })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    let cancelled = false;

    async function refreshItems() {
      try {
        const data = await api.volumeRank({ market, topN: 60 });
        if (cancelled) return;
        setItems(data.items || []);
        setLastUpdated(new Date());
        setErr(null);
      } catch (e) {
        if (!cancelled) {
          setItems([]);
          setErr(e.message);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void refreshItems();
    if (refreshSec === 0 || !isMarketOpen()) return;
    const id = setInterval(() => {
      if (!cancelled) void refreshItems();
    }, refreshSec * 1000);
    return () => { cancelled = true; clearInterval(id); };
  }, [market, refreshSec]);

  // items 에 sectorMap 을 주입한 enriched 배열.
  const enrichedItems = useMemo(
    () => items.map((r) => ({ ...r, sector: r.sector || sectorMap[r.code] || '' })),
    [items, sectorMap],
  );

  const codeMap = useMemo(() => buildCodeThemeMap(themes), [themes]);

  const sorted = useMemo(() => {
    const arr = [...enrichedItems];
    const { key, dir } = sort;
    arr.sort((a, b) => {
      const av = a[key];
      const bv = b[key];
      if (typeof av === 'string')
        return dir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av);
      return dir === 'asc' ? (av || 0) - (bv || 0) : (bv || 0) - (av || 0);
    });
    return arr;
  }, [enrichedItems, sort]);

  const groups = useMemo(
    () => buildGroups(enrichedItems, codeMap),
    [enrichedItems, codeMap],
  );

  const total = useMemo(
    () => items.reduce((s, r) => s + (r.trade_value || 0), 0),
    [items],
  );

  function toggleSort(key) {
    setSort((prev) =>
      prev.key === key
        ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' }
        : { key, dir: 'desc' },
    );
  }

  return (
    <Card
      title="거래대금 상위"
      subtitle={`TOP ${items.length}`}
      right={<span>합계 {formatKRWCompact(total)}</span>}
    >
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        {/* 갱신 시각 + 자동새로고침 */}
        <div className="w-full flex items-center gap-2 mb-1 text-xs">
          {lastUpdated && (
            <span className="text-fg-muted">
              갱신 {lastUpdated.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </span>
          )}
          {isMarketOpen() ? (
            <span className="text-up">● 장중</span>
          ) : (
            <span className="text-fg-muted">● 장외</span>
          )}
          <div className="ml-auto flex items-center gap-1">
            {REFRESH_OPTIONS.map((o) => (
              <button
                key={o.value}
                onClick={() => setRefreshSec(o.value)}
                className={`px-2 py-0.5 rounded text-xs border transition-colors ${
                  refreshSec === o.value
                    ? 'bg-accent/15 border-accent text-accent'
                    : 'border-border text-fg-muted hover:text-fg-bright'
                }`}
              >
                {o.label}
              </button>
            ))}
            <button
              onClick={() => fetchItems(market)}
              disabled={loading}
              className="px-2 py-0.5 rounded text-xs border border-border text-fg-muted hover:text-fg-bright disabled:opacity-50 ml-1"
            >
              ↺
            </button>
          </div>
        </div>

        {MARKETS.map((m) => {
          const active = m.id === market;
          return (
            <button
              key={m.id}
              onClick={() => setMarket(m.id)}
              className={`px-3 py-1 text-xs rounded-md border transition-colors ${
                active
                  ? 'bg-accent/15 border-accent text-accent'
                  : 'border-border text-fg-muted hover:text-fg-bright'
              }`}
            >
              {m.label}
            </button>
          );
        })}

        <div className="ml-auto flex items-center rounded-md overflow-hidden border border-border">
          <button
            onClick={() => setView('list')}
            className={`px-3 py-1 text-xs transition-colors ${
              view === 'list'
                ? 'bg-accent/15 text-accent'
                : 'text-fg-muted hover:text-fg-bright'
            }`}
          >
            리스트 뷰
          </button>
          <button
            onClick={() => setView('theme')}
            className={`px-3 py-1 text-xs transition-colors border-l border-border ${
              view === 'theme'
                ? 'bg-accent/15 text-accent'
                : 'text-fg-muted hover:text-fg-bright'
            }`}
          >
            테마 뷰
          </button>
        </div>

        {loading && <span className="text-xs text-fg-muted">조회 중…</span>}
        {err && <span className="text-xs text-warn">{err}</span>}
      </div>

      {view === 'list' ? (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-fg-muted border-b border-border">
                {COLS.map((c) => {
                  const active = sort.key === c.key;
                  return (
                    <th
                      key={c.key}
                      className={`py-2 px-2 font-medium ${c.align} ${c.width || ''} cursor-pointer select-none ${active ? 'text-accent' : 'hover:text-fg-bright'}`}
                      onClick={() => toggleSort(c.key)}
                    >
                      {c.label}
                      {active && (
                        <span className="ml-1">
                          {sort.dir === 'asc' ? '↑' : '↓'}
                        </span>
                      )}
                    </th>
                  );
                })}
                <th className="py-2 px-2 text-left font-medium text-fg-muted">
                  테마/업종
                </th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((r, i) => {
                const themeInfo = resolveTheme(r, codeMap);
                const showTag = themeInfo.source !== 'fallback';
                const isTVSort = sort.key === 'trade_value';
                return (
                  <tr
                    key={r.code}
                    className="border-b border-border/60 hover:bg-bg-inner cursor-pointer"
                    onClick={() => onSelectCode?.(r.code)}
                  >
                    <td className="py-2 px-2 text-right text-fg-muted">
                      {i + 1}
                    </td>
                    <td className="py-2 px-2">
                      <div className="text-fg-white font-semibold">
                        {r.name}
                      </div>
                      <div className="text-[11px] text-fg-muted">{r.code}</div>
                    </td>
                    <td className="py-2 px-2 text-right">
                      {formatInt(r.price)}
                    </td>
                    <td
                      className={`py-2 px-2 text-right ${changeColor(r.change_rate)}`}
                    >
                      {formatChangeRate(r.change_rate)}
                    </td>
                    <td className="py-2 px-2 text-right text-fg-muted">
                      {formatInt(r.volume)}
                    </td>
                    <td className={`py-2 px-2 text-right ${isTVSort ? 'text-fg-white font-semibold' : ''}`}>
                      {formatKRWCompact(r.trade_value)}
                    </td>
                    <td className="py-2 px-2">
                      {showTag && (
                        <span
                          className="inline-block px-1.5 py-0.5 rounded text-[10px] font-medium"
                          style={{
                            background: `${themeInfo.color}20`,
                            color: themeInfo.color,
                            border: `1px solid ${themeInfo.color}50`,
                          }}
                          title={themeInfo.source === 'sector' ? '업종 (자동 분류)' : '테마 (수동 매핑)'}
                        >
                          {themeInfo.theme}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
              {!loading && sorted.length === 0 && (
                <tr>
                  <td
                    colSpan={7}
                    className="py-8 text-center text-fg-muted"
                  >
                    데이터가 없습니다.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="space-y-4">
          {groups.map((group) => {
            const groupTotal = group.items.reduce(
              (s, r) => s + (r.trade_value || 0),
              0,
            );
            const leaders = getLeaders(group.items);
            const sortedItems = [...group.items].sort(
              (a, b) => (b.trade_value || 0) - (a.trade_value || 0),
            );
            return (
              <div key={group.theme} className="rounded-lg border border-border overflow-hidden">
                <div
                  className="flex items-center justify-between px-3 py-2"
                  style={{ background: `${group.color}15`, borderLeft: `3px solid ${group.color}` }}
                >
                  <div className="flex items-center gap-2">
                    <span
                      className="font-semibold text-sm"
                      style={{ color: group.color }}
                    >
                      {group.theme}
                    </span>
                    <span className="text-xs text-fg-muted">
                      {group.items.length}종목
                    </span>
                  </div>
                  <span className="text-sm text-fg-white font-medium">
                    {formatKRWCompact(groupTotal)}
                  </span>
                </div>
                <table className="w-full text-sm">
                  <tbody>
                    {sortedItems.map((r) => (
                      <tr
                        key={r.code}
                        className="border-t border-border/40 hover:bg-bg-inner cursor-pointer"
                        onClick={() => onSelectCode?.(r.code)}
                      >
                        <td className="py-2 px-3">
                          <div className="flex items-center gap-1">
                            <span className="text-fg-white font-medium">
                              {r.name}
                            </span>
                            <LeaderBadge code={r.code} leaders={leaders} />
                          </div>
                          <div className="text-[10px] text-fg-muted">
                            {r.code}
                          </div>
                        </td>
                        <td className="py-2 px-3 text-right">
                          {formatInt(r.price)}
                        </td>
                        <td
                          className={`py-2 px-3 text-right ${changeColor(r.change_rate)}`}
                        >
                          {formatChangeRate(r.change_rate)}
                        </td>
                        <td className="py-2 px-3 text-right text-fg-muted">
                          {formatKRWCompact(r.trade_value)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}
