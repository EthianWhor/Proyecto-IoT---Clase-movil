// Dirección de la ESP32 guardada en el teléfono (AsyncStorage) y compartida con
// todas las pantallas mediante un Context.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

export type Settings = {
  host: string;
  httpPort: number;
  streamPort: number;
};

const STORAGE_KEY = 'esp32-settings';

export const DEFAULT_SETTINGS: Settings = {
  host: '192.168.1.100',
  httpPort: 80,
  streamPort: 81,
};

type SettingsContextValue = {
  settings: Settings;
  loaded: boolean;
  saveSettings: (next: Settings) => Promise<void>;
};

const SettingsContext = createContext<SettingsContextValue | null>(null);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((raw) => {
        if (raw) setSettings({ ...DEFAULT_SETTINGS, ...JSON.parse(raw) });
      })
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, []);

  async function saveSettings(next: Settings) {
    setSettings(next);
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  }

  return (
    <SettingsContext.Provider value={{ settings, loaded, saveSettings }}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error('useSettings debe usarse dentro de <SettingsProvider>');
  return ctx;
}
