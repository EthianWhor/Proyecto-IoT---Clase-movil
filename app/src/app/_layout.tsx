import { DarkTheme, DefaultTheme, ThemeProvider, Tabs } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useColorScheme } from 'react-native';

import { MonitorAutoStart } from '@/components/monitor-auto-start';
import { Colors } from '@/constants/theme';
import { SettingsProvider } from '@/lib/settings';

export default function RootLayout() {
  const scheme = useColorScheme();
  const colors = Colors[scheme === 'dark' ? 'dark' : 'light'];

  return (
    <ThemeProvider value={scheme === 'dark' ? DarkTheme : DefaultTheme}>
      <SettingsProvider>
        <MonitorAutoStart />
        <Tabs
          screenOptions={{
            tabBarActiveTintColor: colors.accent,
            tabBarInactiveTintColor: colors.textSecondary,
            headerTitleStyle: { fontWeight: '600' },
          }}>
          <Tabs.Screen
            name="index"
            options={{
              title: 'Visor',
              tabBarIcon: ({ color }) => (
                <SymbolView name={{ ios: 'video.fill', android: 'videocam', web: 'videocam' }} tintColor={color} size={24} />
              ),
            }}
          />
          <Tabs.Screen
            name="schedule"
            options={{
              title: 'Horarios',
              tabBarIcon: ({ color }) => (
                <SymbolView name={{ ios: 'clock.fill', android: 'schedule', web: 'schedule' }} tintColor={color} size={24} />
              ),
            }}
          />
          <Tabs.Screen
            name="settings"
            options={{
              title: 'Ajustes',
              tabBarIcon: ({ color }) => (
                <SymbolView name={{ ios: 'gearshape.fill', android: 'settings', web: 'settings' }} tintColor={color} size={24} />
              ),
            }}
          />
        </Tabs>
      </SettingsProvider>
    </ThemeProvider>
  );
}
