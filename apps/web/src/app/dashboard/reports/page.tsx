'use client';

import React, { useState } from 'react';
import { AppShell } from '../../../components/layout/AppShell';
import { PageHeader } from '../../../components/layout/PageHeader';
import { StatCard } from '../../../components/ui/StatCard';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../../../components/ui/Card';
import { Badge } from '../../../components/ui/Badge';
import { Tabs } from '../../../components/ui/Tabs';
import { Select } from '../../../components/ui/Select';
import { Button } from '../../../components/ui/Button';
import {
  BarChart3,
  Calendar,
  Users,
  Pill,
  CreditCard,
  Building2,
  Download,
  CheckCircle2,
  Clock,
  Activity,
  Receipt,
  FileSpreadsheet,
  AlertTriangle,
  TrendingUp,
} from 'lucide-react';

export default function ReportsPage() {
  const [activeTab, setActiveTab] = useState('operational');
  const [dateRange, setDateRange] = useState('THIS_MONTH');
  const [departmentFilter, setDepartmentFilter] = useState('ALL');
  const [doctorFilter, setDoctorFilter] = useState('ALL');

  const tabs = [
    { id: 'operational', label: 'Operational & Census' },
    { id: 'departments', label: 'Department Utilization' },
    { id: 'pharmacy', label: 'Pharmacy & Stock Audits' },
    { id: 'billing', label: 'Financial & Collections' },
  ];

  const handleExportPdf = () => {
    alert('Generating authentic MedCore Executive Analytics Report (PDF)...');
  };

  const handleExportCsv = () => {
    alert('Exporting sanitized tabular ledger data (CSV)...');
  };

  return (
    <AppShell>
      <div className="space-y-6">
        <PageHeader
          breadcrumbs={[{ label: 'Reports & Analytics', href: '/dashboard/reports' }]}
          title="Hospital Operational & Clinical Analytics"
          description="Executive census summaries, doctor utilization rates, FEFO pharmacy compliance, and billing realization"
          actions={
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                leftIcon={<FileSpreadsheet className="w-4 h-4 text-emerald-600" />}
                onClick={handleExportCsv}
              >
                Export CSV
              </Button>
              <Button
                variant="primary"
                size="sm"
                leftIcon={<Download className="w-4 h-4" />}
                onClick={handleExportPdf}
              >
                Download PDF Report
              </Button>
            </div>
          }
        />

        {/* Filters Bar */}
        <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="w-44">
              <Select
                value={dateRange}
                onChange={(e) => setDateRange(e.target.value)}
                options={[
                  { value: 'TODAY', label: "Today's Census" },
                  { value: 'LAST_7_DAYS', label: 'Last 7 Days' },
                  { value: 'THIS_MONTH', label: 'This Month (Current MTD)' },
                  { value: 'QUARTER', label: 'This Quarter (Q3)' },
                  { value: 'YEAR_TO_DATE', label: 'Fiscal Year (YTD)' },
                ]}
              />
            </div>
            <div className="w-48">
              <Select
                value={departmentFilter}
                onChange={(e) => setDepartmentFilter(e.target.value)}
                options={[
                  { value: 'ALL', label: 'All Hospital Departments' },
                  { value: 'CARDIO', label: 'Cardiology' },
                  { value: 'GEN_MED', label: 'General Medicine' },
                  { value: 'ORTHO', label: 'Orthopedics' },
                  { value: 'PEDIATRICS', label: 'Pediatrics' },
                ]}
              />
            </div>
            <div className="w-48">
              <Select
                value={doctorFilter}
                onChange={(e) => setDoctorFilter(e.target.value)}
                options={[
                  { value: 'ALL', label: 'All Attending Clinicians' },
                  { value: 'DR_JENKINS', label: 'Dr. Sarah Jenkins' },
                  { value: 'DR_SHARMA', label: 'Dr. Arvind Sharma' },
                  { value: 'DR_PENDELTON', label: 'Dr. Arthur Pendelton' },
                ]}
              />
            </div>
          </div>

          <div className="flex items-center gap-2 text-xs text-slate-500">
            <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" />
            <span>Facility Scope: Metro General Hospital</span>
          </div>
        </div>

        <Tabs tabs={tabs} activeTab={activeTab} onChange={setActiveTab} />

        {/* TAB 1: OPERATIONAL & CENSUS */}
        {activeTab === 'operational' && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <StatCard
                title="Total Consultations"
                value="540 OPD Visits"
                subtitle="492 completed, 48 cancelled"
                icon={<Users className="w-5 h-5 text-teal-600" />}
                trend={{ label: '+12% vs last month', positive: true }}
              />
              <StatCard
                title="Doctor Utilization"
                value="88.2%"
                subtitle="Booked OPD slot efficiency"
                icon={<Activity className="w-5 h-5 text-blue-600" />}
                trend={{ label: 'Optimal', positive: true }}
              />
              <StatCard
                title="Average OPD Wait Time"
                value="16.5 Mins"
                subtitle="Check-in to doctor desk"
                icon={<Clock className="w-5 h-5 text-indigo-600" />}
                trend={{ label: '-3 mins faster', positive: true }}
              />
              <StatCard
                title="Bed Occupancy Rate"
                value="78.4%"
                subtitle="274 of 350 beds occupied"
                icon={<Building2 className="w-5 h-5 text-purple-600" />}
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Patient Volume by Hour of Day</CardTitle>
                  <CardDescription>Peak outpatient arrival distribution across morning & afternoon sessions</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3 pt-0 text-xs">
                  <div className="space-y-1">
                    <div className="flex justify-between font-semibold">
                      <span>09:00 AM - 11:00 AM (Peak Morning OPD)</span>
                      <span className="font-bold text-teal-600">42% (227 patients)</span>
                    </div>
                    <div className="w-full h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                      <div className="h-full bg-teal-600 w-[42%]" />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <div className="flex justify-between font-semibold">
                      <span>11:00 AM - 01:00 PM (Late Morning)</span>
                      <span className="font-bold text-blue-600">33% (178 patients)</span>
                    </div>
                    <div className="w-full h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                      <div className="h-full bg-blue-600 w-[33%]" />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <div className="flex justify-between font-semibold">
                      <span>02:00 PM - 05:00 PM (Afternoon Clinic)</span>
                      <span className="font-bold text-indigo-600">25% (135 patients)</span>
                    </div>
                    <div className="w-full h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                      <div className="h-full bg-indigo-600 w-[25%]" />
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Appointment Status Breakdown</CardTitle>
                  <CardDescription>Clinical disposition of outpatient appointments</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3 pt-0 text-xs">
                  <div className="flex items-center justify-between p-3 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800">
                    <span className="font-semibold text-emerald-800 dark:text-emerald-200">Completed Encounters</span>
                    <span className="font-mono font-bold text-emerald-700 dark:text-emerald-300">492 (91.1%)</span>
                  </div>
                  <div className="flex items-center justify-between p-3 rounded-lg bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800">
                    <span className="font-semibold text-blue-800 dark:text-blue-200">Follow-up Consultations Scheduled</span>
                    <span className="font-mono font-bold text-blue-700 dark:text-blue-300">184 (34.0%)</span>
                  </div>
                  <div className="flex items-center justify-between p-3 rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800">
                    <span className="font-semibold text-rose-800 dark:text-rose-200">Patient Cancellations & No-Shows</span>
                    <span className="font-mono font-bold text-rose-700 dark:text-rose-300">48 (8.9%)</span>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        )}

        {/* TAB 2: DEPARTMENT UTILIZATION */}
        {activeTab === 'departments' && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Departmental Consultation Distribution</CardTitle>
                  <CardDescription>Breakdown of outpatient patient volume across clinical units</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3 pt-0 text-xs">
                  <div className="space-y-1.5">
                    <div className="flex justify-between">
                      <span className="font-semibold">Cardiology</span>
                      <span className="font-bold">36.1% (195 visits)</span>
                    </div>
                    <div className="w-full h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                      <div className="h-full bg-teal-600 w-[36%]" />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <div className="flex justify-between">
                      <span className="font-semibold">General Medicine</span>
                      <span className="font-bold">30.0% (162 visits)</span>
                    </div>
                    <div className="w-full h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                      <div className="h-full bg-blue-600 w-[30%]" />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <div className="flex justify-between">
                      <span className="font-semibold">Orthopedics</span>
                      <span className="font-bold">18.1% (98 visits)</span>
                    </div>
                    <div className="w-full h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                      <div className="h-full bg-indigo-600 w-[18%]" />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <div className="flex justify-between">
                      <span className="font-semibold">Pediatrics</span>
                      <span className="font-bold">15.8% (85 visits)</span>
                    </div>
                    <div className="w-full h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                      <div className="h-full bg-purple-600 w-[15%]" />
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Clinical Productivity & Average Slot Duration</CardTitle>
                  <CardDescription>Adherence to institutional DoctorAvailability slot limits</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3 pt-0 text-xs">
                  <div className="flex justify-between p-3 rounded-lg border border-slate-200 dark:border-slate-800">
                    <div>
                      <div className="font-semibold">Cardiology OPD</div>
                      <div className="text-slate-500">Dr. Sarah Jenkins & Dr. Arvind Sharma</div>
                    </div>
                    <div className="text-right">
                      <div className="font-bold text-teal-600">14.8 mins / slot</div>
                      <div className="text-[10px] text-slate-400">Target: 15 mins</div>
                    </div>
                  </div>
                  <div className="flex justify-between p-3 rounded-lg border border-slate-200 dark:border-slate-800">
                    <div>
                      <div className="font-semibold">General Medicine OPD</div>
                      <div className="text-slate-500">Dr. Arthur Pendelton</div>
                    </div>
                    <div className="text-right">
                      <div className="font-bold text-blue-600">19.2 mins / slot</div>
                      <div className="text-[10px] text-slate-400">Target: 20 mins</div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        )}

        {/* TAB 3: PHARMACY & STOCK AUDITS */}
        {activeTab === 'pharmacy' && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <StatCard
                title="Total Stock Units"
                value="8,450 Units"
                subtitle="Dual-state inventory ledger verified"
                icon={<Pill className="w-5 h-5 text-teal-600" />}
              />
              <StatCard
                title="FEFO Compliance"
                value="99.8%"
                subtitle="Earliest expiry allocated first"
                icon={<CheckCircle2 className="w-5 h-5 text-emerald-600" />}
                trend={{ label: 'Zero expired dispensed', positive: true }}
              />
              <StatCard
                title="Low Stock Medicines"
                value="2 Formulary Items"
                subtitle="At or below hospital reorderLevel"
                icon={<AlertTriangle className="w-5 h-5 text-amber-600" />}
              />
              <StatCard
                title="Near-Expiry Batches"
                value="3 Batches"
                subtitle="Expiring within 30-60 days"
                icon={<Clock className="w-5 h-5 text-rose-600" />}
              />
            </div>

            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Batch Expiry Brackets Audit</CardTitle>
                <CardDescription>Authoritative physical batch distribution by expiration timeline</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 pt-0 text-xs">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="p-4 rounded-xl border border-rose-200 dark:border-rose-900 bg-rose-50/40 dark:bg-rose-950/20">
                    <div className="font-semibold text-rose-800 dark:text-rose-300">Expiring &lt; 30 Days</div>
                    <div className="text-xl font-bold font-mono text-rose-700 dark:text-rose-200 mt-1">1 Batch</div>
                    <div className="text-[11px] text-rose-600 dark:text-rose-400 mt-0.5">Amoxicillin 500mg (Batch EXP-AMX-2025)</div>
                  </div>
                  <div className="p-4 rounded-xl border border-amber-200 dark:border-amber-900 bg-amber-50/40 dark:bg-amber-950/20">
                    <div className="font-semibold text-amber-800 dark:text-amber-300">Expiring 30 - 60 Days</div>
                    <div className="text-xl font-bold font-mono text-amber-700 dark:text-amber-200 mt-1">2 Batches</div>
                    <div className="text-[11px] text-amber-600 dark:text-amber-400 mt-0.5">Ciprofloxacin 500mg, Paracetamol 650mg</div>
                  </div>
                  <div className="p-4 rounded-xl border border-emerald-200 dark:border-emerald-900 bg-emerald-50/40 dark:bg-emerald-950/20">
                    <div className="font-semibold text-emerald-800 dark:text-emerald-300">Active &gt; 90 Days</div>
                    <div className="text-xl font-bold font-mono text-emerald-700 dark:text-emerald-200 mt-1">43 Batches</div>
                    <div className="text-[11px] text-emerald-600 dark:text-emerald-400 mt-0.5">Full commercial formulary stock</div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* TAB 4: BILLING & COLLECTIONS */}
        {activeTab === 'billing' && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <StatCard
                title="Gross Billed Amount"
                value="₹4,82,650"
                subtitle="Consolidated outpatient & lab care"
                icon={<Receipt className="w-5 h-5 text-blue-600" />}
              />
              <StatCard
                title="Realized Collections"
                value="₹4,12,500"
                subtitle="Cash, POS, UPI & Insurance"
                icon={<CreditCard className="w-5 h-5 text-emerald-600" />}
              />
              <StatCard
                title="Outstanding Balance"
                value="₹70,150"
                subtitle="Active invoices pending settlement"
                icon={<Clock className="w-5 h-5 text-amber-600" />}
              />
              <StatCard
                title="Collection Efficiency"
                value="85.5%"
                subtitle="Collection to billing ratio"
                icon={<TrendingUp className="w-5 h-5 text-teal-600" />}
              />
            </div>

            <div className="p-4 rounded-xl border border-amber-200 dark:border-amber-900 bg-amber-50/60 dark:bg-amber-950/30 text-xs text-amber-900 dark:text-amber-200 flex items-center justify-between">
              <div>
                <strong>Payment Integration Pending Notice:</strong> Financial metrics reflect consolidated adapter calculations. Final bank and TPA merchant settlement APIs will activate upon Phase 8 deployment.
              </div>
              <Badge variant="warning">Adapter Mode</Badge>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
