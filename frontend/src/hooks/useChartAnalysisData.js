import { useEffect, useState } from 'react';
import { api } from '../utils/api.js';

export function useChartAnalysisData(initialCode) {
  const seedCode = initialCode || '005930';
  const [input, setInput] = useState(seedCode);
  const [code, setCode] = useState(seedCode);
  const [timeframe, setTimeframe] = useState('D');
  const [requestKey, setRequestKey] = useState(0);
  const [price, setPrice] = useState(null);
  const [chart, setChart] = useState(null);
  const [minuteBars, setMinuteBars] = useState(null);
  const [patterns, setPatterns] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);

  const isIntraday = timeframe !== 'D';

  function submitCode(nextValue = input) {
    const normalized = nextValue.replace(/\D/g, '').slice(0, 6);
    setInput(normalized);
    if (!/^\d{6}$/.test(normalized)) {
      setErr('종목코드 6자리를 입력하세요.');
      return;
    }
    setLoading(true);
    setErr(null);
    setMinuteBars(null);
    setPatterns(null);
    setCode(normalized);
    setRequestKey((key) => key + 1);
  }

  function selectTimeframe(nextTimeframe) {
    setTimeframe(nextTimeframe);
    if (nextTimeframe !== 'D') {
      setMinuteBars(null);
    }
  }

  useEffect(() => {
    if (!/^\d{6}$/.test(code)) return;
    let cancelled = false;

    api.chartAnalysis(code, { days: 500 })
      .then((data) => {
        if (cancelled) return;
        setPrice(data.price || null);
        setChart(data.chart || null);
        setPatterns(data.patterns || null);
      })
      .catch((e) => {
        if (cancelled) return;
        setPrice(null);
        setChart(null);
        setPatterns(null);
        setErr(e.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [code, requestKey]);

  useEffect(() => {
    if (!/^\d{6}$/.test(code) || !isIntraday) return;
    let cancelled = false;
    // 분봉은 기본 5거래일 치 조회. 1분봉만 30일치 허용 (너무 많은 바 방지)
    const tf = parseInt(timeframe, 10);
    const minuteDays = tf <= 5 ? 5 : 10;
    api.minuteChart(code, { timeUnit: tf, days: minuteDays })
      .then((data) => {
        if (!cancelled) setMinuteBars(data.bars || []);
      })
      .catch(() => {
        if (!cancelled) setMinuteBars([]);
      });
    return () => {
      cancelled = true;
    };
  }, [code, timeframe, isIntraday, requestKey]);

  return {
    input,
    setInput,
    code,
    timeframe,
    price,
    chart,
    minuteBars,
    patterns,
    loading,
    err,
    isIntraday,
    submitCode,
    selectTimeframe,
  };
}
