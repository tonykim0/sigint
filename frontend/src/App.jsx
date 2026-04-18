import { useEffect, useState } from 'react';
import Header from './components/Header.jsx';
import TabNav from './components/TabNav.jsx';
import Overview from './components/Overview.jsx';
import VolumeRank from './components/VolumeRank.jsx';
import SupplyDemand from './components/SupplyDemand.jsx';
import ChartAnalysis from './components/ChartAnalysis.jsx';
import Screener from './components/Screener.jsx';
import Journal from './components/Journal.jsx';
import { api } from './utils/api.js';

const TABS = [
  { id: 'overview', label: '종합' },
  { id: 'volume', label: '거래대금' },
  { id: 'supply', label: '수급' },
  { id: 'chart', label: '차트분석' },
  { id: 'screener', label: '스크리너' },
  { id: 'journal', label: '매매일지' },
];

export default function App() {
  const [tab, setTab] = useState('overview');
  const [selectedCode, setSelectedCode] = useState(null);
  const [connected, setConnected] = useState(false);

  // 3초 간격 헬스체크
  useEffect(() => {
    let cancelled = false;
    async function ping() {
      try {
        await api.health();
        if (!cancelled) setConnected(true);
      } catch {
        if (!cancelled) setConnected(false);
      }
    }
    ping();
    const id = setInterval(ping, 3000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  function goToChart(code) {
    setSelectedCode(code);
    setTab('chart');
  }

  return (
    <div className="min-h-screen bg-bg-base text-fg-bright">
      <Header connected={connected} />
      {!connected && (
        <div className="flex items-center gap-2 px-6 py-2 bg-warn/10 border-b border-warn/30 text-xs text-warn">
          <span className="inline-block w-2 h-2 rounded-full bg-warn animate-pulse" />
          백엔드 미연결 — 데모 모드. 일부 기능이 동작하지 않습니다.
          <span className="ml-auto text-fg-muted">backend: http://127.0.0.1:8000</span>
        </div>
      )}
      <TabNav tabs={TABS} active={tab} onChange={setTab} />
      <main className="max-w-[1400px] mx-auto px-3 sm:px-6 py-4 sm:py-6">
        {tab === 'overview' && <Overview onSelectCode={goToChart} />}
        {tab === 'volume' && <VolumeRank onSelectCode={goToChart} />}
        {tab === 'supply' && <SupplyDemand onSelectCode={goToChart} />}
        {tab === 'chart' && <ChartAnalysis initialCode={selectedCode} />}
        {tab === 'screener' && <Screener onSelectCode={goToChart} onGoJournal={() => setTab('journal')} />}
        {tab === 'journal' && <Journal />}
      </main>
    </div>
  );
}
