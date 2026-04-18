import { useEffect, useMemo, useRef, useState } from 'react';
import {
  CartesianGrid,
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
  notifyStopLoss,
  notifyTakeProfit,
  requestPermission,
} from '../utils/notify.js';
import {
  changeColor,
  formatChangeRate,
  formatInt,
} from '../utils/format.js';
import Card from './Card.jsx';

const REASONS = [
  { id: 'closing_bet', label: '종가배팅' },
  { id: 'breakout', label: '돌파 스윙' },
  { id: 'pullback', label: '눌림목 스윙' },
];

function todayStr() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function returnPct(e) {
  if (!e.exit_price) return null;
  return ((e.exit_price - e.entry_price) / e.entry_price) * 100;
}

function trackPct(entry_price, v) {
  if (v == null) return null;
  return ((v - entry_price) / entry_price) * 100;
}

function StatBox({ label, value, tone = '' }) {
  return (
    <div className="rounded-lg bg-bg-inner border border-border px-3 py-2">
      <div className="text-[11px] text-fg-muted">{label}</div>
      <div className={`text-base font-semibold mt-0.5 ${tone}`}>{value}</div>
    </div>
  );
}

function ReasonBadge({ reason }) {
  const map = {
    closing_bet: 'bg-accent/15 text-accent border-accent/40',
    breakout: 'bg-up/15 text-up border-up/40',
    pullback: 'bg-inst/15 text-inst border-inst/40',
  };
  const label = REASONS.find((r) => r.id === reason)?.label || reason;
  return (
    <span
      className={`inline-block px-1.5 py-0.5 text-[10px] rounded border ${map[reason] || 'border-border text-fg-muted'}`}
    >
      {label}
    </span>
  );
}

function CategoryBadge({ category }) {
  if (!category) return <span className="text-fg-muted text-[11px]">—</span>;
  const color =
    category === '추세형'
      ? 'text-up'
      : category === '단발형'
        ? 'text-warn'
        : 'text-inst';
  return <span className={`text-[11px] font-medium ${color}`}>{category}</span>;
}

function TrackCell({ entry_price, value }) {
  if (value == null) return <span className="text-fg-muted">—</span>;
  const pct = trackPct(entry_price, value);
  return (
    <div className="leading-tight">
      <div>{formatInt(value)}</div>
      <div className={`text-[10px] ${changeColor(pct)}`}>
        {formatChangeRate(pct)}
      </div>
    </div>
  );
}

