import { useMemo, useState } from 'react';
import { api } from '../utils/api.js';
import {
  changeColor,
  formatChangeRate,
  formatInt,
  formatKRWCompact,
} from '../utils/format.js';
import { useScreenerData } from '../hooks/useScreenerData.js';
import Card from './Card.jsx';

const SUB_TABS = [
  { id: 'closing', label: '종가배팅' },
  { id: 'pullback', label: '눌림목 스윙' },
  { id: 'breakout', label: '돌파 스윙' },
];

function todayStr() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

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

// ── 진입 플랜 패널 ───────────────────────────────────────────────
function EntryPlanCard({ title, items, note }) {
  return (
    <div className="mb-4 p-4 rounded-lg border border-accent/40 bg-accent/5">
      <div className="text-xs text-accent font-semibold mb-2">🎯 {title}</div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {items.map((it) => (
          <div key={it.label} className="bg-bg-inner rounded-md px-3 py-2">
            <div className="text-[10px] text-fg-muted">{it.label}</div>
            <div className={`text-sm font-semibold tabular-nums ${it.color || 'text-fg-white'}`}>
              {it.value}
            </div>
            {it.sub && <div className="text-[10px] text-fg-muted">{it.sub}</div>}
          </div>
        ))}
      </div>
      {note && <div className="mt-2 text-[11px] text-fg-muted leading-relaxed">{note}</div>}
    </div>
  );
}

function ClosingEntryPlan({ stock }) {
  if (!stock) return null;
  const price = stock.price;
  return (
    <EntryPlanCard
      title={`종가배팅 1순위 — ${stock.name} (${stock.pass_count}/5 통과)`}
      items={[
        { label: '진입 타이밍', value: '14:30 ~ 15:20 종가 부근', color: 'text-accent' },
        { label: '1차 진입가', value: `${Math.round(price * 0.997).toLocaleString('ko-KR')} ~ ${price.toLocaleString('ko-KR')}`, sub: '현재가 -0.3%~현재가' },
        { label: '비중 분할', value: '종가 60% + 익일 시초 40%', color: 'text-warn' },
        { label: '손절선', value: Math.round(price * 0.97).toLocaleString('ko-KR'), color: 'text-down', sub: '진입가 -3%' },
        { label: '1차 익절', value: Math.round(price * 1.03).toLocaleString('ko-KR'), color: 'text-up', sub: '진입가 +3% (50% 매도)' },
        { label: '손익비', value: '1 : 1 (종가배팅)', sub: '단타 원칙' },
      ]}
      note="• 오늘 장마감 전 양매수 지속 확인 후 진입  • 익일 시초 40%는 갭 방향에 따라 판단 (갭상승 시 매도, 갭하락 시 추가매수)"
    />
  );
}

function PullbackEntryPlan({ stock }) {
  if (!stock) return null;
  const { detail = {}, price } = stock;
  const ma5 = detail.ma5;
  const refMid = detail.ref_mid;
  const refOpen = detail.ref_open;
  const entry1 = Math.min(ma5 || Infinity, refMid || Infinity);
  const validEntry = entry1 !== Infinity ? Math.round(entry1) : price;
  const stop = refOpen ? Math.min(refOpen, Math.round(validEntry * 0.95)) : Math.round(validEntry * 0.95);
  const target = Math.round(validEntry * 1.05);
  return (
    <EntryPlanCard
      title={`눌림목 스윙 1순위 — ${stock.name} (${stock.pass_count}/4 통과)`}
      items={[
        { label: '1차 진입가 (20%)', value: validEntry.toLocaleString('ko-KR'), color: 'text-accent',
          sub: refMid ? `기준봉 중간 ${refMid.toLocaleString('ko-KR')} / MA5 ${ma5?.toLocaleString('ko-KR')}` : '5일선 부근' },
        { label: '2차 진입가 (40%)', value: Math.round(validEntry * 0.98).toLocaleString('ko-KR'), sub: '1차 -2%' },
        { label: '3차 진입가 (40%)', value: Math.round(validEntry * 0.96).toLocaleString('ko-KR'), sub: '1차 -4%' },
        { label: '손절선', value: stop.toLocaleString('ko-KR'), color: 'text-down',
          sub: refOpen ? `기준봉 시가 ${refOpen.toLocaleString('ko-KR')} 또는 -5%` : '평단 -5%' },
        { label: '1차 익절', value: target.toLocaleString('ko-KR'), color: 'text-up', sub: '평단 +5% (50% 매도)' },
        { label: '타임컷', value: '3거래일 횡보', sub: '본절 부근 청산' },
      ]}
      note={
        `• 현재가 ${price.toLocaleString('ko-KR')} · 기준봉 ${detail.reference_candle?.date || '—'} (경과 ${detail.days_since_ref ?? '—'}일, 거래량 ${detail.reference_candle?.vol_ratio ?? '—'}x)  ` +
        `• 잔여 50% 는 5일선 이탈 시 청산`
      }
    />
  );
}

