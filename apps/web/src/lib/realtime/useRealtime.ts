'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { Socket } from 'socket.io-client';
import { useAuthStore } from '../../stores/authStore';
import { getRealtimeSocket } from './socket';

export interface BedStatusUpdate {
  bedId: string;
  bedNumber: string;
  status: string;
  roomId: string;
  patientName?: string;
}

export interface CriticalLabAlert {
  orderId: string;
  testName: string;
  value: string;
  referenceRange?: string;
  patientId: string;
  orderingDoctorId?: string;
}

export interface QueueTicketCall {
  ticketNumber: string;
  doctorName: string;
  roomNumber?: string;
  departmentId?: string;
}

export function useRealtime() {
  const { session, user } = useAuthStore();
  const [isConnected, setIsConnected] = useState(false);
  const [lastCriticalAlert, setLastCriticalAlert] = useState<CriticalLabAlert | null>(null);
  const [lastBedUpdate, setLastBedUpdate] = useState<BedStatusUpdate | null>(null);
  const [lastNotification, setLastNotification] = useState<any | null>(null);
  const [lastQueueTicket, setLastQueueTicket] = useState<QueueTicketCall | null>(null);

  const socketRef = useRef<Socket | null>(null);
  const token = session?.access_token;

  useEffect(() => {
    if (!token) {
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
        setIsConnected(false);
      }
      return;
    }

    const socket = getRealtimeSocket({ token });
    socketRef.current = socket;

    const handleConnect = () => setIsConnected(true);
    const handleDisconnect = () => setIsConnected(false);

    const handleBedStatus = (data: BedStatusUpdate) => {
      setLastBedUpdate(data);
    };

    const handleCriticalAlert = (data: CriticalLabAlert) => {
      setLastCriticalAlert(data);
    };

    const handleNotification = (data: any) => {
      setLastNotification(data);
    };

    const handleQueueTicket = (data: QueueTicketCall) => {
      setLastQueueTicket(data);
    };

    socket.on('connect', handleConnect);
    socket.on('disconnect', handleDisconnect);
    socket.on('bed.status_changed', handleBedStatus);
    socket.on('lab.critical_value', handleCriticalAlert);
    socket.on('notification.new', handleNotification);
    socket.on('queue.ticket_called', handleQueueTicket);

    if (socket.connected) {
      setIsConnected(true);
    }

    // Auto-subscribe to beds for staff roles
    if (user?.role && ['DOCTOR', 'NURSE', 'HOSPITAL_ADMIN', 'SUPER_ADMIN'].includes(user.role)) {
      socket.emit('subscribe_beds');
    }

    return () => {
      socket.off('connect', handleConnect);
      socket.off('disconnect', handleDisconnect);
      socket.off('bed.status_changed', handleBedStatus);
      socket.off('lab.critical_value', handleCriticalAlert);
      socket.off('notification.new', handleNotification);
      socket.off('queue.ticket_called', handleQueueTicket);
    };
  }, [token, user?.role]);

  const subscribeBeds = useCallback(() => {
    if (socketRef.current?.connected) {
      socketRef.current.emit('subscribe_beds');
    }
  }, []);

  const subscribeQueue = useCallback((departmentId?: string) => {
    if (socketRef.current?.connected) {
      socketRef.current.emit('subscribe_queue', { departmentId });
    }
  }, []);

  const clearCriticalAlert = useCallback(() => {
    setLastCriticalAlert(null);
  }, []);

  return {
    isConnected,
    lastCriticalAlert,
    lastBedUpdate,
    lastNotification,
    lastQueueTicket,
    subscribeBeds,
    subscribeQueue,
    clearCriticalAlert,
  };
}
