import { useEffect, useState } from 'react';
import { formatTime } from '../utils/format.js';

export default function Header({ connected }) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

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
        <div className="text-accent text-sm font-semibold tracking-wide tabular-nums shrink-0">
          {formatTime(now)}
        </div>
      </div>
    </header>
  );
}
