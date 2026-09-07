import React from 'react';
import { Drawer } from './Drawer';
import { Bell, AlertTriangle, CheckCircle2, Clock, Pill, FlaskConical } from 'lucide-react';

export interface NotificationCenterProps {
  isOpen: boolean;
  onClose: () => void;
}

export const NotificationCenter: React.FC<NotificationCenterProps> = ({
  isOpen,
  onClose,
}) => {
  const notifications = [
    {
      id: 'notif-1',
      title: 'Prescription Awaiting Dispense',
      desc: 'RX-2026-000001 (Arjun Verma) is waiting for pharmacy batch allocation.',
      time: '12m ago',
      type: 'pharmacy',
      icon: Pill,
      badgeColor: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300',
    },
    {
      id: 'notif-2',
      title: 'Critical Lab Value Alert',
      desc: 'Serum Total Cholesterol: 242 mg/dL for Patient Arjun Verma (MGH-2025-000001).',
      time: '45m ago',
      type: 'lab',
      icon: FlaskConical,
      badgeColor: 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300',
    },
    {
      id: 'notif-3',
      title: 'Batch Expiry Warning (<30 Days)',
      desc: 'Batch AMX-2024-X4 (Amoxicillin 500mg) expires on 2026-09-30. 15 units remaining.',
      time: '2h ago',
      type: 'inventory',
      icon: AlertTriangle,
      badgeColor: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300',
    },
    {
      id: 'notif-4',
      title: 'Appointment Checked In',
      desc: 'Kavita Patel (MGH-2025-000002) checked in for Dr. Arvind Sharma (OPD Slot 09:30).',
      time: '3h ago',
      type: 'appointment',
      icon: Clock,
      badgeColor: 'bg-teal-100 text-teal-800 dark:bg-teal-950 dark:text-teal-300',
    },
  ];

  return (
    <Drawer
      isOpen={isOpen}
      onClose={onClose}
      title="Hospital Notifications"
      subtitle="Real-time clinical, pharmacy, and operational alerts"
      width="md"
    >
      <div className="space-y-3">
        {notifications.map((n) => {
          const Icon = n.icon;
          return (
            <div
              key={n.id}
              className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm space-y-2 hover:border-teal-300 dark:hover:border-teal-700 transition"
            >
              <div className="flex items-center justify-between">
                <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${n.badgeColor} flex items-center gap-1.5`}>
                  <Icon className="w-3.5 h-3.5" />
                  {n.title}
                </span>
                <span className="text-[11px] text-slate-400">{n.time}</span>
              </div>
              <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed">
                {n.desc}
              </p>
            </div>
          );
        })}
      </div>
    </Drawer>
  );
};
