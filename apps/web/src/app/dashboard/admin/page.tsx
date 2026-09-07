'use client';

import React, { useState, useEffect } from 'react';
import { AppShell } from '../../../components/layout/AppShell';
import { PageHeader } from '../../../components/layout/PageHeader';
import { Tabs } from '../../../components/ui/Tabs';
import { StatCard } from '../../../components/ui/StatCard';
import { Button } from '../../../components/ui/Button';
import { Badge } from '../../../components/ui/Badge';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../../../components/ui/Card';
import { Modal } from '../../../components/ui/Modal';
import { Input } from '../../../components/ui/Input';
import { Select } from '../../../components/ui/Select';
import {
  ShieldCheck,
  Users,
  Building2,
  FileCheck2,
  UserPlus,
  KeyRound,
  History,
  AlertTriangle,
  CheckCircle2,
  Lock,
} from 'lucide-react';
import { UserRole } from '@medcore/types';

interface StaffUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  department: string;
  status: 'ACTIVE' | 'SUSPENDED';
  lastActive: string;
}

const INITIAL_STAFF: StaffUser[] = [
  {
    id: 'u-1',
    name: 'Dr. Sarah Jenkins',
    email: 'sarah.jenkins@medcore.health',
    role: UserRole.DOCTOR,
    department: 'Cardiology',
    status: 'ACTIVE',
    lastActive: '10 mins ago',
  },
  {
    id: 'u-2',
    name: 'Marcus Vance',
    email: 'marcus.vance@medcore.health',
    role: UserRole.PHARMACIST,
    department: 'Central Pharmacy',
    status: 'ACTIVE',
    lastActive: '2 mins ago',
  },
  {
    id: 'u-3',
    name: 'Elena Rostova',
    email: 'elena.rostova@medcore.health',
    role: UserRole.LAB_TECHNICIAN,
    department: 'Pathology & Diagnostics',
    status: 'ACTIVE',
    lastActive: '25 mins ago',
  },
  {
    id: 'u-4',
    name: 'Devon Miles',
    email: 'devon.miles@medcore.health',
    role: UserRole.ACCOUNTANT,
    department: 'Finance & Billing',
    status: 'ACTIVE',
    lastActive: '1 hour ago',
  },
  {
    id: 'u-5',
    name: 'Priya Sharma',
    email: 'priya.sharma@medcore.health',
    role: UserRole.RECEPTIONIST,
    department: 'Outpatient Reception',
    status: 'ACTIVE',
    lastActive: '5 mins ago',
  },
  {
    id: 'u-6',
    name: 'Sister Rachel Adams',
    email: 'rachel.adams@medcore.health',
    role: UserRole.NURSE,
    department: 'Cardiology OPD',
    status: 'ACTIVE',
    lastActive: 'Just now',
  },
  {
    id: 'u-7',
    name: 'Dr. Arthur Pendelton',
    email: 'arthur.p@medcore.health',
    role: UserRole.HOSPITAL_ADMIN,
    department: 'Hospital Administration',
    status: 'ACTIVE',
    lastActive: '4 hours ago',
  },
];

interface AuditEntry {
  id: string;
  timestamp: string;
  actor: string;
  role: string;
  action: string;
  target: string;
  status: 'SUCCESS' | 'WARNING' | 'DENIED';
}

const INITIAL_AUDIT_LOGS: AuditEntry[] = [
  {
    id: 'aud-101',
    timestamp: 'Today, 14:32',
    actor: 'Dr. Sarah Jenkins',
    role: 'DOCTOR',
    action: 'Prescription Finalized',
    target: 'RX-2026-0089 (Patient: P-10023)',
    status: 'SUCCESS',
  },
  {
    id: 'aud-102',
    timestamp: 'Today, 14:15',
    actor: 'Marcus Vance',
    role: 'PHARMACIST',
    action: 'FEFO Dispense Executed',
    target: 'Batch B-9902 (Amoxicillin 500mg)',
    status: 'SUCCESS',
  },
  {
    id: 'aud-103',
    timestamp: 'Today, 13:50',
    actor: 'Elena Rostova',
    role: 'LAB_TECHNICIAN',
    action: 'Pathologist Verification Signed',
    target: 'LAB-2026-0045 (Lipid Profile)',
    status: 'SUCCESS',
  },
  {
    id: 'aud-104',
    timestamp: 'Today, 12:20',
    actor: 'Devon Miles',
    role: 'ACCOUNTANT',
    action: 'Payment Collected & Receipt Issued',
    target: 'RCP-2026-00412 (INV-2026-00101)',
    status: 'SUCCESS',
  },
  {
    id: 'aud-105',
    timestamp: 'Today, 11:05',
    actor: 'Priya Sharma',
    role: 'RECEPTIONIST',
    action: 'Patient Registered & UHID Minted',
    target: 'UHID-2026-00049',
    status: 'SUCCESS',
  },
  {
    id: 'aud-106',
    timestamp: 'Yesterday, 19:40',
    actor: 'Unknown Caller',
    role: 'EXTERNAL',
    action: 'Unauthenticated EMR Record Access Attempt',
    target: 'Clinical Note ID #9921',
    status: 'DENIED',
  },
];

