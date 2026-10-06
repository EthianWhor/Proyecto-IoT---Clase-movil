// Cliente HTTP de la API de control de la ESP32 (puerto 80). Contrato en docs/API.md.
import type { Settings } from '@/lib/settings';

export type DeviceState = 'DESARMADO' | 'ARMADO' | 'DETECTANDO' | 'ALERTA_ENVIADA';

export type DeviceStatus = {
  state: DeviceState;
  armed: boolean; // armado efectivo = manual o dentro de una franja
  manualArmed: boolean; // modo "Fuera de casa"
  inSchedule: boolean;
  lastMotion: number | null; // segundos Unix
  motionCount: number;
  detectionMode: 0 | 1 | 2;
  uptime: number;
  time: number;
  rssi: number;
};

export type ScheduleSlot = {
  id: string;
  days: number[]; // 0 = domingo ... 6 = sábado (igual que tm_wday en C)
  start: string; // "HH:MM"
  end: string; // "HH:MM"; si es menor que start, la franja cruza la medianoche
  enabled: boolean;
};

const DEFAULT_TIMEOUT_MS = 3000;

export class Esp32Error extends Error {}

export function httpBaseUrl(s: Settings) {
  return `http://${s.host}:${s.httpPort}`;
}

export function streamUrl(s: Settings) {
  return `http://${s.host}:${s.streamPort}/stream`;
}

// fetch no tiene timeout propio: si la ESP32 no responde, la petición podría
// quedarse colgada. AbortController la cancela pasado el tiempo límite.
async function request<T>(
  settings: Settings,
  path: string,
  options: { method?: 'GET' | 'POST'; body?: unknown; timeoutMs?: number } = {}
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  try {
    const res = await fetch(httpBaseUrl(settings) + path, {
      method: options.method ?? 'GET',
      headers: options.body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
      signal: controller.signal,
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) throw new Esp32Error(data?.error ?? `La ESP32 respondió HTTP ${res.status}`);
    return data as T;
  } catch (e) {
    if (e instanceof Esp32Error) throw e;
    if (controller.signal.aborted) throw new Esp32Error('La ESP32 no respondió a tiempo');
    throw new Esp32Error('No se pudo conectar con la ESP32');
  } finally {
    clearTimeout(timer);
  }
}

export function getStatus(s: Settings) {
  return request<DeviceStatus>(s, '/status');
}

export function setArmed(s: Settings, armed: boolean) {
  return request<DeviceStatus>(s, '/arm', { method: 'POST', body: { armed } });
}

export async function getSchedule(s: Settings) {
  const data = await request<{ slots: ScheduleSlot[] }>(s, '/schedule');
  return data.slots;
}

export async function saveSchedule(s: Settings, slots: ScheduleSlot[]) {
  const data = await request<{ slots: ScheduleSlot[] }>(s, '/schedule', {
    method: 'POST',
    body: { slots },
  });
  return data.slots;
}
