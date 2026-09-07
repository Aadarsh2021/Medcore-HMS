/**
 * MedCore HMS — Notifications Service Adapter
 *
 * Provides typed interface and runtime notification management for:
 *   - Clinical alerts & urgent lab results
 *   - Appointment confirmations & cancellations
 *   - Low-stock & batch expiry alerts
 *   - Billing invoices & payment confirmations
 */

export interface HospitalNotification {
  id: string;
  title: string;
  message: string;
  category: 'CLINICAL' | 'APPOINTMENT' | 'LABORATORY' | 'PHARMACY' | 'BILLING' | 'SECURITY';
  priority: 'ROUTINE' | 'URGENT' | 'CRITICAL';
  createdAt: string;
  isRead: boolean;
  linkUrl?: string;
}

const INITIAL_NOTIFICATIONS: HospitalNotification[] = [
  {
    id: 'notif-1',
    title: 'Urgent Diagnostic Lab Report Ready',
    message: 'Lipid Panel for Arjun Verma (MGH-2025-000001) verified with elevated direct LDL.',
    category: 'LABORATORY',
    priority: 'URGENT',
    createdAt: new Date(Date.now() - 15 * 60 * 1000).toISOString(),
    isRead: false,
    linkUrl: '/dashboard/laboratory',
  },
  {
    id: 'notif-2',
    title: 'Outpatient Consultation Check-in',
    message: 'Patient Sunita Rao checked in for OPD Room 204 with Dr. Arvind Sharma.',
    category: 'APPOINTMENT',
    priority: 'ROUTINE',
    createdAt: new Date(Date.now() - 35 * 60 * 1000).toISOString(),
    isRead: false,
    linkUrl: '/dashboard/appointments',
  },
  {
    id: 'notif-3',
    title: 'Pharmacy Near-Expiry Alert (FEFO)',
    message: 'Amoxicillin 500mg (Batch EXP-AMX-2025) has 12 days remaining before expiration.',
    category: 'PHARMACY',
    priority: 'URGENT',
    createdAt: new Date(Date.now() - 90 * 60 * 1000).toISOString(),
    isRead: false,
    linkUrl: '/dashboard/pharmacy',
  },
  {
    id: 'notif-4',
    title: 'Payment Received',
    message: 'Invoice INV-2026-000412 paid in full via UPI Desk 1 ($120.00).',
    category: 'BILLING',
    priority: 'ROUTINE',
    createdAt: new Date(Date.now() - 180 * 60 * 1000).toISOString(),
    isRead: true,
    linkUrl: '/dashboard/billing',
  },
  {
    id: 'notif-5',
    title: 'Clinical Encounter Finalized',
    message: 'Encounter ENC-2026-00001 finalized by Dr. Sarah Jenkins. Record locked.',
    category: 'CLINICAL',
    priority: 'ROUTINE',
    createdAt: new Date(Date.now() - 240 * 60 * 1000).toISOString(),
    isRead: true,
    linkUrl: '/dashboard/clinical',
  },
];

class NotificationsService {
  private notifications = [...INITIAL_NOTIFICATIONS];

  async list(): Promise<HospitalNotification[]> {
    return [...this.notifications];
  }

  async markAsRead(id: string): Promise<void> {
    this.notifications = this.notifications.map((n) =>
      n.id === id ? { ...n, isRead: true } : n,
    );
  }

  async markAllAsRead(): Promise<void> {
    this.notifications = this.notifications.map((n) => ({ ...n, isRead: true }));
  }

  async clearNotification(id: string): Promise<void> {
    this.notifications = this.notifications.filter((n) => n.id !== id);
  }
}

export const notificationsService = new NotificationsService();
