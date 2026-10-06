// Si el usuario dejó la vigilancia activada, la reanuda al abrir la app y la
// reinicia cuando cambia la IP de la ESP32. No dibuja nada.
// Android solo permite iniciar un Foreground Service con la app en primer plano,
// por eso se hace aquí y no desde segundo plano.
import { useEffect } from 'react';

import { useSettings } from '@/lib/settings';
import { getMonitorPreference, isBackgroundSupported, startMonitoring } from '@/services/monitor';

export function MonitorAutoStart() {
  const { settings, loaded } = useSettings();

  useEffect(() => {
    if (!loaded || !isBackgroundSupported()) return;
    getMonitorPreference()
      .then((enabled) => (enabled ? startMonitoring(settings) : undefined))
      .catch((e) => console.warn('No se pudo iniciar la vigilancia:', e));
  }, [settings, loaded]);

  return null;
}
