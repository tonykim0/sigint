import { useEffect, useMemo, useRef, useState } from 'react';
import {
  CandlestickSeries,
  ColorType,
  HistogramSeries,
  LineStyle,
  LineSeries,
  createChart,
} from 'lightweight-charts';
import { api } from '../utils/api.js';
import {
  changeColor,
  formatChangeRate,
  formatInt,
  formatKRWCompact,
} from '../utils/format.js';
import Card from './Card.jsx';

const CHART_OPTIONS = {
  layout: {
    background: { type: ColorType.Solid, color: '#06070a' },
    textColor: '#9ca3af',
  },
  grid: {
    vertLines: { color: '#1e2228' },
    horzLines: { color: '#1e2228' },
  },
  crosshair: { mode: 0 },
  timeScale: { borderColor: '#1e2228', timeVisible: false },
  rightPriceScale: { borderColor: '#1e2228' },
  autoSize: true,
};

function CandleChart({ bars, ma5, ma20, ma60, darvas, refCandles }) {
  const containerRef = useRef(null);
  const chartRef = useRef(null);
  const seriesRef = useRef({});
  const priceLinesRef = useRef([]);

  useEffect(() => {
    if (!containerRef.current) return;
    const chart = createChart(containerRef.current, CHART_OPTIONS);
    const candle = chart.addSeries(CandlestickSeries, {
      upColor: '#ef4444',
      downColor: '#3b82f6',
      borderUpColor: '#ef4444',
      borderDownColor: '#3b82f6',
      wickUpColor: '#ef4444',
      wickDownColor: '#3b82f6',
    });
    const volume = chart.addSeries(HistogramSeries, {
      priceFormat: { type: 'volume' },
      priceScaleId: 'vol',
    });
    chart
      .priceScale('vol')
      .applyOptions({ scaleMargins: { top: 0.8, bottom: 0 } });

    const ma5Series = chart.addSeries(LineSeries, {
      color: '#f59e0b',
      lineWidth: 1,
      priceLineVisible: false,
      lastValueVisible: false,
    });
    const ma20Series = chart.addSeries(LineSeries, {
      color: '#3b82f6',
      lineWidth: 1,
      priceLineVisible: false,
      lastValueVisible: false,
    });
    const ma60Series = chart.addSeries(LineSeries, {
      color: '#a78bfa',
      lineWidth: 1,
      priceLineVisible: false,
      lastValueVisible: false,
    });

    chartRef.current = chart;
    seriesRef.current = { candle, volume, ma5Series, ma20Series, ma60Series };
    priceLinesRef.current = [];

    return () => {
      chart.remove();
      chartRef.current = null;
      seriesRef.current = {};
    };
  }, []);

  useEffect(() => {
    if (!chartRef.current || !bars) return;
    const { candle, volume, ma5Series, ma20Series, ma60Series } =
      seriesRef.current;
    candle.setData(
      bars.map((b) => ({
        time: b.date,
        open: b.open,
        high: b.high,
        low: b.low,
        close: b.close,
      })),
    );
    volume.setData(
      bars.map((b) => ({
        time: b.date,
        value: b.volume,
        color: b.close >= b.open ? '#ef444488' : '#3b82f688',
      })),
    );

    const toLine = (series) =>
      bars
        .map((b, i) => ({ time: b.date, value: series?.[i] }))
        .filter((d) => d.value != null);
    ma5Series.setData(toLine(ma5));
    ma20Series.setData(toLine(ma20));
    ma60Series.setData(toLine(ma60));

    // 다바스 박스 price lines
    const { candle: candleSeries } = seriesRef.current;
    priceLinesRef.current.forEach((pl) => { try { candleSeries.removePriceLine(pl); } catch (_) {} });
    priceLinesRef.current = [];
    if (darvas?.box_top) {
      const pl = candleSeries.createPriceLine({ price: darvas.box_top, color: '#ef444490', lineWidth: 1, lineStyle: LineStyle.Dashed, title: 'Box Top' });
      priceLinesRef.current.push(pl);
    }
    if (darvas?.box_bottom) {
      const pl = candleSeries.createPriceLine({ price: darvas.box_bottom, color: '#3b82f690', lineWidth: 1, lineStyle: LineStyle.Dashed, title: 'Box Bottom' });
      priceLinesRef.current.push(pl);
    }

    // 기준봉 마커
    const markers = (refCandles || []).map((rc) => ({
      time: rc.date,
      position: 'belowBar',
      color: '#10b981',
      shape: 'arrowUp',
      text: '기준봉',
    }));
    try { candleSeries.setMarkers(markers.sort((a, b) => a.time.localeCompare(b.time))); } catch (_) {}

    chartRef.current.timeScale().fitContent();
  }, [bars, ma5, ma20, ma60, darvas, refCandles]);

  return <div ref={containerRef} className="w-full h-[420px]" />;
}

