import { useEffect, useMemo, useState } from 'react';
import { api } from '../utils/api.js';
import {
  changeColor,
  formatChangeRate,
  formatInt,
  formatKRWCompact,
} from '../utils/format.js';
import Card from './Card.jsx';

const SUB_TABS = [
  { id: 'closing', label: '종가배팅' },
  { id: 'pullback', label: '눌림목 스윙' },
  { id: 'breakout', label: '돌파 스윙' },
];

// ── 공통 ──────────────────────────────────────────────────────────

function FilterDot({ ok }) {
  return (
    <span
      className={`inline-block w-2.5 h-2.5 rounded-full ${ok ? 'bg-up' : 'bg-border'}`}
    />
  );
}

function ScoreBadge({ score, max }) {
  const cls =
    score >= max
      ? 'text-up'
      : score >= max - 1
        ? 'text-warn'
        : 'text-fg-white';
  return (
    <span className={`font-semibold ${cls}`}>
      {score}
      <span className="text-fg-muted">/{max}</span>
    </span>
  );
}

function rowBg(score, max) {
  if (score >= max) return 'bg-up/10 border-l-2 border-up';
  if (score >= max - 1) return 'bg-warn/10 border-l-2 border-warn';
  return '';
}

// ── 시황 배너 ────────────────────────────────────────────────────

function RegimeBanner({ regime }) {
  if (!regime) return null;
  const { system_on, kospi, kosdaq } = regime;
  if (system_on) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 mb-3 rounded-md bg-up/10 border border-up/30 text-xs text-up">
        <span className="inline-block w-2 h-2 rounded-full bg-up animate-pulse" />
        시스템 ON — KOSPI / KOSDAQ 20일선 위. 스크리너 정상 작동.
        <span className="ml-auto text-fg-muted">
          KOSPI {kospi?.above_ma20 ? '↑' : '↓'}  KOSDAQ{' '}
          {kosdaq?.above_ma20 ? '↑' : '↓'}
        </span>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-2 px-3 py-2 mb-3 rounded-md bg-warn/10 border border-warn/30 text-xs text-warn">
      <span className="inline-block w-2 h-2 rounded-full bg-warn animate-pulse" />
      시스템 OFF — 지수가 20일선 하향 이탈. 스윙 신규 진입 자제. 종가배팅만 허용.
    </div>
  );
}

// ── 종가배팅 ─────────────────────────────────────────────────────

const CB_FILTERS = [
  { key: 'volume_rank', label: '거래대금' },
  { key: 'dual_buy', label: '양매수' },
  { key: 'intraday_trend', label: '분봉추세' },
  { key: 'relative_strength', label: '상대강도' },
  { key: 'chart_position', label: '차트위치' },
];

