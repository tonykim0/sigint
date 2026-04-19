import { useMemo } from 'react';
import {
  changeColor,
  formatChangeRate,
  formatKRWCompact,
} from '../utils/format.js';
import Card from './Card.jsx';

// KIS 투자자 금액은 백만원 단위 — 원으로 변환
const KIS_UNIT = 1_000_000;

export default function InvestorTop10({ items, field, title, color, onSelectCode }) {
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
          const value = (r[field] || 0) * KIS_UNIT;
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
