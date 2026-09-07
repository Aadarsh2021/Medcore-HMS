'use client';

import React, { useEffect, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { AppShell } from '../../../../components/layout/AppShell';
import { PageHeader } from '../../../../components/layout/PageHeader';
import { Button } from '../../../../components/ui/Button';
import { Badge } from '../../../../components/ui/Badge';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../../../../components/ui/Card';
import { Modal } from '../../../../components/ui/Modal';
import { Textarea } from '../../../../components/ui/Textarea';
import { Skeleton } from '../../../../components/ui/Skeleton';
import {
  Calendar,
  Clock,
  User,
  Stethoscope,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Building2,
  FileText,
  ArrowRight,
} from 'lucide-react';
import { appointmentsService, AppointmentRecord } from '../../../../lib/api/appointments.service';
import { AppointmentStatus } from '@medcore/types';

function AppointmentDetailContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const id = searchParams.get('id') || 'apt-001';

  const [appointment, setAppointment] = useState<AppointmentRecord | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isCancelModalOpen, setIsCancelModalOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [isActionLoading, setIsActionLoading] = useState(false);

  useEffect(() => {
    async function loadAppointment() {
      setIsLoading(true);
      try {
        const apt = await appointmentsService.findById(id);
        setAppointment(apt);
      } finally {
        setIsLoading(false);
      }
    }
    loadAppointment();
  }, [id]);

  if (isLoading) {
    return <Skeleton className="h-64 w-full rounded-2xl" />;
  }

  if (!appointment) {
    return (
      <div className="p-12 text-center">
        <h2 className="text-base font-bold text-slate-800">Appointment Not Found</h2>
        <p className="text-xs text-slate-500 mt-1">No appointment found with identifier: {id}</p>
        <Button variant="outline" size="sm" className="mt-4" onClick={() => router.push('/dashboard/appointments')}>
          Back to Appointments
        </Button>
      </div>
    );
  }

  const handleStatusChange = async (newStatus: AppointmentStatus) => {
    setIsActionLoading(true);
    try {
      const updated = await appointmentsService.updateStatus(appointment.id, newStatus);
      setAppointment(updated);
    } catch (err: any) {
      alert(err.message || 'Failed to update appointment status.');
    } finally {
      setIsActionLoading(false);
    }
  };

  const handleCancel = async () => {
    if (!cancelReason.trim()) {
      alert('Please specify a cancellation reason.');
      return;
    }
    setIsActionLoading(true);
    try {
      const updated = await appointmentsService.cancel(appointment.id, cancelReason);
      setAppointment(updated);
      setIsCancelModalOpen(false);
    } catch (err: any) {
      alert(err.message || 'Failed to cancel appointment.');
    } finally {
      setIsActionLoading(false);
    }
  };

  const isConfirmed = appointment.status === AppointmentStatus.CONFIRMED;
  const isInProgress = appointment.status === AppointmentStatus.IN_PROGRESS;
  const isCompleted = appointment.status === AppointmentStatus.COMPLETED;
  const isCancelled = appointment.status === AppointmentStatus.CANCELLED;

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <PageHeader
        breadcrumbs={[
          { label: 'Appointments', href: '/dashboard/appointments' },
          { label: `Consultation on ${appointment.appointmentDate}` },
        ]}
        title="Consultation Details & Operational Control"
        description={`Scheduled with Dr. ${appointment.doctor?.user.firstName} ${appointment.doctor?.user.lastName} (${appointment.doctor?.specialization})`}
        actions={
          <div className="flex items-center gap-2">
            {!isCompleted && !isCancelled && (
              <>
                {!isInProgress && (
                  <Button
                    variant="clinical"
                    size="sm"
                    leftIcon={<Stethoscope className="w-4 h-4" />}
                    onClick={() => router.push('/dashboard/clinical')}
                  >
                    Start Clinical Encounter
                  </Button>
                )}
                {isConfirmed && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleStatusChange(AppointmentStatus.IN_PROGRESS)}
                  >
                    Mark Checked-In
                  </Button>
                )}
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => setIsCancelModalOpen(true)}
                >
                  Cancel
                </Button>
              </>
            )}
          </div>
        }
      />

      {/* Appointment Information Card */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-2 space-y-6">
          <Card>
            <CardHeader className="flex items-center justify-between">
              <div>
                <CardTitle className="text-sm">Consultation Information</CardTitle>
                <CardDescription>Scheduled timing and clinical complaint</CardDescription>
              </div>
              <Badge
                variant={
                  isCompleted
                    ? 'neutral'
                    : isInProgress
                    ? 'warning'
                    : isConfirmed
                    ? 'success'
                    : isCancelled
                    ? 'danger'
                    : 'info'
                }
                dot
              >
                {appointment.status.replace('_', ' ')}
              </Badge>
            </CardHeader>
            <CardContent className="space-y-4 text-xs sm:text-sm">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                <div>
                  <span className="text-slate-500">Date:</span>
                  <div className="font-semibold flex items-center gap-1 mt-0.5">
                    <Calendar className="w-3.5 h-3.5 text-teal-600" />
                    {appointment.appointmentDate}
                  </div>
                </div>
                <div>
                  <span className="text-slate-500">Time Slot:</span>
                  <div className="font-semibold font-mono flex items-center gap-1 mt-0.5">
                    <Clock className="w-3.5 h-3.5 text-teal-600" />
                    {appointment.startTime} - {appointment.endTime}
                  </div>
                </div>
                <div>
                  <span className="text-slate-500">Consultation Type:</span>
                  <div className="font-semibold mt-0.5">{appointment.type}</div>
                </div>
              </div>

              <div className="pt-3 border-t border-slate-100 dark:border-slate-800">
                <span className="text-slate-500">Presenting Complaint / Reason:</span>
                <div className="font-medium text-slate-800 dark:text-slate-200 mt-1 p-3 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800">
                  {appointment.reason || 'No clinical complaint specified at booking.'}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Lifecycle Status Progression Timeline */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Consultation Lifecycle Progression</CardTitle>
            </CardHeader>
            <CardContent className="pt-2">
              <div className="flex items-center justify-between relative">
                <div className="absolute top-1/2 left-0 right-0 h-0.5 bg-slate-200 dark:bg-slate-800 -translate-y-1/2 -z-0" />
                {[
                  { label: 'Booked', active: true },
                  { label: 'Confirmed', active: isConfirmed || isInProgress || isCompleted },
                  { label: 'In Consultation', active: isInProgress || isCompleted },
                  { label: 'Completed', active: isCompleted },
                ].map((step, idx) => (
                  <div key={idx} className="relative z-10 flex flex-col items-center bg-white dark:bg-slate-900 px-2">
                    <div
                      className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${
                        step.active
                          ? 'bg-teal-600 text-white shadow-sm ring-4 ring-teal-50 dark:ring-teal-950'
                          : 'bg-slate-200 dark:bg-slate-800 text-slate-400'
                      }`}
                    >
                      {idx + 1}
                    </div>
                    <span className={`text-[11px] font-medium mt-1.5 ${step.active ? 'text-teal-700 dark:text-teal-300 font-semibold' : 'text-slate-400'}`}>
                      {step.label}
                    </span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right Column: Patient & Doctor Cards */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm flex items-center gap-2">
                <User className="w-4 h-4 text-teal-600" />
                Patient Details
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-xs">
              <div>
                <div className="font-semibold text-slate-900 dark:text-white text-sm">
                  {appointment.patient?.firstName} {appointment.patient?.lastName}
                </div>
                <div className="font-mono text-teal-600 dark:text-teal-400 font-semibold mt-0.5">
                  {appointment.patient?.uhid}
                </div>
              </div>
              <div className="text-slate-500">
                {appointment.patient?.gender} &middot; {appointment.patient?.phone}
              </div>
              <Button
                variant="outline"
                size="sm"
                className="w-full"
                onClick={() => router.push(`/dashboard/patients/detail?id=${appointment.patientId}`)}
              >
                View Patient 360° Profile
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm flex items-center gap-2">
                <Stethoscope className="w-4 h-4 text-teal-600" />
                Assigned Clinician
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-xs">
              <div className="font-semibold text-slate-900 dark:text-white text-sm">
                Dr. {appointment.doctor?.user.firstName} {appointment.doctor?.user.lastName}
              </div>
              <div className="text-slate-500">
                {appointment.doctor?.specialization}
              </div>
              <div className="text-slate-600 dark:text-slate-400 pt-1">
                Consultation Fee: <strong className="text-teal-600">₹{appointment.doctor?.consultationFee}</strong>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Cancellation Modal */}
      <Modal
        isOpen={isCancelModalOpen}
        onClose={() => setIsCancelModalOpen(false)}
        title="Cancel Appointment"
        description="Cancelling will release this slot back to the doctor's calendar."
        footer={
          <>
            <Button variant="outline" size="sm" onClick={() => setIsCancelModalOpen(false)}>
              Keep Appointment
            </Button>
            <Button variant="destructive" size="sm" isLoading={isActionLoading} onClick={handleCancel}>
              Confirm Cancellation
            </Button>
          </>
        }
      >
        <Textarea
          label="Reason for Cancellation"
          required
          placeholder="e.g. Patient requested postponement due to travel..."
          value={cancelReason}
          onChange={(e) => setCancelReason(e.target.value)}
          rows={3}
        />
      </Modal>
    </div>
  );
}

export default function AppointmentDetailPage() {
  return (
    <AppShell>
      <Suspense fallback={<Skeleton className="h-64 w-full rounded-2xl" />}>
        <AppointmentDetailContent />
      </Suspense>
    </AppShell>
  );
}
