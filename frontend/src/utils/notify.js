// 브라우저 푸시 알림 유틸

export async function requestPermission() {
  if (!('Notification' in window)) return false;
  if (Notification.permission === 'granted') return true;
  if (Notification.permission === 'denied') return false;
  const result = await Notification.requestPermission();
  return result === 'granted';
}

export function notify(title, body, options = {}) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  const n = new Notification(title, {
    body,
    icon: '/favicon.ico',
    badge: '/favicon.ico',
    silent: false,
    ...options,
  });
  n.onclick = () => { window.focus(); n.close(); };
  setTimeout(() => n.close(), 8000);
}

export function notifyStopLoss(name, retPct) {
  notify(
    `⚠️ 손절 라인 도달 — ${name}`,
    `현재 수익률 ${retPct.toFixed(2)}% (기준: -5%)`,
  );
}

export function notifyTakeProfit(name, retPct) {
  notify(
    `✅ 익절 구간 — ${name}`,
    `현재 수익률 +${retPct.toFixed(2)}% (기준: +5%)`,
  );
}
