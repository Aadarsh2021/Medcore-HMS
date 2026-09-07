'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AppShell } from '../../../components/layout/AppShell';
import { PageHeader } from '../../../components/layout/PageHeader';
import { DataTable, Column } from '../../../components/ui/DataTable';
import { Button } from '../../../components/ui/Button';
import { Badge } from '../../../components/ui/Badge';
import { UserPlus, User, Phone, Calendar, ArrowRight, Eye } from 'lucide-react';
import { patientsService, PatientRecord } from '../../../lib/api/patients.service';

export default function PatientsDirectoryPage() {
  const router = useRouter();
  const [patients, setPatients] = useState<PatientRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function fetchPatients() {
      try {
        const res = await patientsService.findAll();
        setPatients(res.items);
      } finally {
        setIsLoading(false);
      }
    }
    fetchPatients();
  }, []);

  const columns: Column<PatientRecord>[] = [
    {
      header: 'Patient UHID',
      accessorKey: 'uhid',
      sortable: true,
      cell: (row) => (
        <span className="font-mono text-xs font-semibold text-teal-700 dark:text-teal-400 bg-teal-50 dark:bg-teal-950/60 px-2 py-0.5 rounded border border-teal-200 dark:border-teal-800">
          {row.uhid}
        </span>
      ),
    },
    {
      header: 'Full Name',
      accessorKey: 'firstName',
      sortable: true,
      cell: (row) => (
        <div>
          <div className="font-semibold text-slate-900 dark:text-white">
            {row.firstName} {row.lastName}
          </div>
          <div className="text-xs text-slate-500 dark:text-slate-400">
            {row.email || 'No email registered'}
          </div>
        </div>
      ),
    },
    {
      header: 'Age / Gender',
      cell: (row) => {
        const birthYear = new Date(row.dateOfBirth).getFullYear();
        const age = new Date().getFullYear() - birthYear;
        return (
          <span className="text-xs">
            {age} yrs &middot; {row.gender}
          </span>
        );
      },
    },
    {
      header: 'Blood Group',
      accessorKey: 'bloodGroup',
      sortable: true,
      cell: (row) => (
        <Badge variant="purple" size="sm">
          {row.bloodGroup.replace('_', ' ')}
        </Badge>
      ),
    },
    {
      header: 'Contact Phone',
      accessorKey: 'phone',
      cell: (row) => (
        <span className="text-xs font-mono text-slate-600 dark:text-slate-300 flex items-center gap-1.5">
          <Phone className="w-3 h-3 text-slate-400" />
          {row.phone}
        </span>
      ),
    },
    {
      header: 'Registered',
      cell: (row) => (
        <span className="text-xs text-slate-500 dark:text-slate-400">
          {new Date(row.createdAt).toLocaleDateString()}
        </span>
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
            onClick={() => router.push(`/dashboard/patients/detail?id=${row.id}`)}
          >
            View 360°
          </Button>
          <Button
            variant="ghost"
            size="sm"
            leftIcon={<Calendar className="w-3.5 h-3.5 text-teal-600" />}
            onClick={() => router.push(`/dashboard/appointments/new?patientId=${row.id}`)}
            title="Book Appointment for Patient"
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
        breadcrumbs={[{ label: 'Patients', href: '/dashboard/patients' }]}
        title="Patient Master Directory"
        description="Comprehensive outpatient and inpatient registry indexed by Unique Hospital Identification (UHID)"
        actions={
          <Button
            variant="primary"
            leftIcon={<UserPlus className="w-4 h-4" />}
            onClick={() => router.push('/dashboard/patients/new')}
          >
            Register New Patient
          </Button>
        }
      />

      <DataTable
        data={patients}
        columns={columns}
        keyExtractor={(p) => p.id}
        searchPlaceholder="Search by UHID, patient name, or phone number..."
        searchableKeys={['firstName', 'lastName', 'uhid', 'phone']}
        isLoading={isLoading}
        onRowClick={(p) => router.push(`/dashboard/patients/detail?id=${p.id}`)}
        emptyTitle="No patient records found"
        emptyDescription="Start by registering a new patient with automated UHID generation."
        emptyAction={
          <Button
            variant="primary"
            size="sm"
            leftIcon={<UserPlus className="w-4 h-4" />}
            onClick={() => router.push('/dashboard/patients/new')}
          >
            Register Patient
          </Button>
        }
      />
    </AppShell>
  );
}
