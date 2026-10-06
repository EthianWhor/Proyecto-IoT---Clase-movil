// Vigilancia en segundo plano (Android).
//
// Un Foreground Service es un servicio que Android no mata aunque la app esté en
// segundo plano o la pantalla apagada, a cambio de mostrar una notificación
// persistente. Dentro corre una tarea JS (HeadlessJS) que consulta /status cada
// POLL_MS y, si el contador de detecciones sube, lanza una notificación de alerta.
//
// Expo Go no trae el módulo nativo del servicio: ahí esta función no está
// disponible y se necesita el development build (EAS).
import Constants, { ExecutionEnvironment } from 'expo-constants';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

import { getStatus, type DeviceStatus } from '@/api/esp32';
import { STATE_LABELS, formatDateTime } from '@/lib/format';
import type { Settings } from '@/lib/settings';

const POLL_MS = 5000;
const ALERT_CHANNEL = 'alertas';

type BackgroundServiceModule = typeof import('react-native-background-actions').default;
type NotificationsModule = typeof import('expo-notifications');

export function isBackgroundSupported() {
  return Platform.OS === 'android' && Constants.executionEnvironment !== ExecutionEnvironment.StoreClient;
}

// Import diferido: en Expo Go el módulo nativo no existe y cargarlo fallaría.
function service(): BackgroundServiceModule {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('react-native-background-actions').default;
}

// También diferido: desde el SDK 53, en Expo Go para Android solo importar
// expo-notifications ya lanza un error y tumba toda la app.
let notificationsModule: NotificationsModule | null = null;
function notifications(): NotificationsModule {
  if (!notificationsModule) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    notificationsModule = require('expo-notifications') as NotificationsModule;
    // Cómo mostrar las notificaciones cuando la app está abierta.
    notificationsModule.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
      }),
    });
  }
  return notificationsModule;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function describe(status: DeviceStatus | null) {
  if (!status) return 'ESP32 sin conexión, reintentando…';
  const last = status.lastMotion ? formatDateTime(status.lastMotion) : 'ninguna';
  return `${STATE_LABELS[status.state]} · última detección: ${last}`;
}

async function notifyIntrusion(status: DeviceStatus) {
  const Notifications = notifications();
  await Notifications.scheduleNotificationAsync({
    content: {
      title: '🚨 Movimiento detectado',
      body: status.lastMotion
        ? `La ESP32 detectó movimiento el ${formatDateTime(status.lastMotion)}. Revisa Telegram o el correo para ver la foto.`
        : 'La ESP32 detectó movimiento.',
      priority: Notifications.AndroidNotificationPriority.MAX,
    },
    trigger: { channelId: ALERT_CHANNEL },
  });
}

// La tarea que vive dentro del servicio. Termina cuando se llama a stop().
async function monitorTask(params?: { settings: Settings }) {
  if (!params) return;
  const { settings } = params;
  const bg = service();
  let lastCount: number | null = null; // null = aún no sabemos cuántas había al empezar
  let lastText = '';

  while (bg.isRunning()) {
    let status: DeviceStatus | null = null;
    try {
      status = await getStatus(settings);
    } catch {
      status = null; // sin conexión: se muestra en la notificación y se reintenta
    }

    if (status) {
      if (lastCount !== null && status.motionCount > lastCount) await notifyIntrusion(status);
      lastCount = status.motionCount;
    }

    // Solo se actualiza la notificación si cambió el texto (evita parpadeos).
    const text = describe(status);
    if (text !== lastText) {
      await bg.updateNotification({ taskDesc: text });
      lastText = text;
    }
    await sleep(POLL_MS);
  }
}

export async function prepareNotifications() {
  const Notifications = notifications();
  await Notifications.setNotificationChannelAsync(ALERT_CHANNEL, {
    name: 'Alertas de intrusión',
    importance: Notifications.AndroidImportance.MAX,
    vibrationPattern: [0, 400, 200, 400],
    lightColor: '#CE2C31',
  });
  const { granted } = await Notifications.requestPermissionsAsync();
  return granted;
}

export function isMonitoring() {
  return isBackgroundSupported() && service().isRunning();
}

export async function startMonitoring(settings: Settings) {
  if (!isBackgroundSupported()) throw new Error('Requiere el build de Android (no funciona en Expo Go)');
  if (!(await prepareNotifications())) throw new Error('Sin permiso de notificaciones');
  const bg = service();
  if (bg.isRunning()) await bg.stop();
  await bg.start(monitorTask, {
    taskName: 'VigilanciaIntrusos',
    taskTitle: 'Vigilancia activa',
    taskDesc: 'Conectando con la ESP32…',
    taskIcon: { name: 'ic_launcher', type: 'mipmap' },
    color: '#CE2C31',
    linkingURI: 'intrusos://',
    foregroundServiceType: ['connectedDevice'],
    parameters: { settings },
  });
}

export async function stopMonitoring() {
  if (isBackgroundSupported() && service().isRunning()) await service().stop();
}

// Preferencia del usuario: si la vigilancia estaba activa, se reanuda al abrir la app.
const PREF_KEY = 'monitor-enabled';

export async function getMonitorPreference() {
  return (await AsyncStorage.getItem(PREF_KEY)) === '1';
}

export async function setMonitorPreference(enabled: boolean) {
  await AsyncStorage.setItem(PREF_KEY, enabled ? '1' : '0');
}
