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
} from '../utils/format.js';
import Card from './Card.jsx';

// 투자자별 순매수 금액: KIS 응답은 백만원 단위 → 원으로 변환
const UNIT = 1_000_000;

export default function SupplyDemand({ onSelectCode }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);

  useEffect(() => {
    let cancelled = false;

    async function loadSupplyDemand() {
      try {
        const rk = await api.volumeRank({ topN: 30 });
        if (cancelled) return;
        // ETF 제외 후 top 10 선택
        const stocks = excludeETF(rk.items).slice(0, 10);
        const results = await Promise.all(
          stocks.map(async (r) => {
            try {
              const inv = await api.investorTrend(r.code);
              const latest = inv.items?.[0];
              return { ...r, inv: latest };
            } catch {
              return { ...r, inv: null };
            }
          }),
        );
        if (!cancelled) {
          setRows(results);
          setErr(null);
        }
      } catch (e) {
        if (!cancelled) setErr(e.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadSupplyDemand();
    return () => {
      cancelled = true;
    };
  }, []);

  const chartData = useMemo(
    () =>
      rows.map((r) => ({
        name: r.name.slice(0, 6),
        code: r.code,
        외국인: (r.inv?.foreign_value || 0) * UNIT,
        기관: (r.inv?.institution_value || 0) * UNIT,
        개인: (r.inv?.individual_value || 0) * UNIT,
      })),
    [rows],
  );

  return (
    <div className="space-y-4">
      <Card
        title="수급 비교 — 거래대금 TOP 10"
        right={err && <span className="text-warn">{err}</span>}
      >
        {loading && <div className="text-xs text-fg-muted mb-2">조회 중…</div>}
        <div className="w-full h-[340px]">
          <ResponsiveContainer>
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e2228" />
              <XAxis dataKey="name" tick={{ fill: '#9ca3af', fontSize: 11 }} />
              <YAxis
                tick={{ fill: '#9ca3af', fontSize: 11 }}
                tickFormatter={(v) => formatKRWCompact(v)}
                width={80}
              />
              <Tooltip
                contentStyle={{
                  background: '#0d0f13',
                  border: '1px solid #1e2228',
                  borderRadius: 8,
                  fontSize: 12,
                }}
                formatter={(v) => formatKRWCompact(v)}
                labelStyle={{ color: '#f3f4f6' }}
              />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <ReferenceLine y={0} stroke="#4b5563" />
              <Bar dataKey="외국인" fill="#3b82f6" />
              <Bar dataKey="기관" fill="#a78bfa" />
              <Bar dataKey="개인" fill="#fb923c" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <Card title="수급 상세">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-fg-muted border-b border-border">
                <th className="py-2 px-2 text-left">종목명</th>
                <th className="py-2 px-2 text-right">현재가</th>
                <th className="py-2 px-2 text-right">등락률</th>
                <th className="py-2 px-2 text-right">외국인</th>
                <th className="py-2 px-2 text-right">기관</th>
                <th className="py-2 px-2 text-right">개인</th>
                <th className="py-2 px-2 text-center">양매수</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const fg = (r.inv?.foreign_value || 0) * UNIT;
                const ins = (r.inv?.institution_value || 0) * UNIT;
                const iv = (r.inv?.individual_value || 0) * UNIT;
                const dualBuy = fg > 0 && ins > 0;
                return (
                  <tr
                    key={r.code}
                    className={`border-b border-border/60 hover:bg-bg-inner cursor-pointer ${dualBuy ? 'bg-accent/10' : ''}`}
                    onClick={() => onSelectCode?.(r.code)}
                  >
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
                    <td
                      className={`py-2 px-2 text-right ${fg > 0 ? 'text-up' : fg < 0 ? 'text-down' : 'text-fg-muted'}`}
                    >
                      {formatKRWCompact(fg)}
                    </td>
                    <td
                      className={`py-2 px-2 text-right ${ins > 0 ? 'text-up' : ins < 0 ? 'text-down' : 'text-fg-muted'}`}
                    >
                      {formatKRWCompact(ins)}
                    </td>
                    <td
                      className={`py-2 px-2 text-right ${iv > 0 ? 'text-up' : iv < 0 ? 'text-down' : 'text-fg-muted'}`}
                    >
                      {formatKRWCompact(iv)}
                    </td>
                    <td className="py-2 px-2 text-center">
                      {dualBuy && (
                        <span className="px-2 py-0.5 text-[10px] font-bold rounded bg-accent/20 text-accent border border-accent/50">
                          양매수
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
              {rows.length === 0 && !loading && (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-fg-muted">
                    데이터가 없습니다.
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
