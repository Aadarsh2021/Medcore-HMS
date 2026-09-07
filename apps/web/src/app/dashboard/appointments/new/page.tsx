'use client';

import React, { useEffect, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { AppShell } from '../../../../components/layout/AppShell';
import { PageHeader } from '../../../../components/layout/PageHeader';
import { Button } from '../../../../components/ui/Button';
import { Input } from '../../../../components/ui/Input';
import { Select } from '../../../../components/ui/Select';
import { Textarea } from '../../../../components/ui/Textarea';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '../../../../components/ui/Card';
import { Calendar, Clock, User, Stethoscope, CheckCircle2, ArrowRight } from 'lucide-react';
import { appointmentsService } from '../../../../lib/api/appointments.service';
import { doctorsService, DoctorRecord } from '../../../../lib/api/doctors.service';
import { patientsService, PatientRecord } from '../../../../lib/api/patients.service';
import { AppointmentType } from '@medcore/types';

function BookAppointmentContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const preselectedPatientId = searchParams.get('patientId') || '';

  const [patients, setPatients] = useState<PatientRecord[]>([]);
  const [doctors, setDoctors] = useState<DoctorRecord[]>([]);
  const [slots, setSlots] = useState<Array<{ startTime: string; endTime: string; isBooked: boolean }>>([]);
  const [slotDurationMinutes, setSlotDurationMinutes] = useState<number>(30);
  const [isLoadingSlots, setIsLoadingSlots] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [patientId, setPatientId] = useState(preselectedPatientId);
  const [doctorId, setDoctorId] = useState('');
  const [appointmentDate, setAppointmentDate] = useState(new Date().toISOString().split('T')[0]);
  const [selectedSlot, setSelectedSlot] = useState('');
  const [type, setType] = useState<AppointmentType>(AppointmentType.REGULAR);
  const [reason, setReason] = useState('');

  useEffect(() => {
    async function loadData() {
      const [pts, docs] = await Promise.all([
        patientsService.findAll(),
        doctorsService.list(),
      ]);
      setPatients(pts.items);
      setDoctors(docs);

      if (docs.length > 0 && !doctorId) {
        setDoctorId(docs[0].id);
      }
      if (pts.items.length > 0 && !patientId) {
        setPatientId(preselectedPatientId || pts.items[0].id);
      }
    }
    loadData();
  }, [preselectedPatientId]);

  useEffect(() => {
    async function fetchSlots() {
      if (doctorId && appointmentDate) {
        setIsLoadingSlots(true);
        setErrorMessage(null);
        try {
          const res = await doctorsService.getSlots(doctorId, appointmentDate);
          setSlots(res.slots);
          setSlotDurationMinutes(res.slotDurationMinutes);
          const firstOpen = res.slots.find((s) => !s.isBooked);
          setSelectedSlot(firstOpen ? firstOpen.startTime : '');
        } catch (err: any) {
          setErrorMessage('Unable to load doctor consultation slots. Please retry.');
        } finally {
          setIsLoadingSlots(false);
        }
      }
    }
    fetchSlots();
  }, [doctorId, appointmentDate]);

  const handleBook = async () => {
    if (!patientId || !doctorId || !selectedSlot) {
      setErrorMessage('Please select a patient, doctor, and consultation time slot.');
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);
    try {
      const apt = await appointmentsService.book({
        patientId,
        doctorId,
        appointmentDate,
        startTime: selectedSlot,
        type,
        reason,
      });
      router.push(`/dashboard/appointments/detail?id=${apt.id}`);
    } catch (err: any) {
      if (err.statusCode === 409) {
        setErrorMessage('This consultation slot was just booked by another patient. Please choose another slot.');
      } else {
        setErrorMessage(err.message || 'Failed to book appointment. Please try another slot.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const selectedDoctor = doctors.find((d) => d.id === doctorId);

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <PageHeader
        breadcrumbs={[
          { label: 'Appointments', href: '/dashboard/appointments' },
          { label: 'Book Appointment' },
        ]}
        title="Schedule Outpatient Consultation"
        description="Verify doctor slot availability and record patient intake reason"
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Calendar className="w-4 h-4 text-teal-600" />
            Consultation Booking Form
          </CardTitle>
          <CardDescription>
            Row-level pessimistic locking prevents double booking
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Patient Selection */}
          <Select
            label="Select Patient (UHID)"
            required
            value={patientId}
            onChange={(e) => setPatientId(e.target.value)}
          >
            {patients.map((p) => (
              <option key={p.id} value={p.id}>
                {p.uhid} &middot; {p.firstName} {p.lastName} ({p.gender}, {p.bloodGroup.replace('_', ' ')})
              </option>
            ))}
          </Select>

          {/* Doctor Selection */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Select
              label="Consulting Doctor"
              required
              value={doctorId}
              onChange={(e) => setDoctorId(e.target.value)}
            >
              {doctors.map((d) => (
                <option key={d.id} value={d.id}>
                  Dr. {d.user.firstName} {d.user.lastName} ({d.specialization})
                </option>
              ))}
            </Select>

            <Input
              type="date"
              label="Appointment Date"
              required
              min={new Date().toISOString().split('T')[0]}
              value={appointmentDate}
              onChange={(e) => setAppointmentDate(e.target.value)}
            />
          </div>

          {/* Consultation Fee & Department Info */}
          {selectedDoctor && (
            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs">
              <span className="text-slate-600 dark:text-slate-400">
                Department: <strong>{selectedDoctor.department?.name || selectedDoctor.specialization}</strong>
              </span>
              <span className="text-slate-600 dark:text-slate-400">
                Standard Consultation Fee: <strong className="text-teal-600 dark:text-teal-400">₹{selectedDoctor.consultationFee}</strong>
              </span>
            </div>
          )}

          {errorMessage && (
            <div className="p-3 rounded-lg bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-900 text-xs text-rose-700 dark:text-rose-300 flex items-center justify-between">
              <span>{errorMessage}</span>
              <button
                type="button"
                onClick={() => setErrorMessage(null)}
                className="text-rose-500 hover:text-rose-700 font-bold ml-2"
              >
                &times;
              </button>
            </div>
          )}

          {/* Time Slot Picker */}
          <div className="space-y-2 text-left">
            <div className="flex items-center justify-between">
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                Select Consultation Slot <span className="text-rose-500">*</span>
              </label>
              <span className="text-xs font-medium text-teal-700 dark:text-teal-300 bg-teal-50 dark:bg-teal-950/80 px-2.5 py-0.5 rounded-full border border-teal-200 dark:border-teal-800">
                {slotDurationMinutes}-Minute Consultation Slots
              </span>
            </div>

            {isLoadingSlots ? (
              <div className="p-4 text-center text-xs text-slate-500 animate-pulse">
                Loading schedule-derived slots...
              </div>
            ) : slots.length === 0 ? (
              <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 text-xs text-amber-800 dark:text-amber-300">
                No active consultation slots configured for this date. Please choose another date or doctor.
              </div>
            ) : (
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                {slots.map((slot) => {
                  const isSelected = selectedSlot === slot.startTime;
                  return (
                    <button
                      key={slot.startTime}
                      type="button"
                      disabled={slot.isBooked}
                      onClick={() => setSelectedSlot(slot.startTime)}
                      className={`py-2 px-2.5 rounded-lg text-xs font-mono font-medium border text-center transition ${
                        slot.isBooked
                          ? 'bg-slate-100 dark:bg-slate-800/40 text-slate-400 border-slate-200 dark:border-slate-800 cursor-not-allowed line-through'
                          : isSelected
                          ? 'bg-teal-600 text-white border-teal-700 shadow-sm font-bold ring-2 ring-teal-400/40'
                          : 'bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 border-slate-300 dark:border-slate-700 hover:border-teal-500'
                      }`}
                    >
                      <div>{slot.startTime}</div>
                      <div className={`text-[10px] ${isSelected ? 'text-teal-100' : 'text-slate-400'}`}>
                        {slot.endTime}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Type & Reason */}
          <Select
            label="Visit Type"
            value={type}
            onChange={(e) => setType(e.target.value as AppointmentType)}
            options={[
              { value: AppointmentType.REGULAR, label: 'Regular OPD Consultation' },
              { value: AppointmentType.FOLLOW_UP, label: 'Follow-up Consultation' },
            ]}
          />

          <Textarea
            label="Chief Complaint / Reason for Consultation"
            placeholder="e.g. Chest pain with exertion for 2 days, persistent mild fever..."
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
          />
        </CardContent>

        <CardFooter>
          <Button variant="outline" size="sm" onClick={() => router.back()}>
            Cancel
          </Button>
          <Button
            variant="primary"
            size="sm"
            isLoading={isSubmitting}
            rightIcon={<CheckCircle2 className="w-4 h-4" />}
            onClick={handleBook}
          >
            Confirm Appointment
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}

export default function BookAppointmentPage() {
  return (
    <AppShell>
      <Suspense fallback={<div className="p-8 text-center text-xs text-slate-500">Loading booking wizard...</div>}>
        <BookAppointmentContent />
      </Suspense>
    </AppShell>
  );
}
