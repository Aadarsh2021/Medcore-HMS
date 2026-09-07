'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AppShell } from '../../../components/layout/AppShell';
import { PageHeader } from '../../../components/layout/PageHeader';
import { DataTable, Column } from '../../../components/ui/DataTable';
import { Button } from '../../../components/ui/Button';
import { Badge } from '../../../components/ui/Badge';
import { Stethoscope, UserPlus, Calendar, Clock, Eye } from 'lucide-react';
import { doctorsService, DoctorRecord } from '../../../lib/api/doctors.service';

export default function DoctorsDirectoryPage() {
  const router = useRouter();
  const [doctors, setDoctors] = useState<DoctorRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function loadDoctors() {
      try {
        const docs = await doctorsService.list();
        setDoctors(docs);
      } finally {
        setIsLoading(false);
      }
    }
    loadDoctors();
  }, []);

  const columns: Column<DoctorRecord>[] = [
    {
      header: 'Doctor Name',
      cell: (row) => (
        <div>
          <div className="font-semibold text-slate-900 dark:text-white">
            Dr. {row.user.firstName} {row.user.lastName}
          </div>
          <div className="text-xs text-slate-500 font-mono">
            Lic: {row.licenseNumber}
          </div>
        </div>
      ),
    },
    {
      header: 'Specialization & Department',
      cell: (row) => (
        <div>
          <div className="font-medium text-slate-800 dark:text-slate-200">
            {row.specialization}
          </div>
          <div className="text-xs text-slate-500">
            Dept: {row.department?.name || 'General'}
          </div>
        </div>
      ),
    },
    {
      header: 'Consultation Fee',
      accessorKey: 'consultationFee',
      sortable: true,
      cell: (row) => (
        <span className="font-semibold text-teal-600 dark:text-teal-400 font-mono">
          ₹{row.consultationFee}
        </span>
      ),
    },
    {
      header: 'OPD Schedule',
      cell: (row) => {
        const activeDays = row.availability?.filter((a) => a.isActive).length || 0;
        return (
          <span className="text-xs font-medium text-slate-600 dark:text-slate-300">
            {activeDays} days / week
          </span>
        );
      },
    },
    {
      header: 'Status',
      cell: (row) => (
        <Badge variant={row.isAvailable ? 'success' : 'neutral'} dot>
          {row.isAvailable ? 'Available' : 'On Leave'}
        </Badge>
      ),
    },
    {
      header: 'Actions',
      align: 'right',
      cell: (row) => (
        <div className="flex items-center justify-end gap-1.5" onClick={(e) => e.stopPropagation()}>
          <Button
            variant="outline"
            size="sm"
            leftIcon={<Eye className="w-3.5 h-3.5" />}
            onClick={() => router.push(`/dashboard/doctors/detail?id=${row.id}`)}
          >
            Profile & Schedule
          </Button>
          <Button
            variant="ghost"
            size="sm"
            leftIcon={<Calendar className="w-3.5 h-3.5 text-teal-600" />}
            onClick={() => router.push(`/dashboard/appointments/new?doctorId=${row.id}`)}
          >
            Book
          </Button>
        </div>
      ),
    },
  ];

  return (
    <AppShell>
      <PageHeader
        breadcrumbs={[{ label: 'Doctors', href: '/dashboard/doctors' }]}
        title="Consultant Medical Staff Directory"
        description="Licensed hospital physicians, clinical specializations, and OPD consultation schedules"
        actions={
          <Button
            variant="primary"
            leftIcon={<UserPlus className="w-4 h-4" />}
            onClick={() => router.push('/dashboard/doctors/new')}
          >
            Onboard New Doctor
          </Button>
        }
      />

      <DataTable
        data={doctors}
        columns={columns}
        keyExtractor={(d) => d.id}
        searchPlaceholder="Search doctors by name, license number, or specialization..."
        isLoading={isLoading}
        onRowClick={(d) => router.push(`/dashboard/doctors/detail?id=${d.id}`)}
        emptyTitle="No doctors found"
        emptyDescription="Onboard medical staff to begin scheduling appointments."
      />
    </AppShell>
  );
}
