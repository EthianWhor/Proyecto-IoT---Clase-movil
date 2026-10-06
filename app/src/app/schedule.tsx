// Franjas horarias de vigilancia. Se editan en el teléfono y se envían completas
// a la ESP32 (POST /schedule), que las guarda en su memoria no volátil (NVS) y
// decide sola, con la hora de NTP, si está dentro de una franja.
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Switch, TextInput, View } from 'react-native';

import { getSchedule, saveSchedule, type ScheduleSlot } from '@/api/esp32';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useSettings } from '@/lib/settings';

const MAX_SLOTS = 8;
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
// Orden de lunes a domingo; el número es el que usa la ESP32 (0 = domingo).
const DAYS = [
  { n: 1, label: 'L' },
  { n: 2, label: 'M' },
  { n: 3, label: 'X' },
  { n: 4, label: 'J' },
  { n: 5, label: 'V' },
  { n: 6, label: 'S' },
  { n: 0, label: 'D' },
];

function newSlot(): ScheduleSlot {
  return {
    id: Date.now().toString(36),
    days: [1, 2, 3, 4, 5],
    start: '08:00',
    end: '17:00',
    enabled: true,
  };
}

function slotError(slot: ScheduleSlot) {
  if (!HHMM.test(slot.start) || !HHMM.test(slot.end)) return 'Usa el formato HH:MM (24 h)';
  if (slot.start === slot.end) return 'La hora de inicio y fin no pueden ser iguales';
  if (slot.days.length === 0) return 'Elige al menos un día';
  return null;
}

export default function ScheduleScreen() {
  const theme = useTheme();
  const { settings } = useSettings();
  const [slots, setSlots] = useState<ScheduleSlot[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    let cancelled = false;
    getSchedule(settings)
      .then((data) => {
        if (cancelled) return;
        setSlots(data);
        setDirty(false);
        setMessage(null);
      })
      .catch((e) => !cancelled && setMessage({ ok: false, text: e.message }))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [settings, reloadToken]);

  function update(id: string, patch: Partial<ScheduleSlot>) {
    setSlots((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));
    setDirty(true);
  }

  function toggleDay(slot: ScheduleSlot, day: number) {
    const days = slot.days.includes(day) ? slot.days.filter((d) => d !== day) : [...slot.days, day].sort();
    update(slot.id, { days });
  }

  function remove(id: string) {
    setSlots((prev) => prev.filter((s) => s.id !== id));
    setDirty(true);
  }

  function add() {
    setSlots((prev) => [...prev, newSlot()]);
    setDirty(true);
  }

  const hasErrors = slots.some((s) => slotError(s) !== null);

  async function onSave() {
    setSaving(true);
    setMessage(null);
    try {
      setSlots(await saveSchedule(settings, slots));
      setDirty(false);
      setMessage({ ok: true, text: 'Horarios guardados en la ESP32.' });
    } catch (e) {
      setMessage({ ok: false, text: e instanceof Error ? e.message : String(e) });
    } finally {
      setSaving(false);
    }
  }

  const inputStyle = [styles.timeInput, { color: theme.text, borderColor: theme.backgroundSelected }];

  return (
    <ScrollView style={{ backgroundColor: theme.background }} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <ThemedText type="small" themeColor="textSecondary">
        Dentro de una franja activa el sistema se arma solo. Si la hora de fin es menor que la de inicio (por ejemplo
        22:00 a 06:00), la franja termina al día siguiente.
      </ThemedText>

      {loading && <ActivityIndicator />}

      {!loading &&
        slots.map((slot, index) => {
          const error = slotError(slot);
          return (
            <ThemedView key={slot.id} type="backgroundElement" style={styles.card}>
              <View style={styles.row}>
                <ThemedText type="smallBold" style={{ flex: 1 }}>
                  Franja {index + 1}
                </ThemedText>
                <Switch value={slot.enabled} onValueChange={(enabled) => update(slot.id, { enabled })} />
              </View>

              <View style={styles.row}>
                {DAYS.map((d) => {
                  const on = slot.days.includes(d.n);
                  return (
                    <Pressable
                      key={d.n}
                      onPress={() => toggleDay(slot, d.n)}
                      style={[styles.day, { backgroundColor: on ? theme.accent : theme.backgroundSelected }]}>
                      <ThemedText type="smallBold" style={{ color: on ? theme.background : theme.textSecondary }}>
                        {d.label}
                      </ThemedText>
                    </Pressable>
                  );
                })}
              </View>

              <View style={styles.row}>
                <ThemedText type="small">Desde</ThemedText>
                <TextInput
                  style={inputStyle}
                  value={slot.start}
                  onChangeText={(start) => update(slot.id, { start })}
                  placeholder="22:00"
                  maxLength={5}
                  keyboardType="numbers-and-punctuation"
                />
                <ThemedText type="small">hasta</ThemedText>
                <TextInput
                  style={inputStyle}
                  value={slot.end}
                  onChangeText={(end) => update(slot.id, { end })}
                  placeholder="06:00"
                  maxLength={5}
                  keyboardType="numbers-and-punctuation"
                />
                <Pressable onPress={() => remove(slot.id)} style={{ marginLeft: 'auto' }}>
                  <ThemedText type="small" style={{ color: theme.danger }}>
                    Eliminar
                  </ThemedText>
                </Pressable>
              </View>

              {error && (
                <ThemedText type="small" style={{ color: theme.danger }}>
                  {error}
                </ThemedText>
              )}
            </ThemedView>
          );
        })}

      {!loading && (
        <View style={styles.row}>
          <Pressable
            style={[styles.button, { borderColor: theme.accent, opacity: slots.length >= MAX_SLOTS ? 0.4 : 1 }]}
            onPress={add}
            disabled={slots.length >= MAX_SLOTS}>
            <ThemedText style={{ color: theme.accent }}>Agregar franja</ThemedText>
          </Pressable>
          <Pressable
            style={[
              styles.button,
              { backgroundColor: theme.accent, borderColor: theme.accent, opacity: !dirty || hasErrors ? 0.4 : 1 },
            ]}
            onPress={onSave}
            disabled={!dirty || hasErrors || saving}>
            {saving ? <ActivityIndicator /> : <ThemedText style={{ color: theme.background }}>Guardar</ThemedText>}
          </Pressable>
        </View>
      )}

      {message && (
        <View style={styles.row}>
          <ThemedText type="small" style={{ color: message.ok ? theme.success : theme.danger, flex: 1 }}>
            {message.text}
          </ThemedText>
          {!message.ok && (
            <Pressable
              onPress={() => {
                setLoading(true);
                setReloadToken((n) => n + 1);
              }}>
              <ThemedText type="small" style={{ color: theme.accent }}>
                Reintentar
              </ThemedText>
            </Pressable>
          )}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: Spacing.three, gap: Spacing.three },
  card: { padding: Spacing.three, borderRadius: Spacing.three, gap: Spacing.three },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, flexWrap: 'wrap' },
  day: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  timeInput: {
    borderWidth: 1,
    borderRadius: Spacing.two,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.one,
    fontSize: 16,
    minWidth: 70,
    textAlign: 'center',
  },
  button: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: Spacing.two,
    borderRadius: Spacing.two,
    borderWidth: 1,
  },
});
