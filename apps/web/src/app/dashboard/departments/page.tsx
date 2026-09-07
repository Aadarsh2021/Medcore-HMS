'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AppShell } from '../../../components/layout/AppShell';
import { PageHeader } from '../../../components/layout/PageHeader';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../../../components/ui/Card';
import { Badge } from '../../../components/ui/Badge';
import { Button } from '../../../components/ui/Button';
import { Building2, Users, Calendar, Stethoscope, ArrowRight } from 'lucide-react';
import { departmentsService, DepartmentRecord } from '../../../lib/api/departments.service';

export default function DepartmentsPage() {
  const router = useRouter();
  const [departments, setDepartments] = useState<DepartmentRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const depts = await departmentsService.list();
        setDepartments(depts);
      } finally {
        setIsLoading(false);
      }
    }
    load();
  }, []);

  return (
    <AppShell>
      <PageHeader
        breadcrumbs={[{ label: 'Departments', href: '/dashboard/departments' }]}
        title="Clinical & Administrative Departments"
        description="Master organizational units, clinical department heads, and operational workload"
      />

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {departments.map((dept) => (
          <Card key={dept.id} className="hover:shadow-md transition">
            <CardHeader>
              <div className="flex items-center justify-between">
                <span className="font-mono text-xs font-bold px-2 py-0.5 rounded bg-teal-50 dark:bg-teal-950 text-teal-700 dark:text-teal-300 border border-teal-200 dark:border-teal-800">
                  {dept.code}
                </span>
                <Badge variant={dept.isActive ? 'success' : 'neutral'} dot>
                  {dept.isActive ? 'Active Unit' : 'Inactive'}
                </Badge>
              </div>
              <CardTitle className="text-base mt-2 flex items-center gap-2">
                <Building2 className="w-4 h-4 text-teal-600" />
                {dept.name}
              </CardTitle>
              <CardDescription>{dept.description}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 pt-0 text-xs">
              <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">Head of Department:</span>
                  <span className="font-semibold text-slate-800 dark:text-slate-200">
                    {dept.headDoctorName}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">Active Doctors:</span>
                  <span className="font-bold font-mono text-slate-800 dark:text-slate-200">
                    {dept.doctorCount} Specialists
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">Consultations Today:</span>
                  <span className="font-bold font-mono text-teal-600">
                    {dept.activeAppointmentsToday} Scheduled
                  </span>
                </div>
              </div>

              <Button
                variant="outline"
                size="sm"
                className="w-full"
                rightIcon={<ArrowRight className="w-3.5 h-3.5" />}
                onClick={() => router.push(`/dashboard/doctors?departmentId=${dept.id}`)}
              >
                View Department Doctors
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </AppShell>
  );
}