export default function AdministrationPage() {
  const [activeTab, setActiveTab] = useState('users');
  const [users, setUsers] = useState<StaffUser[]>(INITIAL_STAFF);
  const [auditLogs, setAuditLogs] = useState<AuditEntry[]>(INITIAL_AUDIT_LOGS);

  // User Invite Modal
  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false);
  const [newUserName, setNewUserName] = useState('');
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserRole, setNewUserRole] = useState<UserRole>(UserRole.DOCTOR);
  const [newUserDept, setNewUserDept] = useState('General Medicine');

  // Hospital Facility Details State
  const [hospitalName, setHospitalName] = useState('Apex Care Multi-Specialty Hospital');
  const [facilityCode, setFacilityCode] = useState('FAC-APEX-01');
  const [accreditation, setAccreditation] = useState('NABH / JCI Accredited Enterprise');
  const [contactEmail, setContactEmail] = useState('admin@apexcare.health');
  const [emergencyPhone, setEmergencyPhone] = useState('+1 (800) 555-0199');
  const [saveFacilitySuccess, setSaveFacilitySuccess] = useState(false);

  const handleCreateUser = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUserName.trim() || !newUserEmail.trim()) return;

    const newUser: StaffUser = {
      id: `u-${Date.now()}`,
      name: newUserName.trim(),
      email: newUserEmail.trim(),
      role: newUserRole,
      department: newUserDept,
      status: 'ACTIVE',
      lastActive: 'Never',
    };

    setUsers((prev) => [newUser, ...prev]);

    // Audit event
    const newAudit: AuditEntry = {
      id: `aud-${Date.now()}`,
      timestamp: 'Just now',
      actor: 'Admin Console',
      role: 'HOSPITAL_ADMIN',
      action: `Staff Account Provisioned (${newUserRole})`,
      target: newUser.email,
      status: 'SUCCESS',
    };
    setAuditLogs((prev) => [newAudit, ...prev]);

    setNewUserName('');
    setNewUserEmail('');
    setIsInviteModalOpen(false);
  };

  const handleToggleUserStatus = (id: string) => {
    setUsers((prev) =>
      prev.map((u) => {
        if (u.id === id) {
          const updatedStatus = u.status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE';
          return { ...u, status: updatedStatus };
        }
        return u;
      })
    );
  };

  const handleSaveFacility = (e: React.FormEvent) => {
    e.preventDefault();
    setSaveFacilitySuccess(true);
    setTimeout(() => setSaveFacilitySuccess(false), 3000);
  };

  return (
    <AppShell>
      <div className="space-y-6">
        <PageHeader
          title="Hospital Administration & RBAC"
          description="Manage clinical staff accounts, assign granular role-based privileges, configure facility metadata, and audit institutional events."
          breadcrumbs={[
            { label: 'Dashboard', href: '/dashboard' },
            { label: 'Administration' },
          ]}
          actions={
            activeTab === 'users' ? (
              <Button onClick={() => setIsInviteModalOpen(true)}>
                <UserPlus className="w-4 h-4 mr-1.5" />
                Provision Staff Member
              </Button>
            ) : undefined
          }
        />

        {/* Administration KPIs */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            title="Active Staff Accounts"
            value={users.filter((u) => u.status === 'ACTIVE').length}
            icon={<Users className="w-5 h-5 text-teal-600" />}
          />
          <StatCard
            title="Licensed Clinicians"
            value={users.filter((u) => u.role === UserRole.DOCTOR).length}
            icon={<ShieldCheck className="w-5 h-5 text-emerald-600" />}
          />
          <StatCard
            title="Institutional Roles"
            value="8 Roles"
            icon={<KeyRound className="w-5 h-5 text-indigo-600" />}
          />
          <StatCard
            title="Security Audit Trail"
            value="100% Compliant"
            icon={<FileCheck2 className="w-5 h-5 text-purple-600" />}
          />
        </div>

        {/* Tab Navigation */}
        <Tabs
          tabs={[
            { id: 'users', label: 'Staff & Roles', count: users.length },
            { id: 'facility', label: 'Facility Profile' },
            { id: 'audit', label: 'Security & Access Logs', count: auditLogs.length },
          ]}
          activeTab={activeTab}
          onChange={setActiveTab}
        />

        {/* TAB 1: USERS & RBAC */}
        {activeTab === 'users' && (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between border-b pb-4">
              <div>
                <CardTitle>Authorized Clinical & Administrative Personnel</CardTitle>
                <CardDescription>
                  Staff identity, clinical service assignment, and authenticated security privileges.
                </CardDescription>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-50 border-b border-slate-200 text-xs font-semibold uppercase text-slate-600">
                    <tr>
                      <th className="px-6 py-3.5">Personnel Name & Email</th>
                      <th className="px-6 py-3.5">Assigned Role</th>
                      <th className="px-6 py-3.5">Clinical Department</th>
                      <th className="px-6 py-3.5">Status</th>
                      <th className="px-6 py-3.5">Activity</th>
                      <th className="px-6 py-3.5 text-right">Access Control</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {users.map((staff) => (
                      <tr key={staff.id} className="hover:bg-slate-50/70 transition-colors">
                        <td className="px-6 py-4">
                          <div className="font-semibold text-slate-900">{staff.name}</div>
                          <div className="text-xs text-slate-500">{staff.email}</div>
                        </td>
                        <td className="px-6 py-4">
                          <Badge
                            variant={
                              staff.role === UserRole.SUPER_ADMIN || staff.role === UserRole.HOSPITAL_ADMIN
                                ? 'purple'
                                : staff.role === UserRole.DOCTOR
                                ? 'info'
                                : staff.role === UserRole.PHARMACIST
                                ? 'warning'
                                : 'neutral'
                            }
                          >
                            {staff.role}
                          </Badge>
                        </td>
                        <td className="px-6 py-4 text-slate-700">{staff.department}</td>
                        <td className="px-6 py-4">
                          <Badge variant={staff.status === 'ACTIVE' ? 'success' : 'danger'}>
                            {staff.status}
                          </Badge>
                        </td>
                        <td className="px-6 py-4 text-xs text-slate-500">{staff.lastActive}</td>
                        <td className="px-6 py-4 text-right">
                          <Button
                            variant={staff.status === 'ACTIVE' ? 'outline' : 'secondary'}
                            size="sm"
                            onClick={() => handleToggleUserStatus(staff.id)}
                          >
                            {staff.status === 'ACTIVE' ? 'Deactivate' : 'Restore'}
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        )}

        {/* TAB 2: FACILITY PROFILE */}
        {activeTab === 'facility' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2">
              <Card>
                <CardHeader className="border-b pb-4">
                  <CardTitle>Hospital Information & Operating Profile</CardTitle>
                  <CardDescription>
                    Official healthcare institution identifiers displayed across prescriptions, lab reports, and tax invoices.
                  </CardDescription>
                </CardHeader>
                <CardContent className="p-6">
                  {saveFacilitySuccess && (
                    <div className="mb-4 p-3 bg-emerald-50 border border-emerald-200 rounded-md text-emerald-800 text-sm flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                      Facility credentials updated successfully.
                    </div>
                  )}
                  <form onSubmit={handleSaveFacility} className="space-y-4">
                    <Input
                      label="Institution / Hospital Legal Name"
                      value={hospitalName}
                      onChange={(e) => setHospitalName(e.target.value)}
                      required
                    />
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <Input
                        label="Facility Registry Code"
                        value={facilityCode}
                        onChange={(e) => setFacilityCode(e.target.value)}
                        required
                      />
                      <Input
                        label="Healthcare Accreditation"
                        value={accreditation}
                        onChange={(e) => setAccreditation(e.target.value)}
                      />
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <Input
                        label="Primary Administration Email"
                        type="email"
                        value={contactEmail}
                        onChange={(e) => setContactEmail(e.target.value)}
                        required
                      />
                      <Input
                        label="Emergency Direct Line"
                        type="tel"
                        value={emergencyPhone}
                        onChange={(e) => setEmergencyPhone(e.target.value)}
                        required
                      />
                    </div>
                    <div className="pt-2 flex justify-end">
                      <Button type="submit">Save Facility Settings</Button>
                    </div>
                  </form>
                </CardContent>
              </Card>
            </div>

            <div>
              <Card>
                <CardHeader>
                  <CardTitle>Institutional Governance</CardTitle>
                  <CardDescription>Security and multi-tenant policies.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4 text-sm text-slate-600">
                  <div className="flex items-start gap-3 p-3 bg-slate-50 rounded-lg border border-slate-200">
                    <Lock className="w-5 h-5 text-indigo-600 shrink-0 mt-0.5" />
                    <div>
                      <div className="font-semibold text-slate-800">Tenant Data Isolation</div>
                      <div className="text-xs text-slate-500 mt-0.5">
                        Row-level multi-tenancy enforces hospital separation across all clinical and administrative records.
                      </div>
                    </div>
                  </div>
                  <div className="flex items-start gap-3 p-3 bg-slate-50 rounded-lg border border-slate-200">
                    <ShieldCheck className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                    <div>
                      <div className="font-semibold text-slate-800">Audit Immutability</div>
                      <div className="text-xs text-slate-500 mt-0.5">
                        Clinical finalizations, dispensing events, and payment receipts generate immutable ledger logs.
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        )}

        {/* TAB 3: AUDIT LOGS */}
        {activeTab === 'audit' && (
          <Card>
            <CardHeader className="border-b pb-4">
              <CardTitle>Hospital Compliance & Operational Audit Trail</CardTitle>
              <CardDescription>
                Chronological record of high-stakes clinical and administrative actions across the institution.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-50 border-b border-slate-200 text-xs font-semibold uppercase text-slate-600">
                    <tr>
                      <th className="px-6 py-3.5">Timestamp</th>
                      <th className="px-6 py-3.5">Authorized Actor</th>
                      <th className="px-6 py-3.5">Role</th>
                      <th className="px-6 py-3.5">Action Executed</th>
                      <th className="px-6 py-3.5">Target Clinical / Fiscal Entity</th>
                      <th className="px-6 py-3.5">Outcome</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {auditLogs.map((log) => (
                      <tr key={log.id} className="hover:bg-slate-50/70 transition-colors">
                        <td className="px-6 py-4 font-mono text-xs text-slate-500">{log.timestamp}</td>
                        <td className="px-6 py-4 font-semibold text-slate-900">{log.actor}</td>
                        <td className="px-6 py-4">
                          <Badge variant="neutral">{log.role}</Badge>
                        </td>
                        <td className="px-6 py-4 font-medium text-slate-800">{log.action}</td>
                        <td className="px-6 py-4 font-mono text-xs text-slate-600">{log.target}</td>
                        <td className="px-6 py-4">
                          <Badge
                            variant={
                              log.status === 'SUCCESS'
                                ? 'success'
                                : log.status === 'WARNING'
                                ? 'warning'
                                : 'danger'
                            }
                          >
                            {log.status}
                          </Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Modal: Invite / Create User */}
        <Modal
          isOpen={isInviteModalOpen}
          onClose={() => setIsInviteModalOpen(false)}
          title="Provision Staff Member"
          description="Issue an institutional invitation and assign role permissions."
        >
          <form onSubmit={handleCreateUser} className="space-y-4">
            <Input
              label="Staff Member Full Name"
              placeholder="e.g., Dr. Robert Chen"
              value={newUserName}
              onChange={(e) => setNewUserName(e.target.value)}
              required
            />
            <Input
              label="Institutional Email Address"
              type="email"
              placeholder="name@medcore.health"
              value={newUserEmail}
              onChange={(e) => setNewUserEmail(e.target.value)}
              required
            />
            <Select
              label="Assigned System Role"
              value={newUserRole}
              onChange={(e) => setNewUserRole(e.target.value as UserRole)}
              options={[
                { value: UserRole.DOCTOR, label: 'Doctor / Clinician (OPD & EMR)' },
                { value: UserRole.NURSE, label: 'Nurse (Vitals & Clinical Intake)' },
                { value: UserRole.RECEPTIONIST, label: 'Receptionist (Front Desk & Appointments)' },
                { value: UserRole.PHARMACIST, label: 'Pharmacist (Inventory & Dispensing)' },
                { value: UserRole.LAB_TECHNICIAN, label: 'Lab Technician (Specimens & Diagnostics)' },
                { value: UserRole.ACCOUNTANT, label: 'Accountant (Cashier & Invoicing)' },
                { value: UserRole.HOSPITAL_ADMIN, label: 'Hospital Administrator (Operations & Staff)' },
              ]}
            />
            <Input
              label="Assigned Clinical Department"
              placeholder="e.g., Cardiology, Pathology, Front Office"
              value={newUserDept}
              onChange={(e) => setNewUserDept(e.target.value)}
              required
            />
            <div className="pt-3 flex justify-end gap-2 border-t">
              <Button variant="outline" type="button" onClick={() => setIsInviteModalOpen(false)}>
                Cancel
              </Button>
              <Button type="submit">Issue Credentials</Button>
            </div>
          </form>
        </Modal>
      </div>
    </AppShell>
  );
}
