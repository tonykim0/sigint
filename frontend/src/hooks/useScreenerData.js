import { useEffect, useState } from 'react';
import { api } from '../utils/api.js';

const LOADERS = {
  closing: api.screener.closingBet,
  pullback: api.screener.pullbackSwing,
  breakout: api.screener.breakoutSwing,
  regime: api.screener.marketRegime,
};

export function useScreenerData(kind) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);

  useEffect(() => {
    let cancelled = false;
    const loader = LOADERS[kind];

    async function loadInitial() {
      try {
        const result = await loader({ force: false });
        if (cancelled) return;
        setData(result);
        setErr(null);
      } catch (e) {
        if (!cancelled) setErr(e.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadInitial();
    return () => {
      cancelled = true;
    };
  }, [kind]);

  async function refresh(force = true) {
    setLoading(true);
    setErr(null);
    try {
      const result = await LOADERS[kind]({ force });
      setData(result);
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }

  return { data, loading, err, refresh };
}