function MonthlyChart({ entries }) {
  const data = useMemo(() => {
    const map = {};
    for (const e of entries) {
      if (!e.exit_price || !e.exit_date) continue;
      const ym = e.exit_date.slice(0, 7);
      if (!map[ym]) map[ym] = 0;
      map[ym] += ((e.exit_price - e.entry_price) / e.entry_price) * 100;
    }
    return Object.entries(map)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, ret]) => ({ month, ret: parseFloat(ret.toFixed(2)) }));
  }, [entries]);

  if (data.length < 2) return null;
  return (
    <div className="mb-4">
      <div className="text-xs text-fg-muted mb-2 font-medium">월별 수익 곡선</div>
      <ResponsiveContainer width="100%" height={160}>
        <LineChart data={data} margin={{ top: 4, right: 8, bottom: 4, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#1e2228" />
          <XAxis dataKey="month" tick={{ fill: '#6b7280', fontSize: 10 }} />
          <YAxis tick={{ fill: '#6b7280', fontSize: 10 }} tickFormatter={(v) => `${v}%`} />
          <Tooltip
            contentStyle={{ background: '#0d0f13', border: '1px solid #1e2228', borderRadius: 8, fontSize: 12 }}
            labelStyle={{ color: '#e5e7eb' }}
            formatter={(v) => [`${v > 0 ? '+' : ''}${v}%`, '수익률']}
          />
          <ReferenceLine y={0} stroke="#4b5563" strokeDasharray="4 2" />
          <Line type="monotone" dataKey="ret" stroke="#10b981" strokeWidth={2}
            dot={{ r: 3, fill: '#10b981' }} activeDot={{ r: 5 }} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function AlertCell({ entry }) {
  const tracked = entry.tracking || {};
  const latest = tracked.d3 ?? tracked.d5 ?? tracked.d10;
  if (entry.exit_price || latest == null) return null;
  const ret = ((latest - entry.entry_price) / entry.entry_price) * 100;
  if (ret <= -5)
    return <span className="px-1.5 py-0.5 text-[10px] rounded bg-down/15 text-down border border-down/30">손절 라인</span>;
  if (ret >= 5)
    return <span className="px-1.5 py-0.5 text-[10px] rounded bg-up/15 text-up border border-up/30">익절 구간</span>;
  return null;
}

function NotifyButton() {
  const [perm, setPerm] = useState(
    typeof Notification !== 'undefined' ? Notification.permission : 'denied',
  );
  const request = async () => {
    const ok = await requestPermission();
    setPerm(ok ? 'granted' : 'denied');
  };
  if (perm === 'granted')
    return <span className="text-[11px] text-up">🔔 알림 허용됨</span>;
  if (perm === 'denied')
    return <span className="text-[11px] text-fg-muted">알림 차단됨 (브라우저 설정)</span>;
  return (
    <button onClick={request}
      className="text-[11px] px-2 py-1 rounded border border-border text-fg-muted hover:text-accent hover:border-accent">
      🔔 손절/익절 알림 허용
    </button>
  );
}

export default function Journal() {
  const [entries, setEntries] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(null);
  const prevAlertsRef = useRef(new Set());
  const [form, setForm] = useState({
    code: '',
    name: '',
    entry_date: todayStr(),
    entry_price: '',
    reason: 'closing_bet',
    weight_pct: '',
    memo: '',
  });
  const [exitEdits, setExitEdits] = useState({}); // {id: {exit_price, exit_date}}

  const reload = async () => {
    setLoading(true);
    setErr(null);
    try {
      const [list, s] = await Promise.all([
        api.journal.list(),
        api.journal.stats(),
      ]);
      setEntries(list.items || []);
      setStats(s);
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    reload();
  }, []);

  // 손절/익절 알림 체크 (entries 바뀔 때마다)
  useEffect(() => {
    const fired = prevAlertsRef.current;
    for (const e of entries) {
      if (e.exit_price) continue;
      const tracked = e.tracking || {};
      const latest = tracked.d3 ?? tracked.d5 ?? tracked.d10;
      if (latest == null) continue;
      const ret = ((latest - e.entry_price) / e.entry_price) * 100;
      const stopKey = `stop-${e.id}`;
      const tpKey = `tp-${e.id}`;
      if (ret <= -5 && !fired.has(stopKey)) {
        fired.add(stopKey);
        notifyStopLoss(e.name || e.code, ret);
      }
      if (ret >= 5 && !fired.has(tpKey)) {
        fired.add(tpKey);
        notifyTakeProfit(e.name || e.code, ret);
      }
    }
  }, [entries]);

  async function autoFillName() {
    const code = form.code.trim();
    if (!/^\d{6}$/.test(code)) return;
    try {
      const p = await api.price(code);
      setForm((f) => ({
        ...f,
        entry_price: f.entry_price || p.price,
      }));
    } catch {
      // silent
    }
  }

  async function submitAdd(e) {
    e.preventDefault();
    if (!/^\d{6}$/.test(form.code.trim())) {
      setErr('종목코드 6자리 입력');
      return;
    }
    if (!form.entry_price) {
      setErr('매수가 입력');
      return;
    }
    try {
      await api.journal.add({
        code: form.code.trim(),
        name: form.name.trim(),
        entry_date: form.entry_date,
        entry_price: Number(form.entry_price),
        reason: form.reason,
        weight_pct: Number(form.weight_pct || 0),
        memo: form.memo,
      });
      setForm({
        code: '',
        name: '',
        entry_date: todayStr(),
        entry_price: '',
        reason: 'closing_bet',
        weight_pct: '',
        memo: '',
      });
      await reload();
    } catch (ex) {
      setErr(ex.message);
    }
  }

  async function saveExit(id) {
    const edit = exitEdits[id];
    if (!edit?.exit_price) return;
    try {
      await api.journal.update(id, {
        exit_price: Number(edit.exit_price),
        exit_date: edit.exit_date || todayStr(),
      });
      setExitEdits((m) => ({ ...m, [id]: undefined }));
      await reload();
    } catch (ex) {
      setErr(ex.message);
    }
  }

  async function refreshTracking(id) {
    try {
      await api.journal.tracking(id);
      await reload();
    } catch (ex) {
      setErr(ex.message);
    }
  }

  async function removeEntry(id) {
    if (!confirm('이 기록을 삭제할까요?')) return;
    try {
      await api.journal.delete(id);
      await reload();
    } catch (ex) {
      setErr(ex.message);
    }
  }

  const sortedEntries = useMemo(
    () =>
      [...entries].sort((a, b) =>
        (b.entry_date || '').localeCompare(a.entry_date || ''),
      ),
    [entries],
  );

  return (
    <div className="space-y-4">
      {/* 통계 */}
      <Card title="매매 통계" subtitle={`총 ${stats?.total_count || 0}건`}
        right={<NotifyButton />}>
        <div className="grid grid-cols-2 md:grid-cols-6 gap-2">
          <StatBox
            label="총 매매"
            value={`${stats?.total_count || 0}건`}
          />
          <StatBox
            label="청산됨 / 보유"
            value={`${stats?.closed_count || 0} / ${stats?.open_count || 0}`}
          />
          <StatBox
            label="승률"
            value={`${stats?.win_rate || 0}%`}
            tone={stats?.win_rate >= 50 ? 'text-up' : 'text-fg-white'}
          />
          <StatBox
            label="평균 수익률"
            value={formatChangeRate(stats?.avg_return_pct)}
            tone={changeColor(stats?.avg_return_pct)}
          />
          <StatBox
            label="평균 수익 / 손실"
            value={
              <>
                <span className={changeColor(stats?.avg_win_pct)}>
                  {formatChangeRate(stats?.avg_win_pct)}
                </span>
                <span className="text-fg-muted mx-1">/</span>
                <span className={changeColor(stats?.avg_loss_pct)}>
                  {formatChangeRate(stats?.avg_loss_pct)}
                </span>
              </>
            }
          />
          <StatBox
            label="손익비 (PF)"
            value={
              stats?.profit_factor == null
                ? '—'
                : stats.profit_factor === Infinity || stats.profit_factor > 99
                  ? '∞'
                  : stats.profit_factor.toFixed(2)
            }
            tone={stats?.profit_factor >= 1.5 ? 'text-up' : 'text-fg-white'}
          />
          <StatBox
            label="연속 최대 승 / 패"
            value={`${stats?.max_consecutive_wins ?? '—'} / ${stats?.max_consecutive_losses ?? '—'}`}
          />
        </div>
        {stats && Object.keys(stats.by_reason).length > 0 && (
          <div className="mt-3 flex flex-wrap gap-3 text-xs">
            {Object.entries(stats.by_reason).map(([r, b]) => (
              <div
                key={r}
                className="rounded border border-border px-2 py-1 flex items-center gap-2"
              >
                <ReasonBadge reason={r} />
                <span className="text-fg-muted">
                  {b.count}건 · 승률{' '}
                  <span
                    className={b.win_rate >= 50 ? 'text-up' : 'text-fg-white'}
                  >
                    {b.win_rate}%
                  </span>{' '}
                  · 평균{' '}
                  <span className={changeColor(b.avg_return)}>
                    {formatChangeRate(b.avg_return)}
                  </span>
                </span>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* 매매 입력 */}
      <Card title="새 매매 기록" subtitle="매수 정보 입력">
        <form
          onSubmit={submitAdd}
          className="grid grid-cols-2 md:grid-cols-7 gap-2 items-end"
        >
          <div>
            <label className="block text-[11px] text-fg-muted mb-1">
              종목코드
            </label>
            <input
              value={form.code}
              onChange={(e) => setForm({ ...form, code: e.target.value })}
              onBlur={autoFillName}
              placeholder="005930"
              className="w-full px-2 py-1.5 bg-bg-inner border border-border rounded text-sm focus:outline-none focus:border-accent"
            />
          </div>
          <div>
            <label className="block text-[11px] text-fg-muted mb-1">
              종목명
            </label>
            <input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="삼성전자"
              className="w-full px-2 py-1.5 bg-bg-inner border border-border rounded text-sm focus:outline-none focus:border-accent"
            />
          </div>
          <div>
            <label className="block text-[11px] text-fg-muted mb-1">
              매수일
            </label>
            <input
              type="date"
              value={form.entry_date}
              onChange={(e) =>
                setForm({ ...form, entry_date: e.target.value })
              }
              className="w-full px-2 py-1.5 bg-bg-inner border border-border rounded text-sm focus:outline-none focus:border-accent"
            />
          </div>
          <div>
            <label className="block text-[11px] text-fg-muted mb-1">
              매수가
            </label>
            <input
              type="number"
              value={form.entry_price}
              onChange={(e) =>
                setForm({ ...form, entry_price: e.target.value })
              }
              placeholder="78000"
              className="w-full px-2 py-1.5 bg-bg-inner border border-border rounded text-sm focus:outline-none focus:border-accent"
            />
          </div>
          <div>
            <label className="block text-[11px] text-fg-muted mb-1">
              기법
            </label>
            <select
              value={form.reason}
              onChange={(e) => setForm({ ...form, reason: e.target.value })}
              className="w-full px-2 py-1.5 bg-bg-inner border border-border rounded text-sm focus:outline-none focus:border-accent"
            >
              {REASONS.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-[11px] text-fg-muted mb-1">
              비중 %
            </label>
            <input
              type="number"
              value={form.weight_pct}
              onChange={(e) =>
                setForm({ ...form, weight_pct: e.target.value })
              }
              placeholder="10"
              className="w-full px-2 py-1.5 bg-bg-inner border border-border rounded text-sm focus:outline-none focus:border-accent"
            />
          </div>
          <button
            type="submit"
            className="px-3 py-1.5 bg-accent/20 border border-accent text-accent rounded text-sm hover:bg-accent/30"
          >
            기록 추가
          </button>
          <div className="col-span-2 md:col-span-7">
            <input
              value={form.memo}
              onChange={(e) => setForm({ ...form, memo: e.target.value })}
              placeholder="재료/메모 (선택)"
              className="w-full px-2 py-1.5 bg-bg-inner border border-border rounded text-sm focus:outline-none focus:border-accent"
            />
          </div>
          {err && <div className="col-span-full text-xs text-warn">{err}</div>}
        </form>
      </Card>

      {/* 월별 차트 */}
      {entries.length >= 2 && (
        <Card title="월별 수익 곡선" subtitle="청산 기준">
          <MonthlyChart entries={entries} />
        </Card>
      )}

      {/* 기록 리스트 */}
      <Card title="매매 기록" subtitle={`${entries.length}건`}>
        {loading && (
          <div className="text-xs text-fg-muted mb-2">조회 중…</div>
        )}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-fg-muted border-b border-border">
                <th className="py-2 px-2 text-left">매수일</th>
                <th className="py-2 px-2 text-left">종목</th>
                <th className="py-2 px-2 text-center">기법</th>
                <th className="py-2 px-2 text-right">매수가</th>
                <th className="py-2 px-2 text-right">비중</th>
                <th className="py-2 px-2 text-right">매도가/일</th>
                <th className="py-2 px-2 text-right">수익률</th>
                <th className="py-2 px-2 text-right">D+1</th>
                <th className="py-2 px-2 text-right">D+3</th>
                <th className="py-2 px-2 text-right">D+5</th>
                <th className="py-2 px-2 text-right">D+10</th>
                <th className="py-2 px-2 text-center">분류</th>
                <th className="py-2 px-2 text-left">경고</th>
                <th className="py-2 px-2 text-center w-24">액션</th>
              </tr>
            </thead>
            <tbody>
              {sortedEntries.map((e) => {
                const ret = returnPct(e);
                const edit = exitEdits[e.id] || {};
                return (
                  <tr
                    key={e.id}
                    className="border-b border-border/60 hover:bg-bg-inner"
                  >
                    <td className="py-2 px-2 text-fg-muted">{e.entry_date}</td>
                    <td className="py-2 px-2">
                      <div className="text-fg-white font-semibold">
                        {e.name || '—'}
                      </div>
                      <div className="text-[10px] text-fg-muted">{e.code}</div>
                    </td>
                    <td className="py-2 px-2 text-center">
                      <ReasonBadge reason={e.reason} />
                    </td>
                    <td className="py-2 px-2 text-right">
                      {formatInt(e.entry_price)}
                    </td>
                    <td className="py-2 px-2 text-right text-fg-muted">
                      {e.weight_pct ? `${e.weight_pct}%` : '—'}
                    </td>
                    <td className="py-2 px-2 text-right">
                      {e.exit_price ? (
                        <div className="leading-tight">
                          <div>{formatInt(e.exit_price)}</div>
                          <div className="text-[10px] text-fg-muted">
                            {e.exit_date}
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1 justify-end">
                          <input
                            type="number"
                            value={edit.exit_price || ''}
                            onChange={(ev) =>
                              setExitEdits((m) => ({
                                ...m,
                                [e.id]: {
                                  ...edit,
                                  exit_price: ev.target.value,
                                },
                              }))
                            }
                            placeholder="매도가"
                            className="w-20 px-1 py-0.5 bg-bg-inner border border-border rounded text-xs text-right"
                          />
                          <button
                            onClick={() => saveExit(e.id)}
                            className="text-[10px] text-accent hover:underline"
                          >
                            청산
                          </button>
                        </div>
                      )}
                    </td>
                    <td className={`py-2 px-2 text-right ${changeColor(ret)}`}>
                      {ret == null ? '—' : formatChangeRate(ret)}
                    </td>
                    <td className="py-2 px-2 text-right">
                      <TrackCell entry_price={e.entry_price} value={e.tracking?.d1} />
                    </td>
                    <td className="py-2 px-2 text-right">
                      <TrackCell
                        entry_price={e.entry_price}
                        value={e.tracking?.d3}
                      />
                    </td>
                    <td className="py-2 px-2 text-right">
                      <TrackCell
                        entry_price={e.entry_price}
                        value={e.tracking?.d5}
                      />
                    </td>
                    <td className="py-2 px-2 text-right">
                      <TrackCell
                        entry_price={e.entry_price}
                        value={e.tracking?.d10}
                      />
                    </td>
                    <td className="py-2 px-2 text-center">
                      <CategoryBadge category={e.category} />
                    </td>
                    <td className="py-2 px-2">
                      <AlertCell entry={e} />
                    </td>
                    <td className="py-2 px-2 text-center">
                      <div className="flex gap-1 justify-center">
                        <button
                          onClick={() => refreshTracking(e.id)}
                          className="text-[10px] text-fg-muted hover:text-accent"
                          title="D+3/5/10 갱신"
                        >
                          갱신
                        </button>
                        <span className="text-border">|</span>
                        <button
                          onClick={() => removeEntry(e.id)}
                          className="text-[10px] text-fg-muted hover:text-down"
                        >
                          삭제
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {!loading && entries.length === 0 && (
                <tr>
                  <td colSpan={13} className="py-8 text-center text-fg-muted">
                    아직 기록이 없습니다. 위 폼에서 매수 기록을 추가하세요.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
