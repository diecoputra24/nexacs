import { getStoredAccessToken } from './api-client';

export function createEventWebSocket(onEvent: (payload: unknown) => void): WebSocket | null {
  if (typeof window === 'undefined') return null;
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const token = getStoredAccessToken();
  const query = token ? `?token=${encodeURIComponent(token)}` : '';
  const url = `${proto}//${window.location.host}/ws/v1/events${query}`;

  try {
    const ws = new WebSocket(url);
    ws.onmessage = (msg) => {
      try {
        onEvent(JSON.parse(msg.data));
      } catch {
        // ignore malformed frames
      }
    };
    return ws;
  } catch {
    return null;
  }
}
