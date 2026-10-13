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
import { AppointmentStatus, UserRole } from '@medcore/types';
import { useAuthStore } from '../../../stores/authStore';
import { ApiError } from '../../../lib/api/client';
import { ErrorState } from '../../../components/ui/ErrorState';

export default function AppointmentsListPage() {
  const router = useRouter();
  const { user, isInitialized } = useAuthStore();
  const isPatient = user?.role === UserRole.PATIENT;

  const [appointments, setAppointments] = useState<AppointmentRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('ALL');

  const loadAppointments = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await appointmentsService.list();
      setAppointments(res.items);
    } catch (err: any) {
      if (err instanceof ApiError && err.isForbidden) {
        setError('Access denied: You are not authorized to view these appointments.');
      } else if (err instanceof ApiError && err.isUnauthorized) {
        setError('Your session has expired. Please log in again.');
      } else {
        setError(err.message || 'Failed to load appointment schedule.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (!isInitialized) return;
    loadAppointments();
  }, [isInitialized]);

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
        breadcrumbs={[{ label: isPatient ? 'My Appointments' : 'Appointments', href: '/dashboard/appointments' }]}
        title={isPatient ? 'My Outpatient Consultation Schedule' : 'Outpatient (OPD) Consultation Schedule'}
        description={
          isPatient
            ? 'Your upcoming doctor consultations, clinical OPD bookings, and historical appointments'
            : 'Daily appointment calendar, patient check-in queue, and clinical encounter routing'
        }
        actions={
          <Button
            variant="primary"
            leftIcon={<Plus className="w-4 h-4" />}
            onClick={() => router.push('/dashboard/appointments/new')}
          >
            {isPatient ? 'Book Doctor Appointment' : 'Book New Appointment'}
          </Button>
        }
      />

      {error ? (
        <ErrorState
          title={error.includes('Access denied') ? 'Access Restricted' : 'Unable to Load Appointments'}
          message={error}
          onRetry={loadAppointments}
        />
      ) : (
        <DataTable
          data={filteredData}
          columns={columns}
          keyExtractor={(a) => a.id}
          searchPlaceholder={isPatient ? 'Filter appointments by doctor or department...' : 'Filter appointments by patient, doctor, or UHID...'}
          isLoading={isLoading}
          onRowClick={(a) => router.push(`/dashboard/appointments/detail?id=${a.id}`)}
          emptyTitle="No appointments scheduled"
          emptyDescription={isPatient ? 'You have no scheduled doctor consultations.' : 'Schedule a consultation with an active doctor.'}
          emptyAction={
            <Button
              variant="primary"
              size="sm"
              leftIcon={<Plus className="w-4 h-4" />}
              onClick={() => router.push('/dashboard/appointments/new')}
            >
              {isPatient ? 'Book Doctor Consultation' : 'Book Appointment'}
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
      )}
    </AppShell>
  );
}