function BreakoutEntryPlan({ stock }) {
  if (!stock) return null;
  const { detail = {}, price } = stock;
  const box = detail.darvas || {};
  const boxTop = box.box_top;
  const boxBottom = box.box_bottom;
  const recentHigh = detail.recent_high;
  const entry = Math.round(boxTop || recentHigh || price);
  const stop = Math.round(boxBottom || entry * 0.92);
  const loss = entry - stop;
  const target1 = Math.round(entry + loss * 2);
  const target2 = Math.round(entry + loss * 3);
  return (
    <EntryPlanCard
      title={`돌파 스윙 1순위 — ${stock.name} (${stock.pass_count}/5 통과)`}
      items={[
        { label: '진입가 (돌파 확인 후)', value: entry.toLocaleString('ko-KR'), color: 'text-accent',
          sub: boxTop ? `다바스 상단 ${boxTop.toLocaleString('ko-KR')}` : (recentHigh ? `전고점 ${recentHigh.toLocaleString('ko-KR')}` : '현재가') },
        { label: '현재가', value: price.toLocaleString('ko-KR'),
          sub: detail.near_high_dist_pct != null ? `전고점까지 ${detail.near_high_dist_pct}%` : '' },
        { label: '손절선', value: stop.toLocaleString('ko-KR'), color: 'text-down',
          sub: boxBottom ? `박스 하단 ${boxBottom.toLocaleString('ko-KR')}` : '진입가 -8%' },
        { label: '1차 익절 (R×2)', value: target1.toLocaleString('ko-KR'), color: 'text-up', sub: `+${(target1 / entry * 100 - 100).toFixed(1)}%` },
        { label: '2차 익절 (R×3)', value: target2.toLocaleString('ko-KR'), color: 'text-up', sub: `+${(target2 / entry * 100 - 100).toFixed(1)}%` },
        { label: '타이밍', value: '돌파 확인 당일 종가', color: 'text-accent', sub: '장중 추격 금지' },
      ]}
      note={
        `• 돌파 확인 = 전고점 돌파 + 거래량 50일 평균 150%+  ` +
        `• 손실폭 1R = ${loss.toLocaleString('ko-KR')}원  ` +
        `• 익절 후 새 박스 형성 시 피라미딩 추가 매수 가능`
      }
    />
  );
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
  const [memos, setMemos] = useState({});
  const { data, loading, err, refresh } = useScreenerData('closing');

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

  const top = sorted[0];

  return (
    <div>
      {top && top.pass_count >= 3 && <ClosingEntryPlan stock={top} />}
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
            onClick={() => refresh(true)}
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
                      api.journal.add({
                        code: r.code, name: r.name, entry_date: todayStr(),
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
  const [memos, setMemos] = useState({});
  const { data, loading, err, refresh } = useScreenerData('pullback');

  const rows = useMemo(() => {
    if (!data?.stocks) return [];
    return data.stocks.map((s) => ({
      ...s,
      memo: memos[s.code] || { hasMaterial: false, note: '' },
      total: s.pass_count + (memos[s.code]?.hasMaterial ? 1 : 0),
    }));
  }, [data, memos]);

  const topPB = [...rows].sort((a, b) => (b.pass_count || 0) - (a.pass_count || 0))[0];

  return (
    <div>
      {topPB && topPB.pass_count >= 3 && <PullbackEntryPlan stock={topPB} />}
      <div className="flex items-center gap-3 mb-3 text-xs">
        <span className="text-fg-muted">기준봉 출현 후 눌림 구간 매수 타점 탐색</span>
        <div className="ml-auto flex items-center gap-2">
          {data?.generated_at && <span className="text-fg-muted">{data.generated_at.slice(11, 19)}</span>}
          <button onClick={() => refresh(true)} disabled={loading}
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
  const { data, loading, err, refresh } = useScreenerData('breakout');
  const rows = data?.stocks || [];
  const topBO = [...rows].sort((a, b) => (b.pass_count || 0) - (a.pass_count || 0))[0];

  return (
    <div>
      {topBO && topBO.pass_count >= 3 && <BreakoutEntryPlan stock={topBO} />}
      <div className="flex items-center gap-3 mb-3 text-xs">
        <span className="text-fg-muted">전고점 돌파 + 추세 적격 종목 탐색 (미너비니 기반)</span>
        <div className="ml-auto flex items-center gap-2">
          {data?.generated_at && <span className="text-fg-muted">{data.generated_at.slice(11, 19)}</span>}
          <button onClick={() => refresh(true)} disabled={loading}
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
  const { data: regime } = useScreenerData('regime');

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
