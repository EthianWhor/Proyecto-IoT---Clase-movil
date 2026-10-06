import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Switch, TextInput, View } from 'react-native';

import { getStatus } from '@/api/esp32';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { STATE_LABELS } from '@/lib/format';
import { useSettings, type Settings } from '@/lib/settings';
import {
  isBackgroundSupported,
  isMonitoring,
  setMonitorPreference,
  startMonitoring,
  stopMonitoring,
} from '@/services/monitor';

export default function SettingsScreen() {
  const theme = useTheme();
  const { settings, loaded, saveSettings } = useSettings();
  const [host, setHost] = useState<string | null>(null);
  const [httpPort, setHttpPort] = useState<string | null>(null);
  const [streamPort, setStreamPort] = useState<string | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [monitoring, setMonitoring] = useState(isMonitoring);
  const [monitorBusy, setMonitorBusy] = useState(false);
  const [monitorError, setMonitorError] = useState<string | null>(null);

  // Mientras el usuario no edite, los campos muestran lo guardado.
  const hostValue = host ?? settings.host;
  const httpValue = httpPort ?? String(settings.httpPort);
  const streamValue = streamPort ?? String(settings.streamPort);

  function parse(): Settings | null {
    const h = hostValue.trim();
    const hp = Number(httpValue);
    const sp = Number(streamValue);
    if (!h || /\s|\//.test(h)) return null;
    if (!Number.isInteger(hp) || hp < 1 || hp > 65535) return null;
    if (!Number.isInteger(sp) || sp < 1 || sp > 65535) return null;
    return { host: h, httpPort: hp, streamPort: sp };
  }

  async function onTest() {
    const candidate = parse();
    if (!candidate) return setMessage({ ok: false, text: 'Revisa la IP y los puertos.' });
    setBusy(true);
    setMessage(null);
    try {
      const status = await getStatus(candidate);
      setMessage({ ok: true, text: `Conectado. Estado: ${STATE_LABELS[status.state]}.` });
    } catch (e) {
      setMessage({ ok: false, text: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(false);
    }
  }

  async function onSave() {
    const candidate = parse();
    if (!candidate) return setMessage({ ok: false, text: 'Revisa la IP y los puertos.' });
    await saveSettings(candidate);
    setHost(null);
    setHttpPort(null);
    setStreamPort(null);
    setMessage({ ok: true, text: 'Guardado.' });
  }

  async function toggleMonitoring(enabled: boolean) {
    setMonitorBusy(true);
    setMonitorError(null);
    try {
      if (enabled) await startMonitoring(settings);
      else await stopMonitoring();
      await setMonitorPreference(enabled);
      setMonitoring(enabled);
    } catch (e) {
      setMonitorError(e instanceof Error ? e.message : String(e));
    } finally {
      setMonitorBusy(false);
    }
  }

  if (!loaded) return <ActivityIndicator style={{ flex: 1 }} />;

  const inputStyle = [styles.input, { color: theme.text, borderColor: theme.backgroundSelected }];

  return (
    <ScrollView style={{ backgroundColor: theme.background }} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <ThemedView type="backgroundElement" style={styles.card}>
        <ThemedText type="smallBold">Dirección de la ESP32</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          La IP aparece en el monitor serie de la ESP32 al conectarse al Wi-Fi. El celular debe estar en la misma red.
        </ThemedText>

        <ThemedText type="small">IP o nombre</ThemedText>
        <TextInput
          style={inputStyle}
          value={hostValue}
          onChangeText={setHost}
          placeholder="192.168.1.100"
          placeholderTextColor={theme.textSecondary}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
        />

        <View style={styles.row}>
          <View style={{ flex: 1, gap: Spacing.one }}>
            <ThemedText type="small">Puerto de control</ThemedText>
            <TextInput style={inputStyle} value={httpValue} onChangeText={setHttpPort} keyboardType="number-pad" />
          </View>
          <View style={{ flex: 1, gap: Spacing.one }}>
            <ThemedText type="small">Puerto del video</ThemedText>
            <TextInput style={inputStyle} value={streamValue} onChangeText={setStreamPort} keyboardType="number-pad" />
          </View>
        </View>

        <View style={styles.row}>
          <Pressable style={[styles.button, { borderColor: theme.accent }]} onPress={onTest} disabled={busy}>
            {busy ? <ActivityIndicator /> : <ThemedText style={{ color: theme.accent }}>Probar conexión</ThemedText>}
          </Pressable>
          <Pressable style={[styles.button, { backgroundColor: theme.accent, borderColor: theme.accent }]} onPress={onSave}>
            <ThemedText style={{ color: theme.background }}>Guardar</ThemedText>
          </Pressable>
        </View>

        {message && (
          <ThemedText type="small" style={{ color: message.ok ? theme.success : theme.danger }}>
            {message.text}
          </ThemedText>
        )}
      </ThemedView>

      <ThemedView type="backgroundElement" style={styles.card}>
        <View style={styles.row}>
          <View style={{ flex: 1 }}>
            <ThemedText type="smallBold">Vigilancia en segundo plano</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              Mantiene una notificación fija y te avisa de cada detección aunque cierres la app o apagues la pantalla.
            </ThemedText>
          </View>
          {monitorBusy ? (
            <ActivityIndicator />
          ) : (
            <Switch value={monitoring} onValueChange={toggleMonitoring} disabled={!isBackgroundSupported()} />
          )}
        </View>
        {!isBackgroundSupported() && (
          <ThemedText type="small" style={{ color: theme.warning }}>
            Solo disponible en la app instalada (build de Android), no en Expo Go.
          </ThemedText>
        )}
        {monitorError && (
          <ThemedText type="small" style={{ color: theme.danger }}>
            {monitorError}
          </ThemedText>
        )}
      </ThemedView>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: Spacing.three, gap: Spacing.three },
  card: { padding: Spacing.three, borderRadius: Spacing.three, gap: Spacing.two },
  row: { flexDirection: 'row', gap: Spacing.two, alignItems: 'center' },
  input: {
    borderWidth: 1,
    borderRadius: Spacing.two,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.two,
    fontSize: 16,
  },
  button: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: Spacing.two,
    borderRadius: Spacing.two,
    borderWidth: 1,
    marginTop: Spacing.two,
  },
});
