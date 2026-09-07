'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AppShell } from '../../../components/layout/AppShell';
import { PageHeader } from '../../../components/layout/PageHeader';
import { DataTable, Column } from '../../../components/ui/DataTable';
import { Button } from '../../../components/ui/Button';
import { Badge } from '../../../components/ui/Badge';
import { Calendar, Plus, Clock, User, Stethoscope, ArrowRight, Eye } from 'lucide-react';
import { appointmentsService, AppointmentRecord } from '../../../lib/api/appointments.service';
import { AppointmentStatus } from '@medcore/types';

export default function AppointmentsListPage() {
  const router = useRouter();
  const [appointments, setAppointments] = useState<AppointmentRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>('ALL');

  useEffect(() => {
    async function loadAppointments() {
      try {
        const res = await appointmentsService.list();
        setAppointments(res.items);
      } finally {
        setIsLoading(false);
      }
    }
    loadAppointments();
  }, []);

  const getStatusBadge = (status: AppointmentStatus) => {
    switch (status) {
      case AppointmentStatus.CONFIRMED:
        return <Badge variant="success" dot>Confirmed</Badge>;
      case AppointmentStatus.IN_PROGRESS:
        return <Badge variant="warning" dot>In Progress</Badge>;
      case AppointmentStatus.COMPLETED:
        return <Badge variant="neutral" dot>Completed</Badge>;
      case AppointmentStatus.CANCELLED:
        return <Badge variant="danger" dot>Cancelled</Badge>;
      case AppointmentStatus.PENDING:
      default:
        return <Badge variant="info" dot>Pending</Badge>;
    }
  };

  const filteredData = statusFilter === 'ALL'
    ? appointments
    : appointments.filter((a) => a.status === statusFilter);

  const columns: Column<AppointmentRecord>[] = [
    {
      header: 'Time & Date',
      accessorKey: 'startTime',
      sortable: true,
      cell: (row) => (
        <div>
          <div className="font-semibold text-slate-900 dark:text-white flex items-center gap-1.5 font-mono">
            <Clock className="w-3.5 h-3.5 text-teal-600" />
            {row.startTime} - {row.endTime}
          </div>
          <div className="text-xs text-slate-500 dark:text-slate-400">
            {row.appointmentDate}
          </div>
        </div>
      ),
    },
    {
      header: 'Patient Details',
      cell: (row) => (
        <div>
          <div className="font-semibold text-slate-900 dark:text-white flex items-center gap-1.5">
            <span>{row.patient?.firstName} {row.patient?.lastName}</span>
          </div>
          <div className="text-xs font-mono text-teal-700 dark:text-teal-400">
            {row.patient?.uhid}
          </div>
        </div>
      ),
    },
    {
      header: 'Consulting Doctor',
      cell: (row) => (
        <div>
          <div className="font-medium text-slate-800 dark:text-slate-200">
            Dr. {row.doctor?.user.firstName} {row.doctor?.user.lastName}
          </div>
          <div className="text-xs text-slate-500 dark:text-slate-400">
            {row.doctor?.specialization}
          </div>
        </div>
      ),
    },
    {
      header: 'Type',
      accessorKey: 'type',
      cell: (row) => (
        <span className="text-xs px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 font-medium">
          {row.type}
        </span>
      ),
    },
    {
      header: 'Status',
      accessorKey: 'status',
      cell: (row) => getStatusBadge(row.status),
    },
    {
      header: 'Actions',
      align: 'right',
      cell: (row) => (
        <div className="flex items-center justify-end gap-1.5" onClick={(e) => e.stopPropagation()}>
          {row.status === AppointmentStatus.IN_PROGRESS ? (
            <Button
              variant="clinical"
              size="sm"
              leftIcon={<Stethoscope className="w-3.5 h-3.5" />}
              onClick={() => router.push('/dashboard/clinical')}
            >
              Resume EMR
            </Button>
          ) : (
            <Button
              variant="outline"
              size="sm"
              leftIcon={<Eye className="w-3.5 h-3.5" />}
              onClick={() => router.push(`/dashboard/appointments/detail?id=${row.id}`)}
            >
              Manage
            </Button>
          )}
        </div>
      ),
    },
  ];

  return (
    <AppShell>
      <PageHeader
        breadcrumbs={[{ label: 'Appointments', href: '/dashboard/appointments' }]}
        title="Outpatient (OPD) Consultation Schedule"
        description="Daily appointment calendar, patient check-in queue, and clinical encounter routing"
        actions={
          <Button
            variant="primary"
            leftIcon={<Plus className="w-4 h-4" />}
            onClick={() => router.push('/dashboard/appointments/new')}
          >
            Book New Appointment
          </Button>
        }
      />

      <DataTable
        data={filteredData}
        columns={columns}
        keyExtractor={(a) => a.id}
        searchPlaceholder="Filter appointments by patient, doctor, or UHID..."
        isLoading={isLoading}
        onRowClick={(a) => router.push(`/dashboard/appointments/detail?id=${a.id}`)}
        emptyTitle="No appointments scheduled"
        emptyDescription="Schedule a consultation with an active doctor."
        emptyAction={
          <Button
            variant="primary"
            size="sm"
            leftIcon={<Plus className="w-4 h-4" />}
            onClick={() => router.push('/dashboard/appointments/new')}
          >
            Book Appointment
          </Button>
        }
        filters={
          <div className="flex items-center gap-1.5 bg-slate-100 dark:bg-slate-800 p-1 rounded-lg text-xs">
            {['ALL', 'CONFIRMED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'].map((st) => (
              <button
                key={st}
                onClick={() => setStatusFilter(st)}
                className={`px-2.5 py-1 rounded-md font-medium transition ${
                  statusFilter === st
                    ? 'bg-white dark:bg-slate-900 text-teal-600 dark:text-teal-400 shadow-2xs font-semibold'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                }`}
              >
                {st.replace('_', ' ')}
              </button>
            ))}
          </div>
        }
      />
    </AppShell>
  );
}
