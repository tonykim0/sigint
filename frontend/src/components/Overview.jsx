import { useEffect, useMemo, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { api } from '../utils/api.js';
import {
  changeColor,
  excludeETF,
  formatChangeRate,
  formatInt,
  formatKRWCompact,
  isPreferred,
} from '../utils/format.js';

const MIN_TRADE_VALUE = 10_000_000_000; // 100억
import Card from './Card.jsx';

// KIS 투자자 값: 백만원 → 원
const KIS_UNIT_ = 1_000_000;

// ── 지수 + 현물 수급 + 30일 히스토리 통합 카드 ─────────────────────
function MarketSummaryCard({ label, index, flow, indexLoading, flowLoading }) {
  const parts = flow ? [
    { key: 'foreign', label: '외인', value: (flow.foreign || 0) * KIS_UNIT_ },
    { key: 'institution', label: '기관', value: (flow.institution || 0) * KIS_UNIT_ },
    { key: 'individual', label: '개인', value: (flow.individual || 0) * KIS_UNIT_ },
  ] : null;

  // 30일 히스토리 데이터 (백만원 → 억원)
  const historyData = useMemo(() => {
    const UK_MN = 100;
    return (flow?.history || []).map((r) => ({
      date: r.date?.slice(5) || '',
      외인: +(r.foreign / UK_MN).toFixed(0),
      기관: +(r.institution / UK_MN).toFixed(0),
      개인: +(r.individual / UK_MN).toFixed(0),
    }));
  }, [flow]);

  return (
    <div className="bg-bg-card border border-border rounded-xl p-[18px]">
      {/* 지수 */}
      <div className="flex items-baseline justify-between mb-3">
        <div className="text-sm font-bold text-fg-white">{label}</div>
        {indexLoading ? (
          <span className="text-xs text-fg-muted">조회 중…</span>
        ) : index ? (
          <div className="text-right">
            <span className="text-2xl font-bold text-fg-white tabular-nums">
              {formatInt(index.price)}
            </span>
            <span className={`ml-2 text-sm font-semibold ${changeColor(index.change_rate)}`}>
              {index.prev_diff > 0 ? '▲' : index.prev_diff < 0 ? '▼' : ''}
              {index.prev_diff !== 0 && formatInt(Math.abs(index.prev_diff))}{' '}
              ({formatChangeRate(index.change_rate)})
            </span>
          </div>
        ) : (
          <span className="text-xs text-fg-muted">—</span>
        )}
      </div>

      {/* 현물 수급 (TOP 10 합산) */}
      <div className="mb-3">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[11px] text-fg-muted font-semibold">현물 수급</span>
          <span className="text-[10px] text-fg-muted">TOP 10 합산 · 단위 원</span>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {parts ? parts.map((p) => {
            const isPos = p.value >= 0;
            return (
              <div key={p.key} className="bg-bg-inner rounded-md px-2 py-1.5 text-center">
                <div className="text-[10px] text-fg-muted">{p.label}</div>
                <div className={`text-sm font-bold tabular-nums ${isPos ? 'text-up' : 'text-down'}`}>
                  {isPos ? '+' : ''}{formatKRWCompact(p.value)}
                </div>
              </div>
            );
          }) : (
            <div className="col-span-3 text-xs text-fg-muted text-center py-2">
              {flowLoading ? '조회 중…' : '—'}
            </div>
          )}
        </div>
      </div>

      {/* 30일 히스토리 */}
      <div>
        <div className="text-[11px] text-fg-muted font-semibold mb-1">최근 30일 수급 (억원)</div>
        {historyData.length >= 2 ? (
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={historyData} margin={{ top: 4, right: 4, bottom: 0, left: -10 }} stackOffset="sign">
              <CartesianGrid strokeDasharray="3 3" stroke="#1e2228" vertical={false} />
              <XAxis dataKey="date" tick={{ fill: '#6b7280', fontSize: 9 }} interval={4} />
              <YAxis tick={{ fill: '#6b7280', fontSize: 9 }} width={50} />
              <Tooltip
                contentStyle={{ background: '#0d0f13', border: '1px solid #1e2228', borderRadius: 8, fontSize: 11 }}
                labelStyle={{ color: '#e5e7eb' }}
                formatter={(v, name) => [`${v > 0 ? '+' : ''}${v}억`, name]}
              />
              <Legend wrapperStyle={{ fontSize: 10, paddingTop: 4 }} iconType="rect" iconSize={8} />
              <ReferenceLine y={0} stroke="#4b5563" />
              <Bar dataKey="외인" fill="#3b82f6" />
              <Bar dataKey="기관" fill="#a78bfa" />
              <Bar dataKey="개인" fill="#fb923c" />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <div className="h-[180px] flex items-center justify-center text-xs text-fg-muted">
            {flowLoading ? '조회 중…' : '데이터 없음'}
          </div>
        )}
      </div>
    </div>
  );
}

// ── 주도 테마 (themes.json 기반) ─────────────────────────────────
function buildThemesFromAPI(rankItems, codeThemeMap) {
  const map = {};
  for (const r of rankItems) {
    const entry = codeThemeMap[r.code];
    const theme = entry?.theme || '기타';
    const color = entry?.color || '#4b5563';
    if (theme.startsWith('ETF')) continue; // ETF 테마 카테고리도 제외
    if (!map[theme]) map[theme] = { theme, color, stocks: [], value: 0 };
    map[theme].stocks.push(r);
    map[theme].value += r.trade_value || 0;
  }
  const result = Object.values(map).map((g) => {
    g.stocks.sort((a, b) => (b.trade_value || 0) - (a.trade_value || 0));
    g.count = g.stocks.length;
    g.leader = [...g.stocks].sort((a, b) => b.change_rate - a.change_rate)[0];
    return g;
  });
  // '기타' 제일 뒤로, 나머지는 거래대금 내림차순
  return result.sort((a, b) => {
    if (a.theme === '기타') return 1;
    if (b.theme === '기타') return -1;
    return b.value - a.value;
  });
}

// ── 테마별 1주일 일별 거래대금 스택바 ────────────────────────────
function ThemeDailyChart({ trend }) {
  const { chartData, themeKeys } = useMemo(() => {
    if (!trend?.themes?.length) return { chartData: [], themeKeys: [] };
    // 모든 날짜 수집
    const dateSet = new Set();
    trend.themes.forEach((t) => t.series.forEach((s) => dateSet.add(s.date)));
    const dates = Array.from(dateSet).sort();

    // 상위 8개 테마만 표시 (나머지는 '기타'로 합산)
    const topThemes = trend.themes.slice(0, 8);
    const otherThemes = trend.themes.slice(8);

    const rows = dates.map((date) => {
      const row = { date: date.slice(5) };
      topThemes.forEach((t) => {
        const p = t.series.find((s) => s.date === date);
        row[t.theme] = p ? +(p.value / 1_0000_0000_0000).toFixed(2) : 0; // 조 단위
      });
      if (otherThemes.length > 0) {
        let sum = 0;
        otherThemes.forEach((t) => {
          const p = t.series.find((s) => s.date === date);
          if (p) sum += p.value;
        });
        row['기타'] = +(sum / 1_0000_0000_0000).toFixed(2);
      }
      return row;
    });

    const keys = topThemes.map((t) => ({ name: t.theme, color: t.color }));
    if (otherThemes.length > 0) keys.push({ name: '기타', color: '#4b5563' });
    return { chartData: rows, themeKeys: keys };
  }, [trend]);

  if (!chartData.length) return null;

  return (
    <div className="mb-4 p-3 rounded-lg bg-bg-inner border border-border">
      <div className="text-[11px] text-fg-muted font-semibold mb-2">
        최근 1주일 일별 테마 거래대금 (조원)
      </div>
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={chartData} margin={{ top: 4, right: 4, bottom: 4, left: -10 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#1e2228" vertical={false} />
          <XAxis dataKey="date" tick={{ fill: '#9ca3af', fontSize: 11 }} />
          <YAxis tick={{ fill: '#9ca3af', fontSize: 10 }} width={50} />
          <Tooltip
            contentStyle={{ background: '#0d0f13', border: '1px solid #1e2228', borderRadius: 8, fontSize: 11 }}
            labelStyle={{ color: '#e5e7eb' }}
            formatter={(v, name) => [`${v.toFixed(2)}조`, name]}
          />
          <Legend wrapperStyle={{ fontSize: 10, paddingTop: 4 }} iconType="rect" iconSize={8} />
          {themeKeys.map((k) => (
            <Bar key={k.name} dataKey={k.name} stackId="a" fill={k.color} />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// ── 메인 ──────────────────────────────────────────────────────────
export default function Overview({ onSelectCode }) {
  const [top, setTop] = useState([]);
  const [indexData, setIndexData] = useState(null);
  const [flow, setFlow] = useState(null);
  const [flowLoading, setFlowLoading] = useState(true);
  const [themes, setThemes] = useState({});
  const [trendData, setTrendData] = useState(null); // { themes: [{theme, color, series}], days }
  const [loading, setLoading] = useState(true);
  const [indexLoading, setIndexLoading] = useState(true);
  const [err, setErr] = useState(null);

  useEffect(() => {
    // 테마 맵 로드
    api.themes().then((d) => setThemes(d.themes || {})).catch(() => {});
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadOverview() {
      try {
        const [indexResult, rankData] = await Promise.all([
          api.index(),
          api.volumeRank({ topN: 120 }),
        ]);
        if (cancelled) return;
        setIndexData(indexResult);
        setTop(excludeETF(rankData.items));
        setErr(null);
      } catch (e) {
        if (!cancelled) setErr(e.message);
      } finally {
        if (!cancelled) {
          setIndexLoading(false);
          setLoading(false);
        }
      }
    }

    void loadOverview();

    // 시장 수급 — 병렬, 10초 정도 걸릴 수 있으므로 별도 로딩
    api.marketFlow()
      .then((d) => { if (!cancelled) { setFlow(d); setFlowLoading(false); } })
      .catch(() => { if (!cancelled) setFlowLoading(false); });

    // 테마 트렌드 (1주일) — 백그라운드
    api.themeTrend(7)
      .then((d) => {
        if (cancelled) return;
        setTrendData(d);
      })
      .catch(() => {});

    return () => { cancelled = true; };
  }, []);

  const codeThemeMap = useMemo(() => {
    const map = {};
    for (const [theme, info] of Object.entries(themes)) {
      for (const code of info.codes || []) {
        map[code] = { theme, color: info.color };
      }
    }
    return map;
  }, [themes]);

  // 주도 테마는 우선주/100억 미만 추가 제외 + 상위 60개만
  const themeSource = useMemo(
    () => top
      .filter((r) => !isPreferred(r.name) && (r.trade_value || 0) >= MIN_TRADE_VALUE)
      .slice(0, 60),
    [top],
  );

  const themeList = useMemo(
    () => buildThemesFromAPI(themeSource, codeThemeMap),
    [themeSource, codeThemeMap],
  );

  return (
    <div className="space-y-4">
      {/* 지수 + 현물 수급 + 30일 히스토리 통합 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <MarketSummaryCard
          label="KOSPI"
          index={indexData?.kospi}
          flow={flow?.kospi}
          indexLoading={indexLoading}
          flowLoading={flowLoading}
        />
        <MarketSummaryCard
          label="KOSDAQ"
          index={indexData?.kosdaq}
          flow={flow?.kosdaq}
          indexLoading={indexLoading}
          flowLoading={flowLoading}
        />
      </div>

      {/* 주도 테마 (상위 60종목, ETF/우선주/100억미만 제외, 섹터별 묶음) */}
      <Card
        title="오늘의 주도 테마"
        subtitle={`${themeSource.length}종목 · ETF · 우선주 · 100억 미만 제외`}
      >
        {/* 1주일 일별 테마 거래대금 */}
        <ThemeDailyChart trend={trendData} />

        {themeList.length === 0 ? (
          <div className="text-xs text-fg-muted">{loading ? '조회 중…' : '감지된 테마 없음'}</div>
        ) : (
          <div className="space-y-3">
            {themeList.map((g, i) => {
              return (
              <div
                key={g.theme}
                className="rounded-lg border border-border overflow-hidden"
                style={{ borderLeftWidth: 3, borderLeftColor: g.color }}
              >
                {/* 테마 헤더 */}
                <div className="flex items-center gap-3 px-3 py-2 bg-bg-inner">
                  <span className="text-xs text-fg-muted tabular-nums w-6 shrink-0">#{i + 1}</span>
                  <div className="flex-1 min-w-0 flex items-baseline gap-2 flex-wrap">
                    <span className="text-sm text-fg-white font-semibold" style={{ color: g.color }}>
                      {g.theme}
                    </span>
                    <span className="text-[11px] text-fg-muted">{g.count}종목</span>
                    {g.leader && (
                      <span className="text-[11px] text-fg-muted">
                        · 대장 <span className="text-fg-bright">{g.leader.name}</span>{' '}
                        <span className={changeColor(g.leader.change_rate)}>
                          {formatChangeRate(g.leader.change_rate)}
                        </span>
                      </span>
                    )}
                  </div>
                  <span className="text-sm text-accent font-semibold tabular-nums shrink-0">
                    {formatKRWCompact(g.value)}
                  </span>
                </div>
                {/* 종목 리스트 */}
                <table className="w-full text-xs">
                  <tbody>
                    {g.stocks.map((s) => (
                      <tr
                        key={s.code}
                        onClick={() => onSelectCode?.(s.code)}
                        className="border-t border-border/40 hover:bg-bg-inner cursor-pointer"
                      >
                        <td className="py-1.5 px-3">
                          <div className="text-fg-white font-medium">{s.name}</div>
                          <div className="text-[10px] text-fg-muted">{s.code}</div>
                        </td>
                        <td className="py-1.5 px-3 text-right tabular-nums text-fg-white">
                          {formatInt(s.price)}
                        </td>
                        <td className={`py-1.5 px-3 text-right tabular-nums ${changeColor(s.change_rate)}`}>
                          {formatChangeRate(s.change_rate)}
                        </td>
                        <td className="py-1.5 px-3 text-right tabular-nums text-fg-muted">
                          {formatKRWCompact(s.trade_value)}
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

    </div>
  );
}
