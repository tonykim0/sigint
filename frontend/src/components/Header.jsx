import { useEffect, useState } from 'react';
import { formatTime } from '../utils/format.js';

// 매매 시간대 정의 (KST 분 단위)
const SLOTS = [
  { start: 540, end: 560, label: '수확/투매', cls: 'bg-warn/15 text-warn border-warn/40' },
  { start: 560, end: 660, label: '프라임 타임', cls: 'bg-accent/15 text-accent border-accent/40' },
  { start: 660, end: 870, label: '매매 금지', cls: 'bg-down/15 text-down border-down/40' },
  { start: 870, end: 920, label: '종가매매 준비', cls: 'bg-blue-500/15 text-blue-300 border-blue-500/40' },
  { start: 920, end: 1440, label: '데이터 정리', cls: 'bg-inst/15 text-inst border-inst/40' },
  { start: 0, end: 540, label: '장 시작 전', cls: 'bg-bg-inner text-fg-muted border-border' },
];

function currentSlot(d) {
  const mins = d.getHours() * 60 + d.getMinutes();
  return SLOTS.find((s) => mins >= s.start && mins < s.end) ?? null;
}

export default function Header({ connected }) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  const slot = currentSlot(now);

  return (
    <header className="border-b border-border bg-bg-card">
      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          <span
            className={`status-dot shrink-0 inline-block w-2 h-2 rounded-full ${
              connected ? 'bg-accent' : 'bg-warn'
            }`}
            title={connected ? '서버 연결됨' : '연결 끊김'}
          />
          <span className="font-bold text-fg-white tracking-tight">SIGINT</span>
          <span className="hidden sm:block text-xs text-fg-muted truncate">
            Signal Intelligence for the Market
          </span>
          {!connected && (
            <span className="px-2 py-0.5 text-[10px] font-bold rounded bg-warn/15 text-warn border border-warn/40">
              DEMO
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          {slot && (
            <span
              className={`hidden sm:inline-block px-2 py-0.5 text-[11px] font-semibold rounded border ${slot.cls}`}
              title="현재 매매 시간대"
            >
              {slot.label}
            </span>
          )}
          <span className="text-accent text-sm font-semibold tracking-wide tabular-nums">
            {formatTime(now)}
          </span>
        </div>
      </div>
    </header>
  );
}
