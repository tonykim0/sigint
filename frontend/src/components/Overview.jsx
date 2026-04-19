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
  formatChangeRate,
  formatInt,
  formatKRWCompact,
} from '../utils/format.js';
import Card from './Card.jsx';

// ── 타임테이블 ─────────────────────────────────────────────────────
const TIMETABLE = [
  { start: 540, end: 560, label: '수확/투매', color: 'bg-warn/20 text-warn border-warn/40', active: 'bg-warn/30 border-warn text-warn font-bold' },
  { start: 560, end: 660, label: '프라임 타임', color: 'bg-accent/10 text-accent border-accent/30', active: 'bg-accent/25 border-accent text-accent font-bold' },
  { start: 660, end: 870, label: '매매 금지', color: 'bg-down/10 text-down border-down/20', active: 'bg-down/25 border-down text-down font-bold' },
  { start: 870, end: 920, label: '종가매매 준비', color: 'bg-blue-500/10 text-blue-400 border-blue-500/30', active: 'bg-blue-500/25 border-blue-400 text-blue-300 font-bold' },
  { start: 920, end: 1440, label: '데이터 정리', color: 'bg-inst/10 text-inst border-inst/20', active: 'bg-inst/25 border-inst text-inst font-bold' },
];

function formatMinutes(m) {
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

function currentSlot(now = new Date()) {
  const mins = now.getHours() * 60 + now.getMinutes();
  return TIMETABLE.find((s) => mins >= s.start && mins < s.end) ?? null;
}

function TimetableBar() {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);
  const active = currentSlot(now);
  return (
    <Card title="매매 타임테이블" subtitle={active ? `현재: ${active.label}` : '장외'}>
      <div className="grid grid-cols-5 gap-2">
        {TIMETABLE.map((s) => {
          const isActive = active?.label === s.label;
          return (
            <div
              key={s.label}
              className={`p-2 sm:p-3 rounded-md border text-xs text-center transition-all ${
                isActive ? s.active : `${s.color} opacity-60`
              }`}
            >
              <div className="text-[10px] opacity-70 hidden sm:block">
                {formatMinutes(s.start)}~{formatMinutes(s.end)}
              </div>
              <div className="mt-0.5">{s.label}</div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

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
    if (!entry) continue;
    const t = entry.theme;
    if (!map[t]) map[t] = { theme: t, color: entry.color, count: 0, value: 0, leader: null };
    map[t].count += 1;
    map[t].value += r.trade_value || 0;
    if (!map[t].leader || r.change_rate > map[t].leader.change_rate) {
      map[t].leader = r;
    }
  }
  return Object.values(map).sort((a, b) => b.value - a.value);
}

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
    { key: 'foreign', label: '외인', color: '#3b82f6', value: flow.foreign },
    { key: 'institution', label: '기관', color: '#a78bfa', value: flow.institution },
    { key: 'individual', label: '개인', color: '#fb923c', value: flow.individual },
  ];
  const maxAbs = Math.max(...parts.map((p) => Math.abs(p.value)), 1);

  return (
    <div className="bg-bg-card border border-border rounded-xl p-[18px]">
      <div className="flex items-baseline justify-between mb-3">
        <div className="text-sm font-bold text-fg-white">{label}</div>
        <div className="text-[10px] text-fg-muted">현물 TOP {flow.count || 10} 합산</div>
      </div>
      <div className="space-y-2">
        {parts.map((p) => {
          const isPos = p.value >= 0;
          const widthPct = Math.abs(p.value) / maxAbs * 100;
          return (
            <div key={p.key} className="flex items-center gap-2">
              <span className="text-xs text-fg-muted w-8 shrink-0">{p.label}</span>
              <div className="flex-1 h-5 bg-bg-inner rounded relative overflow-hidden">
                <div
                  className="absolute top-0 bottom-0 left-1/2 transition-all"
                  style={{
                    width: `${widthPct / 2}%`,
                    background: p.color,
                    transform: isPos ? 'translateX(0)' : 'translateX(-100%)',
                    opacity: 0.75,
                  }}
                />
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className={`text-xs font-semibold tabular-nums ${isPos ? 'text-up' : 'text-down'}`}>
                    {isPos ? '+' : ''}{formatKRWCompact(p.value)}
                  </span>
                </div>
                <div className="absolute top-0 bottom-0 left-1/2 w-px bg-border" />
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
  // history: [{date, foreign, institution, individual}]
  const data = useMemo(() => {
    const UK = 1_0000_0000;
    return (history || []).map((r) => ({
      date: r.date?.slice(5) || '',   // "MM-DD"
      외인: +(r.foreign / UK).toFixed(0),
      기관: +(r.institution / UK).toFixed(0),
      개인: +(r.individual / UK).toFixed(0),
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

// ── 외국인 순매수 TOP 5 ────────────────────────────────────────
function ForeignTop5({ items, onSelectCode }) {
  const top5 = useMemo(
    () => [...(items || [])].sort((a, b) => b.foreign_value - a.foreign_value).slice(0, 5),
    [items],
  );
  return (
    <Card title="외국인 순매수 TOP 5" subtitle="거래대금 상위 기준">
      <div className="space-y-2">
        {top5.map((r) => (
          <button
            key={r.code}
            onClick={() => onSelectCode?.(r.code)}
            className="w-full flex items-center gap-3 hover:bg-bg-inner rounded-md px-2 py-1.5 transition-colors"
          >
            <span
              className={`shrink-0 w-1.5 h-8 rounded-full ${
                r.foreign_value > 0 ? 'bg-up' : 'bg-down'
              }`}
            />
            <div className="flex-1 text-left min-w-0">
              <div className="text-sm text-fg-white font-semibold truncate">{r.name}</div>
              <div className="text-[11px] text-fg-muted">{r.code}</div>
            </div>
            <div className="text-right tabular-nums shrink-0">
              <div className={`text-sm font-semibold ${r.foreign_value > 0 ? 'text-up' : 'text-down'}`}>
                {r.foreign_value > 0 ? '+' : ''}{formatKRWCompact(r.foreign_value)}
              </div>
              <div className={`text-xs ${changeColor(r.change_rate)}`}>
                {formatChangeRate(r.change_rate)}
              </div>
            </div>
          </button>
        ))}
        {top5.length === 0 && (
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
          api.volumeRank({ topN: 30 }),
          api.investorSummary(10),
        ]);
        if (cancelled) return;
        setIndexData(indexResult);
        setTop(rankData.items || []);
        setInvestorItems(invData.items || []);
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

  const themeList = useMemo(
    () => buildThemesFromAPI(top, codeThemeMap),
    [top, codeThemeMap],
  );

  return (
    <div className="space-y-4">
      <TimetableBar />

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

      {/* 주도 테마 */}
      <Card title="오늘의 주도 테마" subtitle="거래대금 기준 자동 추출">
        {themeList.length === 0 ? (
          <div className="text-xs text-fg-muted">{loading ? '조회 중…' : '감지된 테마 없음'}</div>
        ) : (
          <div className="flex flex-wrap gap-2">
            {themeList.map((t, i) => (
              <div
                key={t.theme}
                className="flex items-center gap-2 px-3 py-2 rounded-md bg-bg-inner border border-border"
                style={{ borderColor: i === 0 ? `${t.color}60` : undefined }}
              >
                <span className="w-2 h-2 rounded-full shrink-0" style={{ background: t.color }} />
                <div>
                  <span className="text-sm text-fg-white font-semibold">{t.theme}</span>
                  <span className="text-xs text-fg-muted ml-1">({t.count}종목)</span>
                  {t.leader && (
                    <span className={`ml-2 text-xs ${changeColor(t.leader.change_rate)}`}>
                      {t.leader.name} {formatChangeRate(t.leader.change_rate)}
                    </span>
                  )}
                  <div className="text-xs text-accent">{formatKRWCompact(t.value)}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* 거래대금 TOP 10 그리드 + 외국인 순매수 */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card title="거래대금 TOP 10" right={err && <span className="text-warn text-xs">{err}</span>} className="lg:col-span-2">
          {loading && <div className="text-xs text-fg-muted mb-2">조회 중…</div>}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
            {top.slice(0, 10).map((r) => (
              <button
                key={r.code}
                onClick={() => onSelectCode?.(r.code)}
                className="text-left p-2 sm:p-3 rounded-md bg-bg-inner border border-border hover:border-accent/60 transition-colors"
              >
                <div className="text-sm text-fg-white font-bold truncate">{r.name}</div>
                <div className="text-[10px] text-fg-muted">{r.code}</div>
                <div className="mt-1.5 text-sm text-fg-white tabular-nums">{formatInt(r.price)}</div>
                <div className={`text-xs ${changeColor(r.change_rate)}`}>{formatChangeRate(r.change_rate)}</div>
                <div className="text-[10px] text-fg-muted mt-0.5">{formatKRWCompact(r.trade_value)}</div>
              </button>
            ))}
            {top.length === 0 && !loading && (
              <div className="col-span-5 py-8 text-center text-fg-muted text-sm">데이터 없음</div>
            )}
          </div>
        </Card>
        <ForeignTop5 items={investorItems} onSelectCode={onSelectCode} />
      </div>
    </div>
  );
}
