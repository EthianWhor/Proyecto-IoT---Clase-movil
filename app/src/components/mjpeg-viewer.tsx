import { StyleSheet } from 'react-native';
import { WebView } from 'react-native-webview';

import { buildViewerHtml, type ViewerMessage } from './viewer-html';

type Props = {
  url: string;
  onMessage: (msg: ViewerMessage) => void;
};

// La página se carga con baseUrl = origen del stream, así el fetch() interno es
// del mismo origen y no necesita CORS.
export function MjpegViewer({ url, onMessage }: Props) {
  const origin = url.replace(/^(https?:\/\/[^/]+).*$/, '$1');
  return (
    <WebView
      style={styles.webview}
      source={{ html: buildViewerHtml(url), baseUrl: origin }}
      originWhitelist={['*']}
      cacheEnabled={false}
      scrollEnabled={false}
      mixedContentMode="always"
      onMessage={(event) => onMessage(JSON.parse(event.nativeEvent.data))}
      onError={(event) => onMessage({ type: 'error', message: event.nativeEvent.description })}
    />
  );
}

const styles = StyleSheet.create({
  webview: { flex: 1, backgroundColor: '#000' },
});
