import { useEffect, useMemo, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
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

// ── 지수 카드 ────────────────────────────────────────────────────
function IndexCard({ label, data, loading }) {
  if (loading || !data)
    return (
      <div className="bg-bg-card border border-border rounded-xl p-[18px]">
        <div className="text-xs text-fg-muted mb-1">{label}</div>
        <div className="text-fg-muted text-sm">{loading ? '조회 중…' : '—'}</div>
      </div>
    );
  return (
    <div className="bg-bg-card border border-border rounded-xl p-[18px]">
      <div className="text-xs text-fg-muted mb-1">{label}</div>
      <div className="text-xl font-bold text-fg-white tabular-nums">
        {formatInt(data.price)}
      </div>
      <div className={`text-sm font-semibold ${changeColor(data.change_rate)}`}>
        {formatChangeRate(data.change_rate)}
        {data.prev_diff != null && (
          <span className="ml-1 text-xs">
            {data.prev_diff > 0 ? '▲' : data.prev_diff < 0 ? '▼' : ''}
            {data.prev_diff !== 0 && formatInt(Math.abs(data.prev_diff))}
          </span>
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

// KIS 투자자 값은 천원 단위 — 원으로 변환
const KIS_UNIT = 1000;

// ── 시장 수급 (개인/기관/외인) ──────────────────────────────────
function MarketFlowCard({ label, flow, loading }) {
  if (loading || !flow) {
    return (
      <div className="bg-bg-card border border-border rounded-xl p-[18px]">
        <div className="text-xs text-fg-muted mb-2 font-semibold">{label} · 현물 수급</div>
        <div className="text-fg-muted text-sm">{loading ? '조회 중…' : '—'}</div>
      </div>
    );
  }
  const parts = [
    { key: 'foreign', label: '외인', value: (flow.foreign || 0) * KIS_UNIT },
    { key: 'institution', label: '기관', value: (flow.institution || 0) * KIS_UNIT },
    { key: 'individual', label: '개인', value: (flow.individual || 0) * KIS_UNIT },
  ];

  return (
    <div className="bg-bg-card border border-border rounded-xl p-[18px]">
      <div className="flex items-baseline justify-between mb-3">
        <div className="text-sm font-bold text-fg-white">{label}</div>
        <div className="text-[10px] text-fg-muted">현물 · TOP {flow.count || 10} 합산</div>
      </div>
      <div className="grid grid-cols-3 gap-2">
        {parts.map((p) => {
          const isPos = p.value >= 0;
          const colorCls = isPos ? 'text-up' : 'text-down';
          return (
            <div key={p.key} className="bg-bg-inner rounded-md px-3 py-2 text-center">
              <div className="text-[11px] text-fg-muted">{p.label}</div>
              <div className={`text-lg font-bold tabular-nums ${colorCls}`}>
                {isPos ? '+' : ''}{formatKRWCompact(p.value)}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── 30일 수급 히스토리 차트 ───────────────────────────────────────
function FlowHistoryChart({ label, history, loading }) {
  // history: [{date, foreign, institution, individual}] — 값은 천원
  // 1억 = 100,000천원
  const data = useMemo(() => {
    const UK_KRW = 100_000; // 1억원을 천원 단위로
    return (history || []).map((r) => ({
      date: r.date?.slice(5) || '',   // "MM-DD"
      외인: +(r.foreign / UK_KRW).toFixed(0),
      기관: +(r.institution / UK_KRW).toFixed(0),
      개인: +(r.individual / UK_KRW).toFixed(0),
    }));
  }, [history]);

  if (loading) {
    return (
      <Card title={`${label} · 최근 30일 수급`} subtitle="현물 근사치">
        <div className="h-48 flex items-center justify-center text-fg-muted text-sm">조회 중…</div>
      </Card>
    );
  }
  if (!data.length) {
    return (
      <Card title={`${label} · 최근 30일 수급`} subtitle="현물 근사치">
        <div className="h-48 flex items-center justify-center text-fg-muted text-sm">데이터 없음</div>
      </Card>
    );
  }

  return (
    <Card title={`${label} · 최근 30일 수급`} subtitle="단위: 억원">
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={data} margin={{ top: 4, right: 8, bottom: 4, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#1e2228" />
          <XAxis dataKey="date" tick={{ fill: '#6b7280', fontSize: 10 }} interval={3} />
          <YAxis tick={{ fill: '#6b7280', fontSize: 10 }} />
          <Tooltip
            contentStyle={{ background: '#0d0f13', border: '1px solid #1e2228', borderRadius: 8, fontSize: 12 }}
            labelStyle={{ color: '#e5e7eb' }}
            formatter={(v) => [`${v > 0 ? '+' : ''}${v}억`, '']}
          />
          <Legend wrapperStyle={{ fontSize: 11, paddingTop: 4 }} />
          <ReferenceLine y={0} stroke="#4b5563" />
          <Bar dataKey="외인" fill="#3b82f6" stackId="flow" />
          <Bar dataKey="기관" fill="#a78bfa" stackId="flow" />
          <Bar dataKey="개인" fill="#fb923c" stackId="flow" />
        </BarChart>
      </ResponsiveContainer>
    </Card>
  );
}

// ── 투자자별 순매수 TOP 10 ──────────────────────────────────────
function InvestorTop10({ items, field, title, color, onSelectCode }) {
  const top10 = useMemo(
    () => [...(items || [])]
      .sort((a, b) => (b[field] || 0) - (a[field] || 0))
      .slice(0, 10),
    [items, field],
  );
  return (
    <Card title={title} subtitle="거래대금 상위 30종목 중">
      <div className="space-y-1">
        {top10.map((r, i) => {
          const value = r[field] || 0;
          const isPos = value > 0;
          return (
            <button
              key={r.code}
              onClick={() => onSelectCode?.(r.code)}
              className="w-full flex items-center gap-2 hover:bg-bg-inner rounded-md px-2 py-1.5 transition-colors"
            >
              <span className="text-[11px] text-fg-muted tabular-nums w-5 shrink-0">{i + 1}</span>
              <span
                className="shrink-0 w-1 h-8 rounded-full"
                style={{ background: isPos ? color : '#3b82f6', opacity: isPos ? 1 : 0.6 }}
              />
              <div className="flex-1 text-left min-w-0">
                <div className="text-sm text-fg-white font-semibold truncate">{r.name}</div>
                <div className="text-[10px] text-fg-muted">{r.code}</div>
              </div>
              <div className="text-right tabular-nums shrink-0">
                <div className={`text-sm font-semibold ${isPos ? 'text-up' : 'text-down'}`}>
                  {isPos ? '+' : ''}{formatKRWCompact(value)}
                </div>
                <div className={`text-[10px] ${changeColor(r.change_rate)}`}>
                  {formatChangeRate(r.change_rate)}
                </div>
              </div>
            </button>
          );
        })}
        {top10.length === 0 && (
          <div className="text-xs text-fg-muted py-4 text-center">데이터 없음</div>
        )}
      </div>
    </Card>
  );
}

// ── 메인 ──────────────────────────────────────────────────────────
export default function Overview({ onSelectCode }) {
  const [top, setTop] = useState([]);
  const [indexData, setIndexData] = useState(null);
  const [investorItems, setInvestorItems] = useState([]);
  const [flow, setFlow] = useState(null);
  const [flowLoading, setFlowLoading] = useState(true);
  const [themes, setThemes] = useState({});
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
        const [indexResult, rankData, invData] = await Promise.all([
          api.index(),
          api.volumeRank({ topN: 60 }),
          api.investorSummary(30),
        ]);
        if (cancelled) return;
        setIndexData(indexResult);
        setTop(excludeETF(rankData.items));
        setInvestorItems(excludeETF(invData.items));
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

  // 주도 테마는 우선주/100억 미만 추가 제외
  const themeSource = useMemo(
    () => top.filter((r) => !isPreferred(r.name) && (r.trade_value || 0) >= MIN_TRADE_VALUE),
    [top],
  );

  const themeList = useMemo(
    () => buildThemesFromAPI(themeSource, codeThemeMap),
    [themeSource, codeThemeMap],
  );

  return (
    <div className="space-y-4">
      {/* 지수 카드 */}
      <div className="grid grid-cols-2 gap-3">
        <IndexCard label="KOSPI" data={indexData?.kospi} loading={indexLoading} />
        <IndexCard label="KOSDAQ" data={indexData?.kosdaq} loading={indexLoading} />
      </div>

      {/* 시장 수급 (현물) 당일 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <MarketFlowCard label="KOSPI" flow={flow?.kospi} loading={flowLoading} />
        <MarketFlowCard label="KOSDAQ" flow={flow?.kosdaq} loading={flowLoading} />
      </div>

      {/* 최근 30일 수급 히스토리 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <FlowHistoryChart label="KOSPI" history={flow?.kospi?.history} loading={flowLoading} />
        <FlowHistoryChart label="KOSDAQ" history={flow?.kosdaq?.history} loading={flowLoading} />
      </div>

      {/* 주도 테마 (상위 60종목, ETF/우선주/100억미만 제외, 섹터별 묶음) */}
      <Card
        title="오늘의 주도 테마"
        subtitle={`${themeSource.length}종목 · ETF · 우선주 · 100억 미만 제외`}
      >
        {themeList.length === 0 ? (
          <div className="text-xs text-fg-muted">{loading ? '조회 중…' : '감지된 테마 없음'}</div>
        ) : (
          <div className="space-y-3">
            {themeList.map((g, i) => (
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
            ))}
          </div>
        )}
      </Card>

      {/* 외국인 / 기관 순매수 TOP 10 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <InvestorTop10
          items={investorItems}
          field="foreign_value"
          title="외국인 순매수 TOP 10"
          color="#3b82f6"
          onSelectCode={onSelectCode}
        />
        <InvestorTop10
          items={investorItems}
          field="institution_value"
          title="기관 순매수 TOP 10"
          color="#a78bfa"
          onSelectCode={onSelectCode}
        />
      </div>
    </div>
  );
}
