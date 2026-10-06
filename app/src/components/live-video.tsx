import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { MjpegViewer } from '@/components/mjpeg-viewer';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useStream } from '@/hooks/use-stream';

// Recuadro de video con los estados de conexión. Quien lo use debe darle
// key={url} para que un cambio de IP reinicie la conexión desde cero.
export function LiveVideo({ url }: { url: string }) {
  const stream = useStream();

  return (
    <View style={styles.videoBox}>
      {stream.showViewer && <MjpegViewer key={stream.sessionKey} url={url} onMessage={stream.onViewerMessage} />}
      {stream.phase !== 'live' && (
        <View style={styles.overlay}>
          {stream.phase === 'connecting' && <ActivityIndicator color="#fff" />}
          <ThemedText style={styles.overlayText}>
            {stream.phase === 'connecting' && 'Conectando al video…'}
            {stream.phase === 'paused' && 'Video en pausa (app en segundo plano)'}
            {stream.phase === 'reconnecting' &&
              `Sin video. Reintento ${stream.attempt} en ${Math.round(stream.retryInMs / 1000)} s`}
          </ThemedText>
          {stream.lastError && <ThemedText style={styles.overlayDetail}>{stream.lastError}</ThemedText>}
          {stream.phase === 'reconnecting' && (
            <Pressable onPress={stream.retryNow} style={styles.retryButton}>
              <ThemedText style={styles.overlayText}>Reintentar ahora</ThemedText>
            </Pressable>
          )}
        </View>
      )}
      {stream.phase === 'live' && (
        <View style={styles.liveBadge}>
          <ThemedText type="smallBold" style={{ color: '#fff' }}>
            ● EN VIVO{stream.fps > 0 ? ` · ${stream.fps} fps` : ''}
          </ThemedText>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  videoBox: {
    aspectRatio: 4 / 3,
    backgroundColor: '#000',
    borderRadius: Spacing.three,
    overflow: 'hidden',
  },
  overlay: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
    padding: Spacing.three,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  overlayText: { color: '#fff', textAlign: 'center' },
  overlayDetail: { color: '#bbb', fontSize: 12, textAlign: 'center' },
  retryButton: {
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderRadius: Spacing.two,
    borderWidth: 1,
    borderColor: '#fff',
  },
  liveBadge: {
    position: 'absolute',
    top: Spacing.two,
    left: Spacing.two,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.half,
    borderRadius: Spacing.two,
    backgroundColor: 'rgba(206,44,49,0.85)',
  },
});
