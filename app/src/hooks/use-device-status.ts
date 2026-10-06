// Consulta GET /status cada POLL_INTERVAL_MS mientras la app está en primer plano.
// Usa setTimeout encadenado (no setInterval) para no lanzar una petición nueva
// si la anterior todavía no termina.
import { useEffect, useState } from 'react';
import { AppState } from 'react-native';

import { getStatus, type DeviceStatus } from '@/api/esp32';
import type { Settings } from '@/lib/settings';

const POLL_INTERVAL_MS = 2500;

export function useDeviceStatus(settings: Settings) {
  const [status, setStatus] = useState<DeviceStatus | null>(null);
  const [online, setOnline] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshToken, setRefreshToken] = useState(0);

  useEffect(() => {
    // `cancelled` evita que una petición vieja (de antes de cambiar la IP o de
    // desmontar la pantalla) programe otra consulta al terminar.
    let cancelled = false;
    let foreground = AppState.currentState === 'active';
    let timer: ReturnType<typeof setTimeout> | undefined;

    async function tick() {
      clearTimeout(timer);
      try {
        const next = await getStatus(settings);
        if (cancelled) return;
        setStatus(next);
        setOnline(true);
        setError(null);
      } catch (e) {
        if (cancelled) return;
        setOnline(false);
        setError(e instanceof Error ? e.message : String(e));
      }
      if (foreground) timer = setTimeout(tick, POLL_INTERVAL_MS);
    }

    const sub = AppState.addEventListener('change', (state) => {
      const nowForeground = state === 'active';
      if (nowForeground && !foreground) {
        foreground = true;
        tick();
      } else if (!nowForeground) {
        foreground = false;
        clearTimeout(timer);
      }
    });

    if (foreground) tick();

    return () => {
      cancelled = true;
      clearTimeout(timer);
      sub.remove();
    };
  }, [settings, refreshToken]);

  return {
    status,
    setStatus,
    online,
    error,
    refresh: () => setRefreshToken((n) => n + 1),
  };
}
