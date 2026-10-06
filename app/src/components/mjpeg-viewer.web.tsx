// Versión web (solo para probar en el navegador del PC): WebView no existe en web,
// así que se usa un <iframe> con la misma página.
import { useEffect } from 'react';

import { buildViewerHtml, type ViewerMessage } from './viewer-html';

type Props = {
  url: string;
  onMessage: (msg: ViewerMessage) => void;
};

export function MjpegViewer({ url, onMessage }: Props) {
  useEffect(() => {
    function handle(event: MessageEvent) {
      if (typeof event.data !== 'string') return;
      try {
        const msg = JSON.parse(event.data);
        if (msg?.type === 'frame' || msg?.type === 'error') onMessage(msg);
      } catch {}
    }
    window.addEventListener('message', handle);
    return () => window.removeEventListener('message', handle);
  }, [onMessage]);

  return (
    <iframe
      title="stream"
      srcDoc={buildViewerHtml(url)}
      style={{ flex: 1, border: 0, width: '100%', height: '100%', backgroundColor: '#000' }}
    />
  );
}
