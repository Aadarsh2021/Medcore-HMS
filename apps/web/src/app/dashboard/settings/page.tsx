'use client';

import React, { useState } from 'react';
import { AppShell } from '../../../components/layout/AppShell';
import { PageHeader } from '../../../components/layout/PageHeader';
import { Tabs } from '../../../components/ui/Tabs';
import { Button } from '../../../components/ui/Button';
import { Badge } from '../../../components/ui/Badge';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../../../components/ui/Card';
import { Input } from '../../../components/ui/Input';
import { Select } from '../../../components/ui/Select';
import {
  Settings as SettingsIcon,
  User,
  Bell,
  Clock,
  Shield,
  CheckCircle2,
  Lock,
  Building,
} from 'lucide-react';
import { UserRole } from '@medcore/types';

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState('profile');
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Profile Settings
  const [fullName, setFullName] = useState('Dr. Sarah Jenkins');
  const [email, setEmail] = useState('sarah.jenkins@medcore.health');
  const [phone, setPhone] = useState('+1 (555) 349-2011');
  const [department, setDepartment] = useState('Cardiology');

  // Operational Settings
  const [slotDuration, setSlotDuration] = useState('15');
  const [currency, setCurrency] = useState('INR');
  const [invoicePrefix, setInvoicePrefix] = useState('INV-2026-');
  const [receiptPrefix, setReceiptPrefix] = useState('RCP-2026-');
  const [autoReleaseReports, setAutoReleaseReports] = useState(true);

  // Notification Preferences
  const [notifyUrgentLab, setNotifyUrgentLab] = useState(true);
  const [notifyLowStock, setNotifyLowStock] = useState(true);
  const [notifyApptCancel, setNotifyApptCancel] = useState(true);

  const showSavedNotice = (msg: string) => {
    setSuccessMessage(msg);
    setTimeout(() => setSuccessMessage(null), 3500);
  };

  const handleSaveProfile = (e: React.FormEvent) => {
    e.preventDefault();
    showSavedNotice('Your profile settings have been saved.');
  };

  const handleSaveOperations = (e: React.FormEvent) => {
    e.preventDefault();
    showSavedNotice('Institutional operations configuration saved.');
  };

  const handleSaveNotifications = (e: React.FormEvent) => {
    e.preventDefault();
    showSavedNotice('Alert and notification preferences updated.');
  };

  return (
    <AppShell>
      <div className="space-y-6 max-w-5xl">
        <PageHeader
          title="Account & System Settings"
          description="Manage personal credentials, notification alerts, and institutional outpatient parameters."
          breadcrumbs={[
            { label: 'Dashboard', href: '/dashboard' },
            { label: 'Settings' },
          ]}
        />

        {successMessage && (
          <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-lg text-emerald-800 text-sm flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
            <span>{successMessage}</span>
          </div>
        )}

        <Tabs
          tabs={[
            { id: 'profile', label: 'User Profile' },
            { id: 'operations', label: 'Hospital Parameters' },
            { id: 'notifications', label: 'Alerts & Notifications' },
            { id: 'security', label: 'Security & Auth' },
          ]}
          activeTab={activeTab}
          onChange={setActiveTab}
        />

        {/* TAB 1: USER PROFILE */}
        {activeTab === 'profile' && (
          <Card>
            <CardHeader className="border-b pb-4">
              <CardTitle>Personal Identification</CardTitle>
              <CardDescription>
                Your authenticated profile details used for audit logs, digital signatures, and clinician encounters.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-6">
              <form onSubmit={handleSaveProfile} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Input
                    label="Full Name & Clinical Credentials"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    required
                  />
                  <Input
                    label="Clinical Department"
                    value={department}
                    onChange={(e) => setDepartment(e.target.value)}
                    required
                  />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Input
                    label="Institutional Email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                  <Input
                    label="Direct Contact Number"
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    required
                  />
                </div>
                <div className="pt-2 flex justify-end">
                  <Button type="submit">Update Profile</Button>
                </div>
              </form>
            </CardContent>
          </Card>
        )}

        {/* TAB 2: HOSPITAL PARAMETERS */}
        {activeTab === 'operations' && (
          <Card>
            <CardHeader className="border-b pb-4">
              <CardTitle>Institutional Workflow Parameters</CardTitle>
              <CardDescription>
                Configure scheduling granularity, fiscal prefixes, and clinical release protocols.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-6">
              <form onSubmit={handleSaveOperations} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Select
                    label="Default OPD Consultation Slot Duration"
                    value={slotDuration}
                    onChange={(e) => setSlotDuration(e.target.value)}
                    options={[
                      { value: '10', label: '10 minutes per patient' },
                      { value: '15', label: '15 minutes per patient (Standard)' },
                      { value: '20', label: '20 minutes per patient' },
                      { value: '30', label: '30 minutes per patient' },
                    ]}
                  />
                  <Select
                    label="Fiscal Currency Display"
                    value={currency}
                    onChange={(e) => setCurrency(e.target.value)}
                    options={[
                      { value: 'INR', label: 'INR (₹ - Indian Rupee)' },
                      { value: 'USD', label: 'USD ($ - US Dollar)' },
                      { value: 'EUR', label: 'EUR (€ - Euro)' },
                      { value: 'GBP', label: 'GBP (£ - British Pound)' },
                    ]}
                  />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Input
                    label="Invoice Numbering Prefix"
                    value={invoicePrefix}
                    onChange={(e) => setInvoicePrefix(e.target.value)}
                  />
                  <Input
                    label="Receipt Numbering Prefix"
                    value={receiptPrefix}
                    onChange={(e) => setReceiptPrefix(e.target.value)}
                  />
                </div>
                <div className="pt-2">
                  <label className="flex items-center gap-2.5 cursor-pointer text-sm font-medium text-slate-800">
                    <input
                      type="checkbox"
                      checked={autoReleaseReports}
                      onChange={(e) => setAutoReleaseReports(e.target.checked)}
                      className="rounded border-slate-300 text-teal-600 focus:ring-teal-500 h-4 w-4"
                    />
                    <span>Automatically publish verified laboratory reports to Patient 360 portal upon approval</span>
                  </label>
                </div>
                <div className="pt-3 flex justify-end border-t">
                  <Button type="submit">Save Operational Parameters</Button>
                </div>
              </form>
            </CardContent>
          </Card>
        )}

        {/* TAB 3: NOTIFICATIONS */}
        {activeTab === 'notifications' && (
          <Card>
            <CardHeader className="border-b pb-4">
              <CardTitle>Clinical & Institutional Alerts</CardTitle>
              <CardDescription>
                Configure high-priority dispatch channels for critical operational events.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-6">
              <form onSubmit={handleSaveNotifications} className="space-y-4">
                <div className="space-y-3">
                  <label className="flex items-start gap-3 p-3 rounded-lg border border-slate-200 hover:bg-slate-50 cursor-pointer transition-colors">
                    <input
                      type="checkbox"
                      checked={notifyUrgentLab}
                      onChange={(e) => setNotifyUrgentLab(e.target.checked)}
                      className="rounded border-slate-300 text-teal-600 focus:ring-teal-500 h-4 w-4 mt-1"
                    />
                    <div>
                      <div className="text-sm font-semibold text-slate-800">Critical Laboratory Value Alerts</div>
                      <div className="text-xs text-slate-500">
                        Dispatch immediate dashboard alerts when a panic-range result is entered for an assigned patient.
                      </div>
                    </div>
                  </label>

                  <label className="flex items-start gap-3 p-3 rounded-lg border border-slate-200 hover:bg-slate-50 cursor-pointer transition-colors">
                    <input
                      type="checkbox"
                      checked={notifyLowStock}
                      onChange={(e) => setNotifyLowStock(e.target.checked)}
                      className="rounded border-slate-300 text-teal-600 focus:ring-teal-500 h-4 w-4 mt-1"
                    />
                    <div>
                      <div className="text-sm font-semibold text-slate-800">Pharmacy Low Stock & Expiry Warnings</div>
                      <div className="text-xs text-slate-500">
                        Notify central pharmacy staff when medication inventory approaches reorder threshold or expires within 30 days.
                      </div>
                    </div>
                  </label>

                  <label className="flex items-start gap-3 p-3 rounded-lg border border-slate-200 hover:bg-slate-50 cursor-pointer transition-colors">
                    <input
                      type="checkbox"
                      checked={notifyApptCancel}
                      onChange={(e) => setNotifyApptCancel(e.target.checked)}
                      className="rounded border-slate-300 text-teal-600 focus:ring-teal-500 h-4 w-4 mt-1"
                    />
                    <div>
                      <div className="text-sm font-semibold text-slate-800">Outpatient Cancellation Notifications</div>
                      <div className="text-xs text-slate-500">
                        Notify reception and attending clinicians when an outpatient visit is rescheduled or cancelled.
                      </div>
                    </div>
                  </label>
                </div>
                <div className="pt-3 flex justify-end border-t">
                  <Button type="submit">Update Alert Rules</Button>
                </div>
              </form>
            </CardContent>
          </Card>
        )}

        {/* TAB 4: SECURITY */}
        {activeTab === 'security' && (
          <div className="space-y-6">
            <Card>
              <CardHeader className="border-b pb-4">
                <CardTitle>Multi-Factor Authentication & Access Security</CardTitle>
                <CardDescription>
                  Enterprise authentication protocols protecting Protected Health Information (PHI).
                </CardDescription>
              </CardHeader>
              <CardContent className="p-6 space-y-4">
                <div className="flex items-center justify-between p-4 bg-emerald-50 border border-emerald-200 rounded-lg">
                  <div className="flex items-center gap-3">
                    <Shield className="w-6 h-6 text-emerald-600" />
                    <div>
                      <div className="text-sm font-semibold text-emerald-950">Enterprise Session Active</div>
                      <div className="text-xs text-emerald-800">
                        Authenticated via institutional Supabase Auth gateway with JWT session tokens.
                      </div>
                    </div>
                  </div>
                  <Badge variant="success">Protected</Badge>
                </div>

                <div className="pt-2">
                  <h4 className="text-sm font-semibold text-slate-800 mb-2">Password Update</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <Input label="Current Password" type="password" placeholder="••••••••" />
                    <Input label="New Password (min 12 chars)" type="password" placeholder="••••••••" />
                  </div>
                  <div className="mt-3 flex justify-end">
                    <Button
                      variant="outline"
                      onClick={() => showSavedNotice('Password change request dispatched.')}
                    >
                      Update Password
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </AppShell>
  );
}
