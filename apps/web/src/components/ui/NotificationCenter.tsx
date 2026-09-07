import React, { useState } from 'react';
import { Drawer } from './Drawer';
import { Bell, AlertTriangle, CheckCircle2, Clock, Pill, FlaskConical, CheckCheck, Trash2 } from 'lucide-react';
import { Button } from './Button';

export interface NotificationCenterProps {
  isOpen: boolean;
  onClose: () => void;
}

export const NotificationCenter: React.FC<NotificationCenterProps> = ({
  isOpen,
  onClose,
}) => {
  const [filter, setFilter] = useState<'ALL' | 'CLINICAL' | 'PHARMACY' | 'APPOINTMENTS'>('ALL');
  const [notifications, setNotifications] = useState([
    {
      id: 'notif-1',
      title: 'Prescription Awaiting Dispense',
      desc: 'RX-2026-000001 (Arjun Verma) is waiting for pharmacy batch allocation.',
      time: '12m ago',
      category: 'PHARMACY',
      icon: Pill,
      badgeColor: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300',
      isRead: false,
    },
    {
      id: 'notif-2',
      title: 'Critical Lab Value Alert',
      desc: 'Serum Total Cholesterol: 242 mg/dL for Patient Arjun Verma (MGH-2025-000001).',
      time: '45m ago',
      category: 'CLINICAL',
      icon: FlaskConical,
      badgeColor: 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300',
      isRead: false,
    },
    {
      id: 'notif-3',
      title: 'Batch Expiry Warning (<30 Days)',
      desc: 'Batch AMX-2024-X4 (Amoxicillin 500mg) expires on 2026-09-30. 15 units remaining.',
      time: '2h ago',
      category: 'PHARMACY',
      icon: AlertTriangle,
      badgeColor: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300',
      isRead: false,
    },
    {
      id: 'notif-4',
      title: 'Appointment Checked In',
      desc: 'Kavita Patel (MGH-2025-000002) checked in for Dr. Arvind Sharma (OPD Slot 09:30).',
      time: '3h ago',
      category: 'APPOINTMENTS',
      icon: Clock,
      badgeColor: 'bg-teal-100 text-teal-800 dark:bg-teal-950 dark:text-teal-300',
      isRead: true,
    },
  ]);

  const handleMarkAllRead = () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
  };

  const handleClearAll = () => {
    setNotifications([]);
  };

  const filtered = notifications.filter((n) => {
    if (filter === 'ALL') return true;
    return n.category === filter;
  });

  return (
    <Drawer
      isOpen={isOpen}
      onClose={onClose}
      title="Hospital Operational Alerts"
      subtitle="Real-time clinical, pharmacy, and operational notifications"
      width="md"
    >
      <div className="space-y-4">
        {/* Actions bar */}
        <div className="flex items-center justify-between gap-2 border-b border-slate-100 dark:border-slate-800 pb-3">
          <div className="flex items-center gap-1">
            {(['ALL', 'CLINICAL', 'PHARMACY', 'APPOINTMENTS'] as const).map((cat) => (
              <button
                key={cat}
                onClick={() => setFilter(cat)}
                className={`px-2 py-1 rounded text-[11px] font-semibold transition ${
                  filter === cat
                    ? 'bg-teal-600 text-white shadow-2xs'
                    : 'text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                {cat.charAt(0) + cat.slice(1).toLowerCase()}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleMarkAllRead}
              className="text-[11px] text-slate-500 hover:text-teal-600 flex items-center gap-1"
              title="Mark all as read"
            >
              <CheckCheck className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={handleClearAll}
              className="text-[11px] text-slate-400 hover:text-rose-600 flex items-center gap-1"
              title="Clear notifications"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Notifications list */}
        {filtered.length === 0 ? (
          <div className="py-12 text-center text-xs text-slate-400">
            No active alerts in this category
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map((n) => {
              const Icon = n.icon;
              return (
                <div
                  key={n.id}
                  className={`p-4 rounded-xl border transition space-y-2 ${
                    n.isRead
                      ? 'border-slate-200 dark:border-slate-800 bg-white/60 dark:bg-slate-900/40 opacity-75'
                      : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-xs'
                  }`}
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
        )}
      </div>
    </Drawer>
  );
};