function PatternBadge({ label, active, color }) {
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium border transition-colors ${
        active
          ? `border-${color}/50 bg-${color}/15 text-${color}`
          : 'border-border bg-bg-inner text-fg-muted'
      }`}
      style={active ? { borderColor: `${color}80`, background: `${color}18`, color } : {}}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${active ? '' : 'opacity-30'}`}
        style={{ background: active ? color : '#4b5563' }} />
      {label}
    </span>
  );
}

function PatternPanel({ patterns }) {
  if (!patterns) return null;
  const { trendTemplate: tt, vcp, darvas, refCandles } = patterns;
  const hasRef = (refCandles?.candles?.length || 0) > 0;
  return (
    <div className="mb-3">
      <div className="flex flex-wrap gap-2 mb-2">
        <PatternBadge label="추세 적격" active={tt?.qualified} color="#10b981" />
        <PatternBadge label="VCP 감지" active={vcp?.detected} color="#a78bfa" />
        <PatternBadge label="다바스 박스" active={!!(darvas?.box_top)} color="#f59e0b" />
        <PatternBadge label="기준봉" active={hasRef} color="#ef4444" />
      </div>
      {tt?.qualified && (
        <div className="text-[11px] text-fg-muted">
          MA배열 적격 · 52주 고가 {tt.detail?.w52_high_pct}% · 저가 {tt.detail?.w52_low_pct}%
        </div>
      )}
      {darvas?.box_top && (
        <div className="text-[11px] text-fg-muted">
          다바스 상단 <span className="text-warn">{darvas.box_top?.toLocaleString('ko-KR')}</span>
          {darvas.box_bottom && <> · 하단 <span className="text-down">{darvas.box_bottom?.toLocaleString('ko-KR')}</span></>}
          {darvas.top_distance_pct != null && <> · 현재 상단까지 <span className="text-fg-bright">{darvas.top_distance_pct}%</span></>}
        </div>
      )}
      {hasRef && (
        <div className="text-[11px] text-fg-muted">
          기준봉: {refCandles.candles[0].date} ·{' '}
          거래량 <span className="text-up">{refCandles.candles[0].vol_ratio}x</span> ·{' '}
          몸통 {(refCandles.candles[0].body_ratio * 100).toFixed(0)}%
        </div>
      )}
    </div>
  );
}

function IndicatorTile({ label, value, accent }) {
  return (
    <div className="flex items-center justify-between py-2 px-3 bg-bg-inner rounded-md">
      <span className="text-xs text-fg-muted">{label}</span>
      <span className={`text-sm font-semibold ${accent || 'text-fg-white'}`}>
        {value}
      </span>
    </div>
  );
}

