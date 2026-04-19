import { useEffect, useState } from 'react';
import { api } from '../utils/api.js';

export function useOverviewData() {
  const [indexData, setIndexData] = useState(null);
  const [flow, setFlow] = useState(null);
  const [flowLoading, setFlowLoading] = useState(true);
  const [themes, setThemes] = useState({});
  const [trendData, setTrendData] = useState(null);
  const [universe, setUniverse] = useState({ items: [], filters: null });
  const [loading, setLoading] = useState(true);
  const [indexLoading, setIndexLoading] = useState(true);
  const [err, setErr] = useState(null);

  useEffect(() => {
    let cancelled = false;
    let flowTimer = null;
    let trendTimer = null;

    async function loadOverview() {
      try {
        const [themeResult, indexResult, universeResult] = await Promise.all([
          api.themes(),
          api.index(),
          api.tradingUniverse({ limit: 60 }),
        ]);
        if (cancelled) return;
        setThemes(themeResult.themes || {});
        setIndexData(indexResult);
        setUniverse(universeResult || { items: [], filters: null });
        setErr(null);
      } catch (e) {
        if (!cancelled) setErr(e.message);
      } finally {
        if (!cancelled) {
          setIndexLoading(false);
          setLoading(false);
        }
      }
    }

    void loadOverview();

    // Secondary cards are useful, but they trigger much heavier backend work.
    // Stagger them so the initial overview becomes interactive first.
    flowTimer = window.setTimeout(() => {
      api.marketFlow()
        .then((data) => {
          if (!cancelled) {
            setFlow(data);
            setFlowLoading(false);
          }
        })
        .catch(() => {
          if (!cancelled) setFlowLoading(false);
        });
    }, 300);

    trendTimer = window.setTimeout(() => {
      api.themeTrend(7, { limit: 36 })
        .then((data) => {
          if (!cancelled) setTrendData(data);
        })
        .catch(() => {});
    }, 1200);

    return () => {
      cancelled = true;
      if (flowTimer !== null) window.clearTimeout(flowTimer);
      if (trendTimer !== null) window.clearTimeout(trendTimer);
    };
  }, []);

  return {
    indexData,
    flow,
    flowLoading,
    themes,
    trendData,
    universeItems: universe.items || [],
    universeFilters: universe.filters,
    loading,
    indexLoading,
    err,
  };
}
