import { useEffect, useState } from 'react';
import type { LiveCall } from '../api/types';

/**
 * Subscribe to in-progress calls via Server-Sent Events (/api/calls/stream).
 * EventSource auto-reconnects on drop; in dev, Vite proxies the stream to :3000.
 */
export function useLiveCalls(): LiveCall[] {
  const [calls, setCalls] = useState<LiveCall[]>([]);

  useEffect(() => {
    const es = new EventSource('/api/calls/stream');
    es.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data) as { calls: LiveCall[] };
        setCalls(data.calls);
      } catch {
        /* ignore malformed frame */
      }
    };
    return () => es.close();
  }, []);

  return calls;
}
