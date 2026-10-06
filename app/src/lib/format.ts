const pad = (n: number) => String(n).padStart(2, '0');

// Formato manual: Hermes no siempre trae todos los locales de Intl.
export function formatDateTime(unixSeconds: number) {
  const d = new Date(unixSeconds * 1000);
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

export const STATE_LABELS = {
  DESARMADO: 'Desarmado',
  ARMADO: 'Armado',
  DETECTANDO: '¡Movimiento detectado!',
  ALERTA_ENVIADA: 'Alerta enviada',
} as const;

export const DETECTION_MODE_LABELS = {
  0: 'Solo cámara',
  1: 'Solo PIR',
  2: 'PIR + cámara',
} as const;