function IndicatorsPanel({ summary }) {
  if (!summary) return null;
  const arr = summary.ma_arrangement;
  const arrColor =
    arr === '정배열'
      ? 'text-up'
      : arr === '역배열'
        ? 'text-down'
        : 'text-warn';
  const rsi = summary.rsi;
  const rsiColor =
    rsi == null
      ? 'text-fg-muted'
      : rsi >= 70
        ? 'text-up'
        : rsi <= 30
          ? 'text-down'
          : 'text-fg-white';
  const macdHist = summary.macd_hist;
  const macdColor =
    macdHist == null
      ? 'text-fg-muted'
      : macdHist > 0
        ? 'text-up'
        : 'text-down';
  const bbPos = summary.bb_position;
  const bbLabel =
    bbPos == null
      ? '—'
      : bbPos >= 0.8
        ? `상단 (${(bbPos * 100).toFixed(0)}%)`
        : bbPos <= 0.2
          ? `하단 (${(bbPos * 100).toFixed(0)}%)`
          : `중단 (${(bbPos * 100).toFixed(0)}%)`;
  const volRatio = summary.volume_ratio;
  const volColor =
    volRatio == null
      ? 'text-fg-muted'
      : volRatio >= 2
        ? 'text-up'
        : volRatio < 0.5
          ? 'text-down'
          : 'text-fg-white';

  return (
    <div className="grid grid-cols-2 gap-3">
      <div className="space-y-2">
        <IndicatorTile label="이평선 배열" value={arr || '—'} accent={arrColor} />
        <IndicatorTile
          label="RSI(14)"
          value={rsi != null ? rsi.toFixed(1) : '—'}
          accent={rsiColor}
        />
        <IndicatorTile
          label="MACD Hist"
          value={macdHist != null ? macdHist.toFixed(2) : '—'}
          accent={macdColor}
        />
        <IndicatorTile
          label="MA5 / MA20 / MA60"
          value={`${summary.ma5?.toFixed(0) ?? '—'} / ${summary.ma20?.toFixed(0) ?? '—'} / ${summary.ma60?.toFixed(0) ?? '—'}`}
        />
      </div>
      <div className="space-y-2">
        <IndicatorTile
          label="거래량 배율 (20일 평균)"
          value={volRatio != null ? `${volRatio.toFixed(2)}x` : '—'}
          accent={volColor}
        />
        <IndicatorTile label="볼린저 위치" value={bbLabel} />
        <IndicatorTile label="캔들 패턴" value={summary.candle_pattern || '—'} />
      </div>
    </div>
  );
}

