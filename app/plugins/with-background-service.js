// Config plugin: declara en el AndroidManifest el tipo del Foreground Service de
// react-native-background-actions. Desde Android 14 todo Foreground Service debe
// declarar su tipo; usamos "connectedDevice" (la app supervisa un dispositivo
// externo por Wi-Fi). "dataSync" tendría un límite de 6 h al día en Android 15.
const { withAndroidManifest } = require('expo/config-plugins');

const SERVICE_NAME = 'com.asterinet.react.bgactions.RNBackgroundActionsTask';

module.exports = function withBackgroundService(config) {
  return withAndroidManifest(config, (cfg) => {
    const manifest = cfg.modResults.manifest;
    manifest.$['xmlns:tools'] = 'http://schemas.android.com/tools';

    const app = manifest.application[0];
    app.service = (app.service ?? []).filter((s) => s.$['android:name'] !== SERVICE_NAME);
    app.service.push({
      $: {
        'android:name': SERVICE_NAME,
        'android:foregroundServiceType': 'connectedDevice',
        'android:exported': 'false',
        'tools:node': 'merge',
      },
    });
    return cfg;
  });
};
