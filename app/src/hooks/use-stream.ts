// Máquina de estados del visor con reconexión automática.
//
//   connecting --(llega fotograma)--> live
//   connecting/live --(error o 4 s sin fotogramas)--> reconnecting
//   reconnecting --(espera 1 s, 2 s, 4 s, 8 s, 10 s...)--> connecting
//   cualquiera --(app en segundo plano)--> paused --(vuelve)--> connecting
//
// Reconectar = desmontar el WebView (cierra la conexión TCP con la ESP32) y
// montarlo de nuevo con otra `key`.
// Si cambia la IP, la pantalla remonta el componente del video (key = url), así
// que este hook siempre empieza de cero.
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';

import type { ViewerMessage } from '@/components/viewer-html';

export type StreamPhase = 'connecting' | 'live' | 'reconnecting' | 'paused';

const STALL_TIMEOUT_MS = 4000; // sin fotogramas por este tiempo = conexión perdida
const BASE_BACKOFF_MS = 1000;
const MAX_BACKOFF_MS = 10000;

export function backoffDelay(attempt: number) {
  return Math.min(BASE_BACKOFF_MS * 2 ** (attempt - 1), MAX_BACKOFF_MS);
}

export function useStream() {
  const [phase, setPhase] = useState<StreamPhase>('connecting');
  const [sessionKey, setSessionKey] = useState(0);
  const [attempt, setAttempt] = useState(0);
  const [retryInMs, setRetryInMs] = useState(0);
  const [fps, setFps] = useState(0);
  const [lastError, setLastError] = useState<string | null>(null);

  // Copias en refs para leerlas desde temporizadores sin depender de renders.
  const phaseRef = useRef<StreamPhase>('connecting');
  const attemptRef = useRef(0);
  const lastFrameAt = useRef(0);
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const changePhase = useCallback((next: StreamPhase) => {
    phaseRef.current = next;
    setPhase(next);
  }, []);

  const clearRetry = useCallback(() => {
    if (retryTimer.current) clearTimeout(retryTimer.current);
    retryTimer.current = null;
  }, []);

  const connect = useCallback(() => {
    clearRetry();
    lastFrameAt.current = Date.now();
    setSessionKey((k) => k + 1);
    changePhase('connecting');
  }, [changePhase, clearRetry]);

  const fail = useCallback(
    (reason: string) => {
      if (phaseRef.current === 'reconnecting' || phaseRef.current === 'paused') return;
      attemptRef.current += 1;
      const delay = backoffDelay(attemptRef.current);
      setAttempt(attemptRef.current);
      setRetryInMs(delay);
      setLastError(reason);
      setFps(0);
      changePhase('reconnecting');
      retryTimer.current = setTimeout(connect, delay);
    },
    [changePhase, connect]
  );

  const onViewerMessage = useCallback(
    (msg: ViewerMessage) => {
      if (msg.type === 'error') {
        fail(msg.message);
        return;
      }
      lastFrameAt.current = Date.now();
      setFps(msg.fps);
      if (phaseRef.current !== 'live') {
        attemptRef.current = 0;
        setAttempt(0);
        setLastError(null);
        changePhase('live');
      }
    },
    [changePhase, fail]
  );

  const retryNow = useCallback(() => {
    attemptRef.current = 0;
    setAttempt(0);
    connect();
  }, [connect]);

  // Al montar, el reloj del watchdog empieza ahora. Al desmontar, cancelar reintentos.
  useEffect(() => {
    lastFrameAt.current = Date.now();
    return clearRetry;
  }, [clearRetry]);

  // Watchdog: detecta el stream "congelado" (conexión abierta pero sin fotogramas).
  useEffect(() => {
    const id = setInterval(() => {
      const waiting = phaseRef.current === 'connecting' || phaseRef.current === 'live';
      if (waiting && Date.now() - lastFrameAt.current > STALL_TIMEOUT_MS) {
        fail(phaseRef.current === 'live' ? 'El video se congeló' : 'La ESP32 no envió video');
      }
    }, 1000);
    return () => clearInterval(id);
  }, [fail]);

  // En segundo plano se suelta el stream (ahorra batería y datos, y libera a la
  // ESP32, que atiende pocos clientes a la vez). Al volver se reconecta.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        if (phaseRef.current === 'paused') retryNow();
      } else {
        clearRetry();
        changePhase('paused');
      }
    });
    return () => sub.remove();
  }, [changePhase, clearRetry, retryNow]);

  return {
    phase,
    sessionKey,
    attempt,
    retryInMs,
    fps,
    lastError,
    onViewerMessage,
    retryNow,
    showViewer: phase === 'connecting' || phase === 'live',
  };
}