function SearchBox({ onSelect }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [open, setOpen] = useState(false);
  const timerRef = useRef(null);
  const boxRef = useRef(null);

  useEffect(() => {
    const handleClick = (e) => { if (!boxRef.current?.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const handleChange = (v) => {
    setQuery(v);
    clearTimeout(timerRef.current);
    if (!v.trim()) { setResults([]); setOpen(false); return; }
    timerRef.current = setTimeout(() => {
      api.search(v.trim())
        .then((d) => { setResults(d.results || []); setOpen(true); })
        .catch(() => {});
    }, 200);
  };

  const select = (item) => {
    setQuery('');
    setResults([]);
    setOpen(false);
    onSelect(item.code, item.name);
  };

  return (
    <div ref={boxRef} className="relative">
      <input
        value={query}
        onChange={(e) => handleChange(e.target.value)}
        placeholder="종목명 검색"
        className="bg-bg-inner border border-border rounded-md px-3 py-2 text-sm text-fg-white w-36 focus:outline-none focus:border-accent placeholder:text-fg-muted/50"
      />
      {open && results.length > 0 && (
        <div className="absolute top-full left-0 mt-1 w-52 bg-bg-card border border-border rounded-lg shadow-xl z-50 overflow-hidden">
          {results.map((r) => (
            <button
              key={r.code}
              onClick={() => select(r)}
              className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-bg-inner transition-colors"
            >
              <span className="text-fg-muted text-[11px] tabular-nums w-14">{r.code}</span>
              <span className="text-fg-white text-sm">{r.name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function ChartAnalysis({ initialCode }) {
  const [input, setInput] = useState(initialCode || '005930');
  const [code, setCode] = useState(initialCode || '005930');
  const [price, setPrice] = useState(null);
  const [chart, setChart] = useState(null);
  const [patterns, setPatterns] = useState(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(null);

  useEffect(() => {
    if (initialCode) {
      setInput(initialCode);
      setCode(initialCode);
    }
  }, [initialCode]);

  useEffect(() => {
    if (!/^\d{6}$/.test(code)) return;
    let cancelled = false;
    setLoading(true);
    setErr(null);
    setPatterns(null);
    Promise.all([api.price(code), api.chart(code, { days: 120 })])
      .then(([p, c]) => {
        if (cancelled) return;
        setPrice(p);
        setChart(c);
      })
      .catch((e) => {
        if (cancelled) return;
        setPrice(null);
        setChart(null);
        setErr(e.message);
      })
      .finally(() => !cancelled && setLoading(false));
    // 패턴 분석 (별도 — 느려도 UI 블로킹 안 함)
    Promise.all([
      api.screener.trendTemplate(code).catch(() => null),
      api.screener.vcp(code).catch(() => null),
      api.screener.darvasBox(code).catch(() => null),
      api.screener.referenceCandle(code, 10).catch(() => null),
    ]).then(([tt, vcp, darvas, refCandles]) => {
      if (!cancelled) setPatterns({ trendTemplate: tt, vcp, darvas, refCandles });
    });
    return () => { cancelled = true; };
  }, [code]);

  const analysis = chart?.analysis;
  const bars = chart?.bars;

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex items-center gap-3">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value.replace(/\D/g, '').slice(0, 6))}
            onKeyDown={(e) => e.key === 'Enter' && setCode(input)}
            placeholder="코드 6자리"
            className="bg-bg-inner border border-border rounded-md px-3 py-2 text-sm text-fg-white w-32 focus:outline-none focus:border-accent tabular-nums"
          />
          <button
            onClick={() => setCode(input)}
            className="px-3 py-2 text-sm rounded-md bg-accent/15 border border-accent text-accent hover:bg-accent/25"
          >
            조회
          </button>
          <SearchBox onSelect={(c, n) => { setInput(c); setCode(c); }} />
          {loading && <span className="text-xs text-fg-muted">불러오는 중…</span>}
          {err && <span className="text-xs text-warn">{err}</span>}
          <div className="ml-auto text-right">
            {price && (
              <>
                <div className="text-xs text-fg-muted">
                  {code} · {price.market} · {price.sector}
                </div>
                <div className="text-2xl font-bold text-fg-white">
                  {formatInt(price.price)}
                  <span
                    className={`ml-3 text-sm ${changeColor(price.change_rate)}`}
                  >
                    {formatChangeRate(price.change_rate)}{' '}
                    {price.prev_diff > 0 ? '▲' : price.prev_diff < 0 ? '▼' : ''}
                    {formatInt(Math.abs(price.prev_diff))}
                  </span>
                </div>
                <div className="text-xs text-fg-muted">
                  시총 {formatKRWCompact(price.market_cap * 1_0000_0000)} · PER{' '}
                  {price.per} · 외인 {price.foreign_ratio}%
                </div>
              </>
            )}
          </div>
        </div>
      </Card>

      <Card title="일봉 + 이평선 + 거래량">
        {bars && bars.length > 0 ? (
          <CandleChart
            bars={bars}
            ma5={analysis?.ma5}
            ma20={analysis?.ma20}
            ma60={analysis?.ma60}
            darvas={patterns?.darvas}
            refCandles={patterns?.refCandles?.candles}
          />
        ) : (
          <div className="h-[420px] flex items-center justify-center text-fg-muted text-sm">
            {loading ? '차트 로딩…' : '차트 데이터 없음'}
          </div>
        )}
      </Card>

      <Card title="기술적 지표">
        <PatternPanel patterns={patterns} />
        <IndicatorsPanel summary={analysis?.summary} />
      </Card>
    </div>
  );
}
