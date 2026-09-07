'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '../../stores/authStore';
import { AppShell } from '../../components/layout/AppShell';
import { PageHeader } from '../../components/layout/PageHeader';
import { StatCard } from '../../components/ui/StatCard';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../../components/ui/Card';
import {
  Calendar,
  Clock,
  UserPlus,
  Stethoscope,
  Pill,
  FlaskConical,
  Receipt,
  ArrowRight,
  Activity,
  HeartPulse,
  AlertTriangle,
  FileText,
  Building2,
  CheckCircle2,
  Download,
  ShieldCheck,
  Users,
  Search,
  CheckSquare,
  Sparkles,
  TrendingUp,
  CreditCard,
  Building,
  UserCheck,
  ShieldAlert,
  ClipboardList,
} from 'lucide-react';
import { appointmentsService, AppointmentRecord } from '../../lib/api/appointments.service';
import { UserRole } from '@medcore/types';

export default function DashboardPage() {
  const router = useRouter();
  const { user } = useAuthStore();
  const [appointments, setAppointments] = useState<AppointmentRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Active Role Workspace (defaults to authenticated role, but switchable for QA review)
  const actualRole = user?.role || UserRole.DOCTOR;
  const [activeWorkspaceRole, setActiveWorkspaceRole] = useState<UserRole>(actualRole);

  useEffect(() => {
    setActiveWorkspaceRole(user?.role || UserRole.DOCTOR);
  }, [user?.role]);

  useEffect(() => {
    async function loadData() {
      try {
        const aptRes = await appointmentsService.list();
        setAppointments(aptRes.items);
      } finally {
        setIsLoading(false);
      }
    }
    loadData();
  }, []);

  const todayFormatted = new Intl.DateTimeFormat('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date());

  const ALL_ROLES = [
    { role: UserRole.SUPER_ADMIN, label: 'Super Admin' },
    { role: UserRole.HOSPITAL_ADMIN, label: 'Hospital Admin' },
    { role: UserRole.DOCTOR, label: 'Doctor' },
    { role: UserRole.NURSE, label: 'Nurse' },
    { role: UserRole.RECEPTIONIST, label: 'Receptionist' },
    { role: UserRole.PHARMACIST, label: 'Pharmacist' },
    { role: UserRole.LAB_TECHNICIAN, label: 'Lab Technician' },
    { role: UserRole.ACCOUNTANT, label: 'Accountant' },
    { role: UserRole.PATIENT, label: 'Patient' },
  ];

  return (
    <AppShell>
      <div className="space-y-6">
        {/* Role Workspace Switcher Banner for QA & Multi-Role Review */}
        <div className="p-3 bg-slate-900 text-white rounded-xl flex flex-wrap items-center justify-between gap-3 shadow-sm">
          <div className="flex items-center gap-2 text-xs">
            <Sparkles className="w-4 h-4 text-teal-400" />
            <span className="font-semibold text-slate-200">Workspace View:</span>
            <span className="font-mono text-teal-300 font-bold uppercase">{activeWorkspaceRole.replace('_', ' ')}</span>
            <span className="text-slate-400 hidden sm:inline">&middot; Switch workspace to inspect specialized role dashboards</span>
          </div>
          <div className="flex flex-wrap items-center gap-1">
            {ALL_ROLES.map(({ role, label }) => (
              <button
                key={role}
                onClick={() => setActiveWorkspaceRole(role)}
                className={`px-2 py-1 rounded text-[11px] font-medium transition ${
                  activeWorkspaceRole === role
                    ? 'bg-teal-600 text-white font-bold shadow-xs'
                    : 'text-slate-300 hover:bg-slate-800'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* ========================================================================= */}
        {/* 1. SUPER ADMIN WORKSPACE */}
        {/* ========================================================================= */}
        {activeWorkspaceRole === UserRole.SUPER_ADMIN && (
          <div className="space-y-6">
            <PageHeader
              title="Enterprise Super Admin Workspace"
              description="System-wide multi-tenant governance, cross-hospital operational metrics & facility health"
              badge={<Badge variant="purple">Super Admin Control</Badge>}
              actions={
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" onClick={() => router.push('/dashboard/admin')}>
                    Facility Administration
                  </Button>
                  <Button variant="primary" size="sm" onClick={() => router.push('/dashboard/admin')}>
                    Provision Hospital Tenant
                  </Button>
                </div>
              }
            />

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <StatCard
                title="Active Hospital Facilities"
                value="2 Multi-Tenants"
                subtitle="Metro General & Apex Specialty"
                icon={<Building2 className="w-5 h-5 text-purple-600" />}
              />
              <StatCard
                title="System-wide Census"
                value="1,420 Patients"
                subtitle="Cross-facility aggregate UHIDs"
                icon={<Users className="w-5 h-5 text-blue-600" />}
              />
              <StatCard
                title="Enterprise Doctors"
                value="48 Clinicians"
                subtitle="Cardiology, GenMed, Surgery"
                icon={<Stethoscope className="w-5 h-5 text-teal-600" />}
              />
              <StatCard
                title="System Health & Uptime"
                value="99.98%"
                subtitle="PostgreSQL 16 & Redis Pool Healthy"
                icon={<ShieldCheck className="w-5 h-5 text-emerald-600" />}
                trend={{ label: 'Healthy', positive: true }}
              />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Provisioned Hospital Facilities</CardTitle>
                  <CardDescription>Multi-tenant isolated healthcare nodes under MedCore HMS</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3 pt-0 text-xs">
                  <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-900/40 flex items-center justify-between">
                    <div>
                      <div className="font-bold text-slate-900 dark:text-white">Metro General Hospital (Main Campus)</div>
                      <div className="text-slate-500 font-mono text-[11px] mt-0.5">Tenant ID: 3516ec1c-c490-4b08-afab-4b28b59eb0aa &middot; Code: METRO-MUM-01</div>
                      <div className="text-emerald-600 font-medium mt-1">24 OPD Rooms &middot; 350 Beds &middot; Central Pharmacy Live</div>
                    </div>
                    <Badge variant="success">ACTIVE</Badge>
                  </div>
                  <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-900/40 flex items-center justify-between">
                    <div>
                      <div className="font-bold text-slate-900 dark:text-white">Apex Specialty Clinic (North Campus)</div>
                      <div className="text-slate-500 font-mono text-[11px] mt-0.5">Tenant ID: 7f89b12a-33cd-4e89-b223-112233445566 &middot; Code: APEX-DEL-02</div>
                      <div className="text-blue-600 font-medium mt-1">12 OPD Rooms &middot; Day Care &middot; Diagnostic Wing</div>
                    </div>
                    <Badge variant="success">ACTIVE</Badge>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Global Audit Trail & Security Events</CardTitle>
                  <CardDescription>Latest cross-facility audit events with non-repudiation</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3 pt-0 text-xs">
                  <div className="p-3 rounded-lg border border-slate-100 dark:border-slate-800 bg-slate-50/40 dark:bg-slate-900/30 space-y-1">
                    <div className="flex justify-between font-semibold">
                      <span>GRN Stock Ingested (Central Pharmacy)</span>
                      <span className="text-slate-400 font-mono text-[10px]">10 mins ago</span>
                    </div>
                    <div className="text-slate-500">GRN-METRO-MUM-01-2026-000001 created by Marcus Vance</div>
                  </div>
                  <div className="p-3 rounded-lg border border-slate-100 dark:border-slate-800 bg-slate-50/40 dark:bg-slate-900/30 space-y-1">
                    <div className="flex justify-between font-semibold">
                      <span>Doctor Prescription Finalized</span>
                      <span className="text-slate-400 font-mono text-[10px]">25 mins ago</span>
                    </div>
                    <div className="text-slate-500">RX-2026-000001 locked and issued by Dr. Sarah Jenkins</div>
                  </div>
                  <div className="p-3 rounded-lg border border-slate-100 dark:border-slate-800 bg-slate-50/40 dark:bg-slate-900/30 space-y-1">
                    <div className="flex justify-between font-semibold">
                      <span>Patient UHID Generated</span>
                      <span className="text-slate-400 font-mono text-[10px]">1 hour ago</span>
                    </div>
                    <div className="text-slate-500">Arjun Verma registered with UHID MGH-2025-000001</div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* 2. HOSPITAL ADMIN WORKSPACE */}
        {/* ========================================================================= */}
        {activeWorkspaceRole === UserRole.HOSPITAL_ADMIN && (
          <div className="space-y-6">
            <PageHeader
              title="Hospital Administrator Dashboard"
              description={`${user?.hospitalName || 'Metro General Hospital'} · Facility Census, Operations & Department Activity`}
              badge={<Badge variant="info">Hospital Operations</Badge>}
              actions={
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" onClick={() => router.push('/dashboard/reports')}>
                    Operational Reports
                  </Button>
                  <Button variant="primary" size="sm" onClick={() => router.push('/dashboard/doctors/new')}>
                    Add Clinician
                  </Button>
                </div>
              }
            />

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <StatCard
                title="Today's OPD Volume"
                value={appointments.length || 4}
                subtitle="2 checked-in, 1 in consultation"
                icon={<Calendar className="w-5 h-5 text-teal-600" />}
                onClick={() => router.push('/dashboard/appointments')}
              />
              <StatCard
                title="Active Doctors on Duty"
                value="8 Specialists"
                subtitle="Cardiology, GenMed, Pediatrics"
                icon={<Stethoscope className="w-5 h-5 text-blue-600" />}
                onClick={() => router.push('/dashboard/doctors')}
              />
              <StatCard
                title="Pharmacy Near-Expiry"
                value="3 Batches"
                subtitle="FEFO allocation active"
                icon={<Pill className="w-5 h-5 text-amber-600" />}
                onClick={() => router.push('/dashboard/pharmacy')}
              />
              <StatCard
                title="Lab Processing Backlog"
                value="2 Pending"
                subtitle="1 report awaiting pathologist approval"
                icon={<FlaskConical className="w-5 h-5 text-purple-600" />}
                onClick={() => router.push('/dashboard/laboratory')}
              />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <Card className="lg:col-span-2">
                <CardHeader>
                  <CardTitle className="text-sm">Departmental Patient Flow & Capacity</CardTitle>
                  <CardDescription>Live consultation load across active hospital clinical wings</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4 pt-0 text-xs">
                  <div>
                    <div className="flex justify-between font-semibold mb-1">
                      <span>Cardiology (OPD Wing A)</span>
                      <span className="text-teal-600 font-bold">18 Appointments (85% Slot Capacity)</span>
                    </div>
                    <div className="w-full h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                      <div className="h-full bg-teal-600 w-[85%]" />
                    </div>
                  </div>
                  <div>
                    <div className="flex justify-between font-semibold mb-1">
                      <span>General Medicine (OPD Wing B)</span>
                      <span className="text-blue-600 font-bold">14 Appointments (70% Slot Capacity)</span>
                    </div>
                    <div className="w-full h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                      <div className="h-full bg-blue-600 w-[70%]" />
                    </div>
                  </div>
                  <div>
                    <div className="flex justify-between font-semibold mb-1">
                      <span>Pediatrics & Neonatal Care</span>
                      <span className="text-indigo-600 font-bold">8 Appointments (55% Slot Capacity)</span>
                    </div>
                    <div className="w-full h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                      <div className="h-full bg-indigo-600 w-[55%]" />
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Facility Quick Navigation</CardTitle>
                  <CardDescription>Executive access to operational wings</CardDescription>
                </CardHeader>
                <CardContent className="space-y-2 pt-0">
                  <Button variant="outline" size="sm" className="w-full justify-start text-xs" onClick={() => router.push('/dashboard/patients')}>
                    <Users className="w-3.5 h-3.5 mr-2 text-teal-600" /> Patient Directory
                  </Button>
                  <Button variant="outline" size="sm" className="w-full justify-start text-xs" onClick={() => router.push('/dashboard/departments')}>
                    <Building2 className="w-3.5 h-3.5 mr-2 text-blue-600" /> Department Settings
                  </Button>
                  <Button variant="outline" size="sm" className="w-full justify-start text-xs" onClick={() => router.push('/dashboard/billing')}>
                    <Receipt className="w-3.5 h-3.5 mr-2 text-amber-600" /> Billing & Revenue
                  </Button>
                  <Button variant="outline" size="sm" className="w-full justify-start text-xs" onClick={() => router.push('/dashboard/admin')}>
                    <ShieldCheck className="w-3.5 h-3.5 mr-2 text-purple-600" /> Staff & Permissions
                  </Button>
                </CardContent>
              </Card>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* 3. DOCTOR CLINICAL WORKSPACE */}
        {/* ========================================================================= */}
        {activeWorkspaceRole === UserRole.DOCTOR && (
          <div className="space-y-6">
            <PageHeader
              title={`Clinical Consultation Workspace`}
              description={`Dr. Sarah Jenkins · Cardiology OPD Room 204 · ${todayFormatted}`}
              badge={<Badge variant="success">OPD Session Live</Badge>}
              actions={
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    leftIcon={<Calendar className="w-4 h-4" />}
                    onClick={() => router.push('/dashboard/appointments')}
                  >
                    View Schedule
                  </Button>
                  <Button
                    variant="clinical"
                    size="sm"
                    leftIcon={<Activity className="w-4 h-4" />}
                    onClick={() => router.push('/dashboard/clinical')}
                  >
                    Start Patient Encounter
                  </Button>
                </div>
              }
            />

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <StatCard
                title="Today's Patient Queue"
                value={appointments.length || 4}
                subtitle="4 scheduled consultations"
                icon={<Calendar className="w-5 h-5 text-teal-600" />}
                onClick={() => router.push('/dashboard/appointments')}
              />
              <StatCard
                title="Active Encounter"
                value="Arjun Verma"
                subtitle="UHID: MGH-2025-000001 · Chest tightness"
                icon={<HeartPulse className="w-5 h-5 text-rose-600" />}
                onClick={() => router.push('/dashboard/clinical')}
              />
              <StatCard
                title="Lab Reports Pending Review"
                value="1 Lipid Panel"
                subtitle="High LDL alert recorded"
                icon={<FlaskConical className="w-5 h-5 text-purple-600" />}
                onClick={() => router.push('/dashboard/laboratory')}
              />
              <StatCard
                title="Prescriptions Issued"
                value="6 Issued"
                subtitle="All electronically signed"
                icon={<FileText className="w-5 h-5 text-indigo-600" />}
                onClick={() => router.push('/dashboard/prescriptions')}
              />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2 space-y-6">
                <Card>
                  <CardHeader className="flex items-center justify-between">
                    <div>
                      <CardTitle className="text-sm flex items-center gap-2">
                        <Clock className="w-4 h-4 text-teal-600" />
                        Today's Outpatient Consultation Queue
                      </CardTitle>
                      <CardDescription>Patients waiting or currently undergoing consultation</CardDescription>
                    </div>
                    <Button variant="ghost" size="sm" onClick={() => router.push('/dashboard/appointments')}>
                      Full Schedule &rarr;
                    </Button>
                  </CardHeader>
                  <CardContent className="p-0">
                    <div className="divide-y divide-slate-100 dark:divide-slate-800">
                      {appointments.slice(0, 4).map((apt) => (
                        <div key={apt.id} className="p-4 flex items-center justify-between hover:bg-slate-50/50 dark:hover:bg-slate-800/40 transition">
                          <div className="flex items-center gap-3">
                            <div className="px-2 py-1 rounded bg-teal-50 dark:bg-teal-950 font-mono text-xs font-bold text-teal-700 dark:text-teal-300">
                              {apt.startTime}
                            </div>
                            <div>
                              <div className="font-semibold text-sm text-slate-900 dark:text-white">
                                {apt.patient?.firstName} {apt.patient?.lastName}
                              </div>
                              <div className="text-xs text-slate-500 font-mono">
                                {apt.patient?.uhid} &middot; {apt.reason || 'Routine Cardiology Follow-up'}
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge variant={apt.status === 'IN_PROGRESS' ? 'warning' : 'info'}>
                              {apt.status}
                            </Badge>
                            {apt.status === 'IN_PROGRESS' ? (
                              <Button variant="clinical" size="sm" onClick={() => router.push('/dashboard/clinical')}>
                                Resume EMR
                              </Button>
                            ) : (
                              <Button variant="outline" size="sm" onClick={() => router.push(`/dashboard/appointments/detail?id=${apt.id}`)}>
                                Examine
                              </Button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </div>

              <div className="space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm flex items-center gap-2">
                      <FlaskConical className="w-4 h-4 text-purple-600" />
                      Pending Lab Approvals
                    </CardTitle>
                    <CardDescription>Diagnostic findings awaiting clinician sign-off</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3 pt-0 text-xs">
                    <div className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 space-y-1">
                      <div className="flex justify-between font-semibold">
                        <span>Arjun Verma (MGH-2025-000001)</span>
                        <Badge variant="danger" size="sm">HIGH LDL</Badge>
                      </div>
                      <div className="text-slate-500">Serum Direct LDL: 158 mg/dL (Target &lt; 100)</div>
                      <Button variant="outline" size="sm" className="w-full mt-2" onClick={() => router.push('/dashboard/laboratory')}>
                        Review Lab Findings
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* 4. NURSE WORKSPACE */}
        {/* ========================================================================= */}
        {activeWorkspaceRole === UserRole.NURSE && (
          <div className="space-y-6">
            <PageHeader
              title="Nursing & Triage Station"
              description="Clinical intake vitals recording, patient prep & ward workload management"
              badge={<Badge variant="info">Nursing Station 2</Badge>}
              actions={
                <Button variant="primary" size="sm" leftIcon={<HeartPulse className="w-4 h-4" />} onClick={() => router.push('/dashboard/clinical')}>
                  Record Patient Vitals
                </Button>
              }
            />

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <StatCard
                title="Awaiting Vitals Intake"
                value="3 Patients"
                subtitle="OPD morning triage queue"
                icon={<HeartPulse className="w-5 h-5 text-rose-600" />}
              />
              <StatCard
                title="Assigned OPD Ward"
                value="OPD Wing A"
                subtitle="Cardiology & General Medicine"
                icon={<Building2 className="w-5 h-5 text-teal-600" />}
              />
              <StatCard
                title="Stat Medication Orders"
                value="1 Dose"
                subtitle="Metoprolol 25mg prescribed"
                icon={<Pill className="w-5 h-5 text-amber-600" />}
              />
              <StatCard
                title="Clinical Tasks Completed"
                value="14 Done"
                subtitle="100% vital logging compliance"
                icon={<CheckCircle2 className="w-5 h-5 text-emerald-600" />}
              />
            </div>

            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Patient Triage & Vital Recording Worklist</CardTitle>
                <CardDescription>Record blood pressure, pulse, SpO2, and temperature before doctor consultation</CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <div className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                  <div className="p-4 flex items-center justify-between">
                    <div>
                      <div className="font-bold text-sm text-slate-900 dark:text-white">Arjun Verma (MGH-2025-000001)</div>
                      <div className="text-slate-500">Dr. Sarah Jenkins · Room 204 · Last Vitals: BP 120/80, Pulse 72</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="success">VITALS RECORDED</Badge>
                      <Button variant="outline" size="sm" onClick={() => router.push('/dashboard/clinical')}>
                        Re-check Vitals
                      </Button>
                    </div>
                  </div>
                  <div className="p-4 flex items-center justify-between">
                    <div>
                      <div className="font-bold text-sm text-slate-900 dark:text-white">Sunita Rao (MGH-2025-000002)</div>
                      <div className="text-slate-500">Dr. Arvind Sharma · Room 102 · Arrived 10 mins ago</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="warning">PENDING VITALS</Badge>
                      <Button variant="primary" size="sm" onClick={() => router.push('/dashboard/clinical')}>
                        Record Vitals
                      </Button>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* ========================================================================= */}
        {/* 5. RECEPTIONIST WORKSPACE */}
        {/* ========================================================================= */}
        {activeWorkspaceRole === UserRole.RECEPTIONIST && (
          <div className="space-y-6">
            <PageHeader
              title="Front Desk & Reception Desk"
              description="Outpatient intake, patient check-in queue, registration & consultation scheduling"
              badge={<Badge variant="warning">Front Desk Active</Badge>}
              actions={
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" leftIcon={<UserPlus className="w-4 h-4" />} onClick={() => router.push('/dashboard/patients/new')}>
                    Register Patient
                  </Button>
                  <Button variant="primary" size="sm" leftIcon={<Calendar className="w-4 h-4" />} onClick={() => router.push('/dashboard/appointments/new')}>
                    Book Consultation
                  </Button>
                </div>
              }
            />

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <StatCard
                title="Today's Check-ins"
                value="2 Checked In"
                subtitle="Out of 4 scheduled appointments"
                icon={<UserCheck className="w-5 h-5 text-teal-600" />}
              />
              <StatCard
                title="New Registrations"
                value="3 Today"
                subtitle="Generated UHID format: MGH-2025-XXXXXX"
                icon={<UserPlus className="w-5 h-5 text-blue-600" />}
              />
              <StatCard
                title="Doctors in OPD"
                value="4 Active"
                subtitle="Consultation rooms 101, 102, 204, 205"
                icon={<Stethoscope className="w-5 h-5 text-indigo-600" />}
              />
              <StatCard
                title="Waiting Hall Census"
                value="5 Patients"
                subtitle="Average wait time: 14 mins"
                icon={<Clock className="w-5 h-5 text-amber-600" />}
              />
            </div>

            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Patient Arrival Check-In Queue</CardTitle>
                <CardDescription>Confirm patient presence at hospital reception to notify clinical queue</CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <div className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                  {appointments.map((apt) => (
                    <div key={apt.id} className="p-4 flex items-center justify-between hover:bg-slate-50/50 dark:hover:bg-slate-800/40">
                      <div>
                        <div className="font-bold text-sm text-slate-900 dark:text-white">
                          {apt.patient?.firstName} {apt.patient?.lastName} ({apt.patient?.uhid})
                        </div>
                        <div className="text-slate-500 mt-0.5">
                          Doctor: {apt.doctor?.user.firstName} {apt.doctor?.user.lastName} &middot; Slot: {apt.startTime}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant={apt.status === 'CONFIRMED' ? 'success' : 'neutral'}>
                          {apt.status}
                        </Badge>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => router.push(`/dashboard/appointments/detail?id=${apt.id}`)}
                        >
                          Check-in / Details
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* ========================================================================= */}
        {/* 6. PHARMACIST WORKSPACE */}
        {/* ========================================================================= */}
        {activeWorkspaceRole === UserRole.PHARMACIST && (
          <div className="space-y-6">
            <PageHeader
              title="Central Pharmacy Hub"
              description="Authoritative FEFO prescription dispensing, physical batch management & stock ledger"
              badge={<Badge variant="info">Central Pharmacy Live</Badge>}
              actions={
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" leftIcon={<Download className="w-4 h-4" />} onClick={() => router.push('/dashboard/pharmacy')}>
                    Stock Intake (GRN)
                  </Button>
                  <Button variant="primary" size="sm" leftIcon={<Pill className="w-4 h-4" />} onClick={() => router.push('/dashboard/pharmacy')}>
                    Dispensing Queue
                  </Button>
                </div>
              }
            />

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <StatCard
                title="Prescriptions in Queue"
                value="2 Awaiting"
                subtitle="Authoritative FEFO allocation ready"
                icon={<Pill className="w-5 h-5 text-teal-600" />}
                onClick={() => router.push('/dashboard/pharmacy')}
              />
              <StatCard
                title="Low Stock Items"
                value="1 Medicine"
                subtitle="Stock at or below reorder level"
                icon={<AlertTriangle className="w-5 h-5 text-amber-600" />}
                onClick={() => router.push('/dashboard/pharmacy')}
              />
              <StatCard
                title="Batches Near Expiry"
                value="1 Expiring Soon"
                subtitle="Batch EXP-AMX-2025 has 12 days"
                icon={<Clock className="w-5 h-5 text-rose-600" />}
                onClick={() => router.push('/dashboard/pharmacy')}
              />
              <StatCard
                title="Ledger Movements Today"
                value="18 Movements"
                subtitle="Append-only StockMovement verified"
                icon={<FileText className="w-5 h-5 text-indigo-600" />}
                onClick={() => router.push('/dashboard/pharmacy')}
              />
            </div>

            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Prescriptions Pending Dispensing</CardTitle>
                <CardDescription>Doctor issued prescriptions ready for batch validation and fulfillment</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 pt-0 text-xs">
                <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/40 flex items-center justify-between">
                  <div>
                    <div className="font-bold text-sm text-slate-900 dark:text-white font-mono">RX-2026-000001</div>
                    <div className="text-slate-500">Patient: Arjun Verma (MGH-2025-000001) &middot; Dr. Sarah Jenkins</div>
                    <div className="text-teal-600 font-medium mt-1">Items: Atorvastatin 20mg (30 tab), Metoprolol ER 50mg (30 tab)</div>
                  </div>
                  <Button variant="primary" size="sm" onClick={() => router.push('/dashboard/pharmacy')}>
                    Review Dispense Plan &rarr;
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* ========================================================================= */}
        {/* 7. LAB TECHNICIAN WORKSPACE */}
        {/* ========================================================================= */}
        {activeWorkspaceRole === UserRole.LAB_TECHNICIAN && (
          <div className="space-y-6">
            <PageHeader
              title="Diagnostic Pathology Laboratory"
              description="Specimen accession, biochemical test processing, result entry & critical value flags"
              badge={<Badge variant="purple">Pathology Laboratory</Badge>}
              actions={
                <Button variant="primary" size="sm" leftIcon={<FlaskConical className="w-4 h-4" />} onClick={() => router.push('/dashboard/laboratory')}>
                  Open Lab Worklist
                </Button>
              }
            />

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <StatCard
                title="Orders in Worklist"
                value="3 Orders"
                subtitle="Lipid Panel, CBC & Renal Profile"
                icon={<FlaskConical className="w-5 h-5 text-purple-600" />}
              />
              <StatCard
                title="Specimens Collected"
                value="2 Collected"
                subtitle="Barcodes assigned & scanned"
                icon={<CheckCircle2 className="w-5 h-5 text-teal-600" />}
              />
              <StatCard
                title="Results Entered"
                value="1 Ready"
                subtitle="Awaiting pathologist sign-off"
                icon={<CheckSquare className="w-5 h-5 text-blue-600" />}
              />
              <StatCard
                title="Panic / Critical Alerts"
                value="0 Critical"
                subtitle="No panic values in current batch"
                icon={<ShieldCheck className="w-5 h-5 text-emerald-600" />}
              />
            </div>

            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Lab Processing Queue</CardTitle>
                <CardDescription>Specimen processing and result recording</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 pt-0 text-xs">
                <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/40 flex items-center justify-between">
                  <div>
                    <div className="font-bold text-sm text-slate-900 dark:text-white font-mono">LAB-2026-000101 &middot; Lipid Profile</div>
                    <div className="text-slate-500">Arjun Verma &middot; Specimen: Venous Blood &middot; Dr. Sarah Jenkins</div>
                    <div className="text-amber-600 font-medium mt-0.5">Status: Results Entered &middot; High LDL recorded</div>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => router.push('/dashboard/laboratory')}>
                    Review & Certify
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* ========================================================================= */}
        {/* 8. ACCOUNTANT WORKSPACE */}
        {/* ========================================================================= */}
        {activeWorkspaceRole === UserRole.ACCOUNTANT && (
          <div className="space-y-6">
            <PageHeader
              title="Finance & Cashier Desk"
              description="Patient invoice settlements, cashier reconciliation, GST computing & insurance claims"
              badge={<Badge variant="warning">Cashier Desk 1 Active</Badge>}
              actions={
                <Button variant="primary" size="sm" leftIcon={<Receipt className="w-4 h-4" />} onClick={() => router.push('/dashboard/billing')}>
                  Process Payment
                </Button>
              }
            />

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <StatCard
                title="Today's Receipts"
                value="₹1,24,500"
                subtitle="Cash, UPI & Card collections"
                icon={<CreditCard className="w-5 h-5 text-emerald-600" />}
              />
              <StatCard
                title="Pending Invoices"
                value="2 Invoices"
                subtitle="Balance due: ₹3,450"
                icon={<Receipt className="w-5 h-5 text-amber-600" />}
              />
              <StatCard
                title="Insurance Pre-Auth"
                value="₹45,000"
                subtitle="Star Health TPA pre-approved"
                icon={<Building2 className="w-5 h-5 text-blue-600" />}
              />
              <StatCard
                title="Collection Efficiency"
                value="96.2%"
                subtitle="Fiscal month to date"
                icon={<TrendingUp className="w-5 h-5 text-teal-600" />}
              />
            </div>

            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Invoices Awaiting Settlement</CardTitle>
                <CardDescription>Open patient bills with pending balances</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 pt-0 text-xs">
                <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/40 flex items-center justify-between">
                  <div>
                    <div className="font-bold text-sm text-slate-900 dark:text-white font-mono">INV-2026-000412 &middot; Arjun Verma</div>
                    <div className="text-slate-500">Consultation ($750) + Lipid Test ($900) &middot; Subtotal: $1,650</div>
                    <div className="text-amber-600 font-medium mt-0.5">Balance Due: $1,650 &middot; Payment Integration Pending</div>
                  </div>
                  <Button variant="primary" size="sm" onClick={() => router.push('/dashboard/billing')}>
                    Open Cashier Desk &rarr;
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* ========================================================================= */}
        {/* 9. PATIENT PORTAL WORKSPACE */}
        {/* ========================================================================= */}
        {activeWorkspaceRole === UserRole.PATIENT && (
          <div className="space-y-6">
            <PageHeader
              title={`Patient Health Portal`}
              description="Manage outpatient visits, review doctor prescriptions, view diagnostic lab results, and settle invoices"
              badge={<Badge variant="info">Patient Portal</Badge>}
              actions={
                <Button variant="primary" size="sm" leftIcon={<Calendar className="w-4 h-4" />} onClick={() => router.push('/dashboard/appointments/new')}>
                  Book Consultation
                </Button>
              }
            />

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <StatCard
                title="Next Appointment"
                value="Tomorrow, 10:00 AM"
                subtitle="Dr. Sarah Jenkins (Cardiology)"
                icon={<Calendar className="w-5 h-5 text-teal-600" />}
                onClick={() => router.push('/dashboard/appointments')}
              />
              <StatCard
                title="Active Prescriptions"
                value="1 Active Rx"
                subtitle="Atorvastatin 20mg · 30 Days"
                icon={<Pill className="w-5 h-5 text-indigo-600" />}
                onClick={() => router.push('/dashboard/prescriptions')}
              />
              <StatCard
                title="Diagnostic Lab Reports"
                value="2 Verified"
                subtitle="Lipid Panel & CBC Ready"
                icon={<FlaskConical className="w-5 h-5 text-purple-600" />}
                onClick={() => router.push('/dashboard/laboratory')}
              />
              <StatCard
                title="Outstanding Balance"
                value="$120.00"
                subtitle="1 invoice pending payment"
                icon={<Receipt className="w-5 h-5 text-amber-600" />}
                onClick={() => router.push('/dashboard/billing')}
              />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card>
                <CardHeader className="flex items-center justify-between border-b pb-4">
                  <div>
                    <CardTitle className="text-base flex items-center gap-2">
                      <Calendar className="w-4 h-4 text-teal-600" />
                      My Scheduled Appointments
                    </CardTitle>
                    <CardDescription>Upcoming outpatient visits and consultation slots</CardDescription>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => router.push('/dashboard/appointments')}>
                    View All
                  </Button>
                </CardHeader>
                <CardContent className="p-4 space-y-3">
                  <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/50 flex items-center justify-between">
                    <div>
                      <div className="font-semibold text-slate-900 dark:text-white">Dr. Sarah Jenkins</div>
                      <div className="text-xs text-slate-500">Cardiology · OPD Room 204</div>
                      <div className="text-xs font-medium text-teal-600 mt-1">Tomorrow · 10:00 AM - 10:15 AM</div>
                    </div>
                    <Badge variant="info">CONFIRMED</Badge>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex items-center justify-between border-b pb-4">
                  <div>
                    <CardTitle className="text-base flex items-center gap-2">
                      <Pill className="w-4 h-4 text-indigo-600" />
                      My Digital Prescriptions
                    </CardTitle>
                    <CardDescription>Official doctor prescriptions with secure dosage instructions</CardDescription>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => router.push('/dashboard/prescriptions')}>
                    View All
                  </Button>
                </CardHeader>
                <CardContent className="p-4 space-y-3">
                  <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/50 flex items-center justify-between">
                    <div>
                      <div className="font-semibold text-slate-900 dark:text-white font-mono text-sm">RX-2026-000001</div>
                      <div className="text-xs text-slate-500">Dr. Sarah Jenkins · Atorvastatin 20mg (1-0-0)</div>
                      <div className="text-[11px] text-slate-400 mt-0.5">Dispensed & Verified by Central Pharmacy</div>
                    </div>
                    <Button variant="outline" size="sm" leftIcon={<Download className="w-3.5 h-3.5" />} onClick={() => router.push('/dashboard/prescriptions')}>
                      View Rx
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
