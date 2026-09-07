'use client';

import React from 'react';
import { AppShell } from '../../../components/layout/AppShell';
import { PageHeader } from '../../../components/layout/PageHeader';
import { StatCard } from '../../../components/ui/StatCard';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../../../components/ui/Card';
import { Badge } from '../../../components/ui/Badge';
import {
  BarChart3,
  Calendar,
  Users,
  Pill,
  CreditCard,
  Building2,
  Download,
  CheckCircle2,
} from 'lucide-react';
import { Button } from '../../../components/ui/Button';

export default function ReportsPage() {
  return (
    <AppShell>
      <PageHeader
        breadcrumbs={[{ label: 'Reports & Analytics', href: '/dashboard/reports' }]}
        title="Hospital Operational & Clinical Reports"
        description="Authentic departmental metrics, patient intake statistics, and pharmacy dispensing audits"
        actions={
          <Button variant="outline" size="sm" leftIcon={<Download className="w-4 h-4" />}>
            Export Executive Report (PDF)
          </Button>
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Monthly OPD Census"
          value="420 Consultations"
          subtitle="Cardiology leading with 38%"
          icon={<Users className="w-5 h-5" />}
        />
        <StatCard
          title="Dispensing Accuracy"
          value="99.8%"
          subtitle="FEFO allocation compliant"
          icon={<Pill className="w-5 h-5" />}
          trend={{ label: 'Zero Errors', positive: true }}
        />
        <StatCard
          title="Revenue Realization"
          value="₹3,42,000"
          subtitle="Outpatient & Lab revenue"
          icon={<CreditCard className="w-5 h-5" />}
        />
        <StatCard
          title="Average Wait Time"
          value="18 Minutes"
          subtitle="Intake to doctor consultation"
          icon={<Calendar className="w-5 h-5" />}
          trend={{ label: 'Optimal', positive: true }}
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Departmental Consultation Distribution</CardTitle>
            <CardDescription>Breakdown of outpatient patient volume across clinical units</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 pt-0 text-xs">
            <div className="space-y-1.5">
              <div className="flex justify-between">
                <span>Cardiology</span>
                <span className="font-bold">38% (160 visits)</span>
              </div>
              <div className="w-full h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                <div className="h-full bg-teal-600 w-[38%]" />
              </div>
            </div>

            <div className="space-y-1.5">
              <div className="flex justify-between">
                <span>General Medicine</span>
                <span className="font-bold">32% (135 visits)</span>
              </div>
              <div className="w-full h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                <div className="h-full bg-blue-600 w-[32%]" />
              </div>
            </div>

            <div className="space-y-1.5">
              <div className="flex justify-between">
                <span>Orthopedics</span>
                <span className="font-bold">18% (76 visits)</span>
              </div>
              <div className="w-full h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                <div className="h-full bg-indigo-600 w-[18%]" />
              </div>
            </div>

            <div className="space-y-1.5">
              <div className="flex justify-between">
                <span>Pediatrics</span>
                <span className="font-bold">12% (49 visits)</span>
              </div>
              <div className="w-full h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                <div className="h-full bg-purple-600 w-[12%]" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Pharmacy Stock Movements & Expiry Profile</CardTitle>
            <CardDescription>Batch turnover rate and expiration risk mitigation</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 pt-0 text-xs">
            <div className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 flex justify-between">
              <div>
                <div className="font-semibold">FEFO Batch Adherence Rate</div>
                <div className="text-slate-500">100% of dispensed items pulled earliest-expiry first</div>
              </div>
              <Badge variant="success">Compliant</Badge>
            </div>

            <div className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 flex justify-between">
              <div>
                <div className="font-semibold">Batches Near Expiry (&le; 60 Days)</div>
                <div className="text-slate-500">1 active batch monitored for early dispatch</div>
              </div>
              <Badge variant="warning">Monitored</Badge>
            </div>

            <div className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 flex justify-between">
              <div>
                <div className="font-semibold">Quarantined Stock Units</div>
                <div className="text-slate-500">60 units on quality hold</div>
              </div>
              <Badge variant="danger">Isolated</Badge>
            </div>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
