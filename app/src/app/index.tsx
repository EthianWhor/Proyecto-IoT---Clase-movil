import { useIsFocused } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Switch, View } from 'react-native';

import { setArmed, streamUrl } from '@/api/esp32';
import { LiveVideo } from '@/components/live-video';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useDeviceStatus } from '@/hooks/use-device-status';
import { useTheme } from '@/hooks/use-theme';
import { DETECTION_MODE_LABELS, STATE_LABELS, formatDateTime } from '@/lib/format';
import { useSettings } from '@/lib/settings';

export default function ViewerScreen() {
  const theme = useTheme();
  const { settings } = useSettings();
  const videoUrl = streamUrl(settings);
  // Las pestañas quedan montadas al cambiar de pantalla; el video solo se
  // conecta mientras esta pestaña está a la vista.
  const focused = useIsFocused();
  const device = useDeviceStatus(settings);
  const [arming, setArming] = useState(false);
  const [armError, setArmError] = useState<string | null>(null);

  async function toggleAway(value: boolean) {
    setArming(true);
    setArmError(null);
    try {
      device.setStatus(await setArmed(settings, value));
    } catch (e) {
      setArmError(e instanceof Error ? e.message : String(e));
    } finally {
      setArming(false);
    }
  }

  const status = device.status;
  const stateColor =
    !device.online || !status
      ? theme.textSecondary
      : status.state === 'DETECTANDO' || status.state === 'ALERTA_ENVIADA'
        ? theme.danger
        : status.armed
          ? theme.warning
          : theme.success;

  return (
    <ScrollView style={{ backgroundColor: theme.background }} contentContainerStyle={styles.content}>
      {focused ? <LiveVideo key={videoUrl} url={videoUrl} /> : <View style={styles.videoPlaceholder} />}

      <ThemedView type="backgroundElement" style={styles.card}>
        <View style={styles.row}>
          <View style={[styles.dot, { backgroundColor: stateColor }]} />
          <ThemedText type="smallBold" style={{ color: stateColor, flex: 1 }}>
            {!device.online || !status ? 'ESP32 sin conexión' : STATE_LABELS[status.state]}
          </ThemedText>
        </View>
        {!device.online && device.error && (
          <ThemedText type="small" themeColor="textSecondary">
            {device.error}. Revisa la IP en Ajustes.
          </ThemedText>
        )}
        {status && device.online && (
          <>
            <Info label="Último movimiento" value={status.lastMotion ? formatDateTime(status.lastMotion) : 'Ninguno'} />
            <Info label="Detecciones" value={String(status.motionCount)} />
            <Info label="Franja horaria activa" value={status.inSchedule ? 'Sí' : 'No'} />
            <Info label="Detección" value={DETECTION_MODE_LABELS[status.detectionMode]} />
            <Info label="Señal Wi-Fi" value={`${status.rssi} dBm`} />
          </>
        )}
      </ThemedView>

      <ThemedView type="backgroundElement" style={styles.card}>
        <View style={styles.row}>
          <View style={{ flex: 1 }}>
            <ThemedText type="smallBold">Fuera de casa</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              Arma el sistema ahora, sin importar los horarios.
            </ThemedText>
          </View>
          {arming ? (
            <ActivityIndicator />
          ) : (
            <Switch
              value={status?.manualArmed ?? false}
              onValueChange={toggleAway}
              disabled={!device.online}
            />
          )}
        </View>
        {armError && (
          <ThemedText type="small" style={{ color: theme.danger }}>
            {armError}
          </ThemedText>
        )}
      </ThemedView>
    </ScrollView>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <ThemedText type="small" themeColor="textSecondary" style={{ flex: 1 }}>
        {label}
      </ThemedText>
      <ThemedText type="small">{value}</ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: Spacing.three, gap: Spacing.three },
  videoPlaceholder: { aspectRatio: 4 / 3, backgroundColor: '#000', borderRadius: Spacing.three },
  card: { padding: Spacing.three, borderRadius: Spacing.three, gap: Spacing.two },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  dot: { width: 10, height: 10, borderRadius: 5 },
});