function WeightCalc() {
  const [amount, setAmount] = useState('');
  const parsed = parseFloat(amount.replace(/,/g, '')) || 0;
  const part1 = Math.floor((parsed * 0.6) / 10) * 10;
  const part2 = Math.floor((parsed * 0.4) / 10) * 10;
  return (
    <div className="mt-4 p-3 rounded-lg bg-bg-inner border border-border">
      <div className="text-xs text-fg-muted mb-2 font-medium">비중 계산기</div>
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-fg-muted">매수금액</span>
          <input
            type="text"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="10,000,000"
            className="w-36 px-2 py-1 bg-bg-card border border-border rounded text-sm text-fg-white placeholder:text-fg-muted/50 focus:outline-none focus:border-accent tabular-nums"
          />
          <span className="text-xs text-fg-muted">원</span>
        </div>
        {parsed > 0 && (
          <>
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-fg-muted">종가 매수 60%</span>
              <span className="text-sm font-semibold text-up">
                {part1.toLocaleString('ko-KR')}원
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-fg-muted">익일 시초 40%</span>
              <span className="text-sm font-semibold text-warn">
                {part2.toLocaleString('ko-KR')}원
              </span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function ClosingBetTab({ onSelectCode, onGoJournal }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(null);
  const [memos, setMemos] = useState({});

  const load = (force = false) => {
    setLoading(true);
    setErr(null);
    api.screener
      .closingBet({ force })
      .then(setData)
      .catch((e) => setErr(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(false); }, []);

  const rows = useMemo(() => {
    if (!data?.stocks) return [];
    return data.stocks.map((s) => {
      const memo = memos[s.code] || { hasMaterial: false, note: '' };
      const total = s.pass_count + (memo.hasMaterial ? 1 : 0);
      return { ...s, memo, total };
    });
  }, [data, memos]);

  const sorted = useMemo(
    () => [...rows].sort((a, b) => b.total - a.total || b.trade_value - a.trade_value),
    [rows],
  );

  const counts = useMemo(() => {
    const c = { full: 0, five: 0, four: 0 };
    for (const r of rows) {
      if (r.total >= 6) c.full++;
      else if (r.total === 5) c.five++;
      else if (r.total === 4) c.four++;
    }
    return c;
  }, [rows]);

  const toggleMaterial = (code) =>
    setMemos((p) => ({ ...p, [code]: { ...(p[code] || { note: '' }), hasMaterial: !p[code]?.hasMaterial } }));

  const updateNote = (code, note) =>
    setMemos((p) => ({ ...p, [code]: { ...(p[code] || { hasMaterial: false }), note } }));

  return (
    <div>
      <div className="flex items-center gap-4 mb-3 text-xs flex-wrap">
        <span className="inline-flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-sm bg-up/40 inline-block" />
          <span className="text-fg-muted">6/6</span>
          <span className="text-fg-white font-medium">{counts.full}</span>
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-sm bg-warn/40 inline-block" />
          <span className="text-fg-muted">5/6</span>
          <span className="text-fg-white font-medium">{counts.five}</span>
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-sm bg-border inline-block" />
          <span className="text-fg-muted">4/6</span>
          <span className="text-fg-white font-medium">{counts.four}</span>
        </span>
        <div className="ml-auto flex items-center gap-3">
          {data?.index && (
            <span className="text-fg-muted">
              KOSPI <span className={changeColor(data.index.kospi)}>{formatChangeRate(data.index.kospi)}</span>
              <span className="mx-1.5">·</span>
              KOSDAQ <span className={changeColor(data.index.kosdaq)}>{formatChangeRate(data.index.kosdaq)}</span>
            </span>
          )}
          {data?.generated_at && (
            <span className="text-fg-muted">{data.generated_at.slice(11, 19)}</span>
          )}
          <button
            onClick={() => load(true)}
            disabled={loading}
            className="px-3 py-1 rounded-md border border-border text-fg-muted hover:text-fg-bright hover:border-accent disabled:opacity-50 text-xs"
          >
            {loading ? '조회 중…' : '새로고침'}
          </button>
        </div>
        {err && <span className="text-warn">{err}</span>}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-fg-muted border-b border-border">
              <th className="py-2 px-2 w-8 text-right">#</th>
              <th className="py-2 px-2 text-left">종목명</th>
              <th className="py-2 px-2 text-right">현재가</th>
              <th className="py-2 px-2 text-right">등락률</th>
              <th className="py-2 px-2 text-right">거래대금</th>
              {CB_FILTERS.map((c) => (
                <th key={c.key} className="py-2 px-2 text-center">{c.label}</th>
              ))}
              <th className="py-2 px-2 text-center">재료</th>
              <th className="py-2 px-2 text-left">메모</th>
              <th className="py-2 px-2 text-center font-semibold">통과</th>
              <th className="py-2 px-2 text-center">일지</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((r, i) => (
              <tr key={r.code} className={`border-b border-border/60 hover:bg-bg-inner ${rowBg(r.total, 6)}`}>
                <td className="py-2 px-2 text-right text-fg-muted">{i + 1}</td>
                <td className="py-2 px-2 cursor-pointer" onClick={() => onSelectCode?.(r.code)}>
                  <div className="text-fg-white font-semibold hover:text-accent">{r.name}</div>
                  <div className="text-[11px] text-fg-muted">{r.code}</div>
                </td>
                <td className="py-2 px-2 text-right">{formatInt(r.price)}</td>
                <td className={`py-2 px-2 text-right ${changeColor(r.change_rate)}`}>{formatChangeRate(r.change_rate)}</td>
                <td className="py-2 px-2 text-right">{formatKRWCompact(r.trade_value)}</td>
                {CB_FILTERS.map((c) => (
                  <td key={c.key} className="py-2 px-2 text-center">
                    <FilterDot ok={r.filters?.[c.key]} />
                  </td>
                ))}
                <td className="py-2 px-2 text-center">
                  <input type="checkbox" checked={r.memo.hasMaterial} onChange={() => toggleMaterial(r.code)} className="accent-accent cursor-pointer" />
                </td>
                <td className="py-2 px-2">
                  <input
                    type="text"
                    value={r.memo.note}
                    onChange={(e) => updateNote(r.code, e.target.value)}
                    placeholder="이슈/재료"
                    className="w-36 px-2 py-1 bg-bg-inner border border-border rounded text-xs text-fg-white placeholder:text-fg-muted/60 focus:outline-none focus:border-accent"
                  />
                </td>
                <td className="py-2 px-2 text-center">
                  <ScoreBadge score={r.total} max={6} />
                </td>
                <td className="py-2 px-2 text-center">
                  <button
                    onClick={() => {
                      const today = new Date().toISOString().slice(0, 10);
                      api.journal.add({
                        code: r.code, name: r.name, entry_date: today,
                        entry_price: r.price, reason: 'closing_bet',
                        weight_pct: 0, memo: r.memo?.note || '',
                      }).then(() => onGoJournal?.()).catch(() => {});
                    }}
                    className="px-2 py-0.5 rounded border border-border text-fg-muted hover:text-accent hover:border-accent text-[10px]"
                  >
                    + 일지
                  </button>
                </td>
              </tr>
            ))}
            {!loading && sorted.length === 0 && (
              <tr><td colSpan={13} className="py-8 text-center text-fg-muted">데이터 없음</td></tr>
            )}
          </tbody>
        </table>
      </div>
      <WeightCalc />
    </div>
  );
}

// ── 눌림목 스윙 ──────────────────────────────────────────────────

const PB_FILTERS = [
  { key: 'reference_candle', label: '기준봉' },
  { key: 'pullback_volume', label: '눌림거래량' },
  { key: 'support_level', label: '지지확인' },
  { key: 'relative_strength', label: '상대강도' },
];

function PullbackTab({ onSelectCode }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(null);
  const [memos, setMemos] = useState({});

  const load = (force = false) => {
    setLoading(true);
    setErr(null);
    api.screener
      .pullbackSwing({ force })
      .then(setData)
      .catch((e) => setErr(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(false); }, []);

  const rows = useMemo(() => {
    if (!data?.stocks) return [];
    return data.stocks.map((s) => ({
      ...s,
      memo: memos[s.code] || { hasMaterial: false, note: '' },
      total: s.pass_count + (memos[s.code]?.hasMaterial ? 1 : 0),
    }));
  }, [data, memos]);

  return (
    <div>
      <div className="flex items-center gap-3 mb-3 text-xs">
        <span className="text-fg-muted">기준봉 출현 후 눌림 구간 매수 타점 탐색</span>
        <div className="ml-auto flex items-center gap-2">
          {data?.generated_at && <span className="text-fg-muted">{data.generated_at.slice(11, 19)}</span>}
          <button onClick={() => load(true)} disabled={loading}
            className="px-3 py-1 rounded-md border border-border text-fg-muted hover:text-fg-bright hover:border-accent disabled:opacity-50">
            {loading ? '조회 중…' : '새로고침'}
          </button>
        </div>
        {err && <span className="text-warn">{err}</span>}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-fg-muted border-b border-border">
              <th className="py-2 px-2 w-8 text-right">#</th>
              <th className="py-2 px-2 text-left">종목명</th>
              <th className="py-2 px-2 text-right">현재가</th>
              <th className="py-2 px-2 text-right">등락률</th>
              <th className="py-2 px-2 text-right">거래대금</th>
              {PB_FILTERS.map((c) => (
                <th key={c.key} className="py-2 px-2 text-center">{c.label}</th>
              ))}
              <th className="py-2 px-2 text-center">재료</th>
              <th className="py-2 px-2 text-left">메모</th>
              <th className="py-2 px-2 text-center">통과</th>
              <th className="py-2 px-2 text-right text-fg-muted">경과일</th>
              <th className="py-2 px-2 text-right text-fg-muted">눌림%</th>
              <th className="py-2 px-2 text-right text-fg-muted">MA5</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.code} className={`border-b border-border/60 hover:bg-bg-inner ${rowBg(r.total, 5)}`}>
                <td className="py-2 px-2 text-right text-fg-muted">{i + 1}</td>
                <td className="py-2 px-2 cursor-pointer" onClick={() => onSelectCode?.(r.code)}>
                  <div className="text-fg-white font-semibold hover:text-accent">{r.name}</div>
                  <div className="text-[11px] text-fg-muted">{r.code}</div>
                </td>
                <td className="py-2 px-2 text-right">{formatInt(r.price)}</td>
                <td className={`py-2 px-2 text-right ${changeColor(r.change_rate)}`}>{formatChangeRate(r.change_rate)}</td>
                <td className="py-2 px-2 text-right">{formatKRWCompact(r.trade_value)}</td>
                {PB_FILTERS.map((c) => (
                  <td key={c.key} className="py-2 px-2 text-center">
                    <FilterDot ok={r.filters?.[c.key]} />
                  </td>
                ))}
                <td className="py-2 px-2 text-center">
                  <input type="checkbox" checked={r.memo.hasMaterial}
                    onChange={() => setMemos((p) => ({ ...p, [r.code]: { ...(p[r.code] || { note: '' }), hasMaterial: !p[r.code]?.hasMaterial } }))}
                    className="accent-accent cursor-pointer" />
                </td>
                <td className="py-2 px-2">
                  <input type="text" value={r.memo.note}
                    onChange={(e) => setMemos((p) => ({ ...p, [r.code]: { ...(p[r.code] || { hasMaterial: false }), note: e.target.value } }))}
                    placeholder="재료 메모"
                    className="w-32 px-2 py-1 bg-bg-inner border border-border rounded text-xs text-fg-white placeholder:text-fg-muted/60 focus:outline-none focus:border-accent" />
                </td>
                <td className="py-2 px-2 text-center"><ScoreBadge score={r.total} max={5} /></td>
                <td className="py-2 px-2 text-right text-fg-muted text-xs">
                  {r.detail?.days_since_ref ?? '—'}
                </td>
                <td className="py-2 px-2 text-right text-xs">
                  {r.detail?.pullback_vol_ratio != null
                    ? <span className={r.detail.pullback_vol_ratio <= 0.3 ? 'text-up' : 'text-fg-muted'}>
                        {(r.detail.pullback_vol_ratio * 100).toFixed(0)}%
                      </span>
                    : '—'}
                </td>
                <td className="py-2 px-2 text-right text-fg-muted text-xs">
                  {r.detail?.ma5 ? formatInt(r.detail.ma5) : '—'}
                </td>
              </tr>
            ))}
            {!loading && rows.length === 0 && (
              <tr><td colSpan={14} className="py-8 text-center text-fg-muted">데이터 없음</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-3 p-3 rounded-lg bg-bg-inner border border-border text-xs text-fg-muted leading-relaxed">
        <span className="text-fg-bright font-medium">진입 가이드</span> — 1-2-2 분할 매수 (20%→40%→40%) ·{' '}
        <span className="text-warn">손절</span> 매수가 -5% 또는 기준봉 시가 이탈 ·{' '}
        <span className="text-up">익절</span> +5% 도달 시 50% 매도, 나머지 5일선 이탈 시 청산 ·{' '}
        <span className="text-down">타임컷</span> 3거래일 횡보 시 본절
      </div>
    </div>
  );
}

// ── 돌파 스윙 ────────────────────────────────────────────────────

const BO_FILTERS = [
  { key: 'trend_template', label: '추세적격' },
  { key: 'near_high', label: '전고점3%' },
  { key: 'vcp', label: 'VCP' },
  { key: 'darvas_breakout', label: '다바스' },
  { key: 'reference_candle_today', label: '기준봉' },
];

function BreakoutTab({ onSelectCode }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(null);

  const load = (force = false) => {
    setLoading(true);
    setErr(null);
    api.screener
      .breakoutSwing({ force })
      .then(setData)
      .catch((e) => setErr(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(false); }, []);

  const rows = data?.stocks || [];

  return (
    <div>
      <div className="flex items-center gap-3 mb-3 text-xs">
        <span className="text-fg-muted">전고점 돌파 + 추세 적격 종목 탐색 (미너비니 기반)</span>
        <div className="ml-auto flex items-center gap-2">
          {data?.generated_at && <span className="text-fg-muted">{data.generated_at.slice(11, 19)}</span>}
          <button onClick={() => load(true)} disabled={loading}
            className="px-3 py-1 rounded-md border border-border text-fg-muted hover:text-fg-bright hover:border-accent disabled:opacity-50">
            {loading ? '조회 중…' : '새로고침'}
          </button>
        </div>
        {err && <span className="text-warn">{err}</span>}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-fg-muted border-b border-border">
              <th className="py-2 px-2 w-8 text-right">#</th>
              <th className="py-2 px-2 text-left">종목명</th>
              <th className="py-2 px-2 text-right">현재가</th>
              <th className="py-2 px-2 text-right">등락률</th>
              <th className="py-2 px-2 text-right">거래대금</th>
              {BO_FILTERS.map((c) => (
                <th key={c.key} className="py-2 px-2 text-center">{c.label}</th>
              ))}
              <th className="py-2 px-2 text-center">통과</th>
              <th className="py-2 px-2 text-right text-fg-muted">전고점거리</th>
              <th className="py-2 px-2 text-right text-fg-muted">박스상단</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.code} className={`border-b border-border/60 hover:bg-bg-inner ${rowBg(r.pass_count, 5)}`}>
                <td className="py-2 px-2 text-right text-fg-muted">{i + 1}</td>
                <td className="py-2 px-2 cursor-pointer" onClick={() => onSelectCode?.(r.code)}>
                  <div className="text-fg-white font-semibold hover:text-accent">{r.name}</div>
                  <div className="text-[11px] text-fg-muted">{r.code}</div>
                </td>
                <td className="py-2 px-2 text-right">{formatInt(r.price)}</td>
                <td className={`py-2 px-2 text-right ${changeColor(r.change_rate)}`}>{formatChangeRate(r.change_rate)}</td>
                <td className="py-2 px-2 text-right">{formatKRWCompact(r.trade_value)}</td>
                {BO_FILTERS.map((c) => (
                  <td key={c.key} className="py-2 px-2 text-center">
                    <FilterDot ok={r.filters?.[c.key]} />
                  </td>
                ))}
                <td className="py-2 px-2 text-center"><ScoreBadge score={r.pass_count} max={5} /></td>
                <td className="py-2 px-2 text-right text-xs">
                  {r.detail?.near_high_dist_pct != null
                    ? <span className={r.detail.near_high_dist_pct <= 3 ? 'text-up' : 'text-fg-muted'}>
                        {r.detail.near_high_dist_pct.toFixed(1)}%
                      </span>
                    : '—'}
                </td>
                <td className="py-2 px-2 text-right text-fg-muted text-xs">
                  {r.detail?.darvas?.box_top ? formatInt(r.detail.darvas.box_top) : '—'}
                </td>
              </tr>
            ))}
            {!loading && rows.length === 0 && (
              <tr><td colSpan={13} className="py-8 text-center text-fg-muted">데이터 없음</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-3 p-3 rounded-lg bg-bg-inner border border-border text-xs text-fg-muted leading-relaxed">
        <span className="text-fg-bright font-medium">진입 가이드</span> — 돌파 확인 후 종가 1차 진입 (장중 추격 금지) ·{' '}
        <span className="text-warn">손절</span> 매수가 -5~8% 또는 박스 하단 이탈 ·{' '}
        <span className="text-up">익절</span> 평균 손실의 2~3배 분할 매도 ·{' '}
        <span className="text-accent">피라미딩</span> 새 박스 상단 돌파 시 추가 가능
      </div>
    </div>
  );
}

// ── 메인 Screener ─────────────────────────────────────────────────

export default function Screener({ onSelectCode, onGoJournal }) {
  const [subTab, setSubTab] = useState('closing');
  const [regime, setRegime] = useState(null);

  useEffect(() => {
    api.screener
      .marketRegime()
      .then(setRegime)
      .catch(() => {});
  }, []);

  return (
    <Card
      title="스크리너"
      subtitle="종가배팅 · 눌림목 · 돌파 스윙"
    >
      <RegimeBanner regime={regime} />

      <div className="flex gap-0 mb-4 rounded-md overflow-hidden border border-border w-fit">
        {SUB_TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setSubTab(t.id)}
            className={`px-4 py-2 text-sm transition-colors border-r border-border last:border-r-0 ${
              subTab === t.id
                ? 'bg-accent/15 text-accent font-semibold'
                : 'text-fg-muted hover:text-fg-bright'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {subTab === 'closing' && <ClosingBetTab onSelectCode={onSelectCode} onGoJournal={onGoJournal} />}
      {subTab === 'pullback' && <PullbackTab onSelectCode={onSelectCode} />}
      {subTab === 'breakout' && <BreakoutTab onSelectCode={onSelectCode} />}
    </Card>
  );
}
