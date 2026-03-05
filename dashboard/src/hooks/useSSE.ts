import { useEffect, useRef, useState, useCallback } from 'react';
import { API_BASE } from '../lib/api';

interface SSEOptions {
  onProgress?: (data: any) => void;
  onComplete?: (data: any) => void;
  onError?: (error: any) => void;
}

export function useSSE(simulationId: string | null, options: SSEOptions) {
  const [connected, setConnected] = useState(false);
  const sourceRef = useRef<EventSource | null>(null);

  const disconnect = useCallback(() => {
    if (sourceRef.current) {
      sourceRef.current.close();
      sourceRef.current = null;
      setConnected(false);
    }
  }, []);

  useEffect(() => {
    if (!simulationId) return;

    const token = localStorage.getItem('admin_token');
    const url = `${API_BASE}/api/admin/simulations/${simulationId}/stream?token=${token}`;
    const source = new EventSource(url);
    sourceRef.current = source;

    source.onopen = () => setConnected(true);

    source.addEventListener('progress', (e) => {
      options.onProgress?.(JSON.parse(e.data));
    });

    source.addEventListener('complete', (e) => {
      options.onComplete?.(JSON.parse(e.data));
      source.close();
      setConnected(false);
    });

    source.addEventListener('error', (e) => {
      options.onError?.(e);
      source.close();
      setConnected(false);
    });

    source.onerror = () => {
      setConnected(false);
    };

    return () => {
      source.close();
      setConnected(false);
    };
  }, [simulationId]); // eslint-disable-line react-hooks/exhaustive-deps

  return { connected, disconnect };
}
