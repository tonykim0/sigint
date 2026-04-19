import { useEffect, useState } from 'react';
import { api } from '../utils/api.js';

export function useVolumeRankData(refreshSec, marketOpen) {
  const [items, setItems] = useState([]);
  const [filters, setFilters] = useState(null);
  const [themes, setThemes] = useState({});
  const [investorItems, setInvestorItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);

  useEffect(() => {
    let cancelled = false;
    api
      .themes()
      .then((data) => {
        if (!cancelled) setThemes(data.themes || {});
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function load(force = false) {
      try {
        const [universeData, investorData] = await Promise.all([
          api.tradingUniverse({ limit: 60, force }),
          api.investorSummary({ topN: 60, force }),
        ]);
        if (cancelled) return;
        setItems(universeData.items || []);
        setFilters(universeData.filters || null);
        setInvestorItems(investorData.items || []);
        setLastUpdated(new Date());
        setErr(null);
      } catch (e) {
        if (!cancelled) {
          setItems([]);
          setInvestorItems([]);
          setErr(e.message);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load(false);
    if (refreshSec === 0 || !marketOpen) {
      return () => {
        cancelled = true;
      };
    }
    const id = setInterval(() => {
      if (!cancelled) void load(false);
    }, refreshSec * 1000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [marketOpen, refreshSec]);

  async function refresh(force = true) {
    setLoading(true);
    try {
      const [universeData, investorData] = await Promise.all([
        api.tradingUniverse({ limit: 60, force }),
        api.investorSummary({ topN: 60, force }),
      ]);
      setItems(universeData.items || []);
      setFilters(universeData.filters || null);
      setInvestorItems(investorData.items || []);
      setLastUpdated(new Date());
      setErr(null);
    } catch (e) {
      setItems([]);
      setInvestorItems([]);
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }

  return {
    items,
    filters,
    themes,
    investorItems,
    loading,
    err,
    lastUpdated,
    refresh,
  };
}
