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
} from 'lucide-react';
import { appointmentsService, AppointmentRecord } from '../../lib/api/appointments.service';
import { UserRole } from '@medcore/types';

export default function DashboardPage() {
  const router = useRouter();
  const { user } = useAuthStore();
  const [appointments, setAppointments] = useState<AppointmentRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);

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

  const role = user?.role || UserRole.DOCTOR;
  const isDoctor = role === UserRole.DOCTOR;
  const isNurse = role === UserRole.NURSE;
  const isPharmacist = role === UserRole.PHARMACIST;
  const isPatient = role === UserRole.PATIENT;

  // Format today's date
  const todayFormatted = new Intl.DateTimeFormat('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date());

  if (isPatient) {
    return (
      <AppShell>
        <div className="space-y-6">
          <PageHeader
            title={`Welcome, ${user?.firstName ? `${user.firstName} ${user.lastName}` : 'Patient'}`}
            description="Your personal MedCore Health Portal. Manage appointments, review doctor prescriptions, view diagnostic lab reports, and settle hospital invoices."
            badge={<Badge variant="info">Patient Portal</Badge>}
            actions={
              <Button
                variant="primary"
                size="sm"
                leftIcon={<Calendar className="w-4 h-4" />}
                onClick={() => router.push('/dashboard/appointments/new')}
              >
                Book Consultation
              </Button>
            }
          />

          {/* Patient Quick Status Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard
              title="Next Appointment"
              value="Tomorrow, 10:00 AM"
              subtitle="Dr. Sarah Jenkins (Cardiology)"
              icon={<Calendar className="w-5 h-5" />}
              onClick={() => router.push('/dashboard/appointments')}
            />
            <StatCard
              title="Active Prescriptions"
              value="1 Active Rx"
              subtitle="Atorvastatin 20mg · 30 Days"
              icon={<Pill className="w-5 h-5" />}
              onClick={() => router.push('/dashboard/prescriptions')}
            />
            <StatCard
              title="Diagnostic Lab Reports"
              value="2 Verified"
              subtitle="Lipid Panel & CBC Ready"
              icon={<FlaskConical className="w-5 h-5" />}
              onClick={() => router.push('/dashboard/laboratory')}
            />
            <StatCard
              title="Outstanding Balance"
              value="$120.00"
              subtitle="1 invoice pending payment"
              icon={<Receipt className="w-5 h-5" />}
              onClick={() => router.push('/dashboard/billing')}
            />
          </div>

          {/* Patient Workflow Cards */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Upcoming Appointments */}
            <Card>
              <CardHeader className="flex items-center justify-between border-b pb-4">
                <div>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-teal-600" />
                    My Scheduled Appointments
                  </CardTitle>
                  <CardDescription>Upcoming outpatient visits and consultation slots</CardDescription>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  rightIcon={<ArrowRight className="w-3.5 h-3.5" />}
                  onClick={() => router.push('/dashboard/appointments')}
                >
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

            {/* Active Prescriptions */}
            <Card>
              <CardHeader className="flex items-center justify-between border-b pb-4">
                <div>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Pill className="w-4 h-4 text-indigo-600" />
                    My Digital Prescriptions
                  </CardTitle>
                  <CardDescription>Official doctor prescriptions with secure dosage instructions</CardDescription>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  rightIcon={<ArrowRight className="w-3.5 h-3.5" />}
                  onClick={() => router.push('/dashboard/prescriptions')}
                >
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
                  <Button
                    variant="outline"
                    size="sm"
                    leftIcon={<Download className="w-3.5 h-3.5" />}
                    onClick={() => router.push('/dashboard/prescriptions')}
                  >
                    View Rx PDF
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Diagnostic Lab Reports */}
            <Card>
              <CardHeader className="flex items-center justify-between border-b pb-4">
                <div>
                  <CardTitle className="text-base flex items-center gap-2">
                    <FlaskConical className="w-4 h-4 text-purple-600" />
                    Verified Diagnostic Laboratory Reports
                  </CardTitle>
                  <CardDescription>Signed clinical lab findings with normal reference ranges</CardDescription>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  rightIcon={<ArrowRight className="w-3.5 h-3.5" />}
                  onClick={() => router.push('/dashboard/laboratory')}
                >
                  View All
                </Button>
              </CardHeader>
              <CardContent className="p-4 space-y-3">
                <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/50 flex items-center justify-between">
                  <div>
                    <div className="font-semibold text-slate-900 dark:text-white">Comprehensive Lipid Profile</div>
                    <div className="text-xs text-slate-500">Ordered by Dr. Sarah Jenkins · Specimen: Venous Blood</div>
                    <div className="text-xs text-emerald-600 font-medium mt-1">Verified by Pathologist · Ready</div>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => router.push('/dashboard/laboratory')}
                  >
                    View Report
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Invoices & Payments */}
            <Card>
              <CardHeader className="flex items-center justify-between border-b pb-4">
                <div>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Receipt className="w-4 h-4 text-amber-600" />
                    Hospital Invoices & Receipts
                  </CardTitle>
                  <CardDescription>Itemized billing statements, copay, and payment history</CardDescription>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  rightIcon={<ArrowRight className="w-3.5 h-3.5" />}
                  onClick={() => router.push('/dashboard/billing')}
                >
                  View All
                </Button>
              </CardHeader>
              <CardContent className="p-4 space-y-3">
                <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/50 flex items-center justify-between">
                  <div>
                    <div className="font-semibold text-slate-900 dark:text-white font-mono text-sm">INV-2026-000101</div>
                    <div className="text-xs text-slate-500">OPD Consultation · Total: $120.00 · Balance Due: $120.00</div>
                    <div className="text-[11px] text-amber-600 font-medium mt-0.5">Payment Pending</div>
                  </div>
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => router.push('/dashboard/billing')}
                  >
                    Pay Online
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      {/* Header with Greetings and Quick Actions */}
      <PageHeader
        title={`Hospital Dashboard`}
        description={`${user?.hospitalName || 'Metro General Hospital'} &middot; Operational Overview &middot; ${todayFormatted}`}
        badge={
          <span className="text-xs px-2.5 py-0.5 rounded-full font-semibold bg-teal-50 dark:bg-teal-950 text-teal-700 dark:text-teal-300 border border-teal-200 dark:border-teal-800">
            Live Clinical Ops
          </span>
        }
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              leftIcon={<UserPlus className="w-4 h-4 text-teal-600" />}
              onClick={() => router.push('/dashboard/patients/new')}
            >
              Register Patient
            </Button>
            <Button
              variant="primary"
              size="sm"
              leftIcon={<Calendar className="w-4 h-4" />}
              onClick={() => router.push('/dashboard/appointments/new')}
            >
              Book Appointment
            </Button>
          </div>
        }
      />

      {/* Operational KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Today's Appointments"
          value={appointments.length || 4}
          subtitle="4 scheduled in morning OPD"
          icon={<Calendar className="w-5 h-5" />}
          trend={{ label: '2 checked in', positive: true }}
          onClick={() => router.push('/dashboard/appointments')}
        />
        <StatCard
          title="Active Encounters"
          value="1 In Consultation"
          subtitle="Dr. Sharma &middot; Room 204"
          icon={<Stethoscope className="w-5 h-5" />}
          trend={{ label: 'Live EMR', positive: true }}
          onClick={() => router.push('/dashboard/clinical')}
        />
        <StatCard
          title="Pharmacy Dispensing"
          value="2 Pending"
          subtitle="FIFO/FEFO batch allocation"
          icon={<Pill className="w-5 h-5" />}
          trend={{ label: 'Stock Synced', positive: true }}
          onClick={() => router.push('/dashboard/pharmacy')}
        />
        <StatCard
          title="Diagnostic Lab Tests"
          value="3 Orders"
          subtitle="1 report ready for approval"
          icon={<FlaskConical className="w-5 h-5" />}
          trend={{ label: 'Urgent Lipid', positive: false }}
          onClick={() => router.push('/dashboard/laboratory')}
        />
      </div>

      {/* Main Workload & Real Queues */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column (2 Cols): OPD Queue & Timeline */}
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-teal-600" />
                  Today's Outpatient (OPD) Consultation Queue
                </CardTitle>
                <CardDescription>
                  Live patient appointments scheduled for consultation today
                </CardDescription>
              </div>
              <Button
                variant="ghost"
                size="sm"
                rightIcon={<ArrowRight className="w-3.5 h-3.5" />}
                onClick={() => router.push('/dashboard/appointments')}
              >
                View Full Calendar
              </Button>
            </CardHeader>
            <CardContent className="p-0">
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {appointments.slice(0, 4).map((apt) => (
                  <div
                    key={apt.id}
                    className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition"
                  >
                    <div className="flex items-start gap-3">
                      <div className="p-2.5 rounded-xl bg-teal-50 dark:bg-teal-950/60 text-teal-700 dark:text-teal-300 font-mono text-xs font-bold text-center shrink-0">
                        {apt.startTime}
                      </div>
                      <div>
                        <div className="font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                          <span>
                            {apt.patient?.firstName} {apt.patient?.lastName}
                          </span>
                          <span className="text-xs font-mono font-normal text-slate-500">
                            ({apt.patient?.uhid})
                          </span>
                        </div>
                        <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                          Doctor: {apt.doctor?.user.firstName} {apt.doctor?.user.lastName} ({apt.doctor?.specialization})
                        </div>
                        {apt.reason && (
                          <div className="text-xs text-slate-600 dark:text-slate-300 mt-1 italic">
                            "{apt.reason}"
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 self-end sm:self-center">
                      <Badge
                        variant={
                          apt.status === 'IN_PROGRESS'
                            ? 'warning'
                            : apt.status === 'CONFIRMED'
                            ? 'success'
                            : 'neutral'
                        }
                        dot
                      >
                        {apt.status.replace('_', ' ')}
                      </Badge>
                      {apt.status === 'IN_PROGRESS' ? (
                        <Button
                          variant="clinical"
                          size="sm"
                          onClick={() => router.push('/dashboard/clinical')}
                        >
                          Resume Encounter
                        </Button>
                      ) : (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => router.push(`/dashboard/appointments/detail?id=${apt.id}`)}
                        >
                          Details
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Clinical Activity & Alerts */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm flex items-center gap-2">
                  <Pill className="w-4 h-4 text-indigo-600" />
                  Pharmacy Dispensing Queue
                </CardTitle>
                <CardDescription>Prescriptions pending batch allocation</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 pt-0">
                <div className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 text-xs space-y-1">
                  <div className="flex items-center justify-between font-semibold">
                    <span>RX-2026-000001 (Arjun Verma)</span>
                    <Badge variant="warning">Awaiting Dispense</Badge>
                  </div>
                  <div className="text-slate-500">Atorvastatin 20mg, Metoprolol ER 50mg</div>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full"
                  onClick={() => router.push('/dashboard/pharmacy')}
                >
                  Open Dispensing Workspace
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-sm flex items-center gap-2">
                  <FlaskConical className="w-4 h-4 text-purple-600" />
                  Pathology Diagnostic Alerts
                </CardTitle>
                <CardDescription>Laboratory investigations awaiting review</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 pt-0">
                <div className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 text-xs space-y-1">
                  <div className="flex items-center justify-between font-semibold">
                    <span>LAB-2026-000101 (Arjun Verma)</span>
                    <Badge variant="danger">High Cholesterol</Badge>
                  </div>
                  <div className="text-slate-500">Total Cholesterol: 242 mg/dL (Urgent)</div>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full"
                  onClick={() => router.push('/dashboard/laboratory')}
                >
                  Review Lab Results
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Right Column (1 Col): Quick Action Launcher & Hospital Status */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Activity className="w-4 h-4 text-teal-600" />
                Primary Hospital Workflows
              </CardTitle>
              <CardDescription>Direct navigation to operational workstations</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 pt-0">
              <button
                onClick={() => router.push('/dashboard/clinical')}
                className="w-full p-3 rounded-xl border border-slate-200 dark:border-slate-800 hover:border-teal-500 dark:hover:border-teal-500 hover:bg-slate-50 dark:hover:bg-slate-800/60 transition flex items-center gap-3 text-left group"
              >
                <div className="p-2 rounded-lg bg-teal-50 dark:bg-teal-950 text-teal-600 dark:text-teal-400 group-hover:bg-teal-600 group-hover:text-white transition">
                  <Stethoscope className="w-5 h-5" />
                </div>
                <div>
                  <div className="text-xs sm:text-sm font-semibold text-slate-900 dark:text-white">
                    Start Clinical Encounter
                  </div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400">
                    Vitals, ICD-10 Diagnoses, Notes & Rx
                  </div>
                </div>
              </button>

              <button
                onClick={() => router.push('/dashboard/patients/new')}
                className="w-full p-3 rounded-xl border border-slate-200 dark:border-slate-800 hover:border-blue-500 dark:hover:border-blue-500 hover:bg-slate-50 dark:hover:bg-slate-800/60 transition flex items-center gap-3 text-left group"
              >
                <div className="p-2 rounded-lg bg-blue-50 dark:bg-blue-950 text-blue-600 dark:text-blue-400 group-hover:bg-blue-600 group-hover:text-white transition">
                  <UserPlus className="w-5 h-5" />
                </div>
                <div>
                  <div className="text-xs sm:text-sm font-semibold text-slate-900 dark:text-white">
                    Register New Patient
                  </div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400">
                    Auto-generate UHID & Demographics
                  </div>
                </div>
              </button>

              <button
                onClick={() => router.push('/dashboard/appointments/new')}
                className="w-full p-3 rounded-xl border border-slate-200 dark:border-slate-800 hover:border-teal-500 dark:hover:border-teal-500 hover:bg-slate-50 dark:hover:bg-slate-800/60 transition flex items-center gap-3 text-left group"
              >
                <div className="p-2 rounded-lg bg-emerald-50 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-400 group-hover:bg-emerald-600 group-hover:text-white transition">
                  <Calendar className="w-5 h-5" />
                </div>
                <div>
                  <div className="text-xs sm:text-sm font-semibold text-slate-900 dark:text-white">
                    Schedule Appointment
                  </div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400">
                    Doctor slot availability & booking
                  </div>
                </div>
              </button>

              <button
                onClick={() => router.push('/dashboard/pharmacy')}
                className="w-full p-3 rounded-xl border border-slate-200 dark:border-slate-800 hover:border-indigo-500 dark:hover:border-indigo-500 hover:bg-slate-50 dark:hover:bg-slate-800/60 transition flex items-center gap-3 text-left group"
              >
                <div className="p-2 rounded-lg bg-indigo-50 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-400 group-hover:bg-indigo-600 group-hover:text-white transition">
                  <Pill className="w-5 h-5" />
                </div>
                <div>
                  <div className="text-xs sm:text-sm font-semibold text-slate-900 dark:text-white">
                    Pharmacy Batch Dispense
                  </div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400">
                    Prescriptions & FEFO Stock Allocation
                  </div>
                </div>
              </button>

              <button
                onClick={() => router.push('/dashboard/billing')}
                className="w-full p-3 rounded-xl border border-slate-200 dark:border-slate-800 hover:border-amber-500 dark:hover:border-amber-500 hover:bg-slate-50 dark:hover:bg-slate-800/60 transition flex items-center gap-3 text-left group"
              >
                <div className="p-2 rounded-lg bg-amber-50 dark:bg-amber-950 text-amber-600 dark:text-amber-400 group-hover:bg-amber-600 group-hover:text-white transition">
                  <Receipt className="w-5 h-5" />
                </div>
                <div>
                  <div className="text-xs sm:text-sm font-semibold text-slate-900 dark:text-white">
                    Billing & Cashier Register
                  </div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400">
                    Itemized Consultation Invoices & Receipts
                  </div>
                </div>
              </button>
            </CardContent>
          </Card>

          {/* Hospital Occupancy & Bed Census */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm flex items-center gap-2">
                <Building2 className="w-4 h-4 text-teal-600" />
                Inpatient (IPD) Bed Census
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 pt-0">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-500">Total Operational Beds</span>
                <span className="font-semibold font-mono">50</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-500">Occupied (Admitted)</span>
                <span className="font-semibold text-teal-600 font-mono">42 (84%)</span>
              </div>
              <div className="w-full h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                <div className="h-full bg-teal-600 rounded-full w-[84%]" />
              </div>
              <div className="flex items-center justify-between text-[11px] text-slate-400 pt-1">
                <span>General Ward: 28/32</span>
                <span>ICU / CCU: 8/10</span>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </AppShell>
  );
}
