import { io, Socket } from 'socket.io-client';

let socketInstance: Socket | null = null;

export interface SocketConnectionOptions {
  token: string;
  url?: string;
}

export function getRealtimeSocket(options: SocketConnectionOptions): Socket {
  const defaultUrl = process.env.NEXT_PUBLIC_API_URL
    ? process.env.NEXT_PUBLIC_API_URL.replace(/\/api$/, '')
    : 'http://localhost:3001';

  const baseUrl = options.url || defaultUrl;

  if (socketInstance) {
    // If token has changed, update auth token and reconnect
    if (socketInstance.auth && (socketInstance.auth as any).token !== options.token) {
      socketInstance.auth = { token: options.token };
      if (socketInstance.connected) {
        socketInstance.disconnect().connect();
      }
    }
    return socketInstance;
  }

  socketInstance = io(`${baseUrl}/realtime`, {
    auth: {
      token: options.token,
    },
    transports: ['websocket', 'polling'],
    autoConnect: true,
    reconnection: true,
    reconnectionAttempts: 5,
    reconnectionDelay: 1000,
    timeout: 10000,
  });

  return socketInstance;
}

export function disconnectRealtimeSocket(): void {
  if (socketInstance) {
    socketInstance.removeAllListeners();
    socketInstance.disconnect();
    socketInstance = null;
  }
}
