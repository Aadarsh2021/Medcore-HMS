'use client';

import React, { useEffect, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { AppShell } from '../../../../components/layout/AppShell';
import { PageHeader } from '../../../../components/layout/PageHeader';
import { Button } from '../../../../components/ui/Button';
import { Badge } from '../../../../components/ui/Badge';
import { Input } from '../../../../components/ui/Input';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '../../../../components/ui/Card';
import { Skeleton } from '../../../../components/ui/Skeleton';
import {
  Stethoscope,
  Calendar,
  Clock,
  Save,
  CheckCircle2,
  Building2,
  Mail,
  Phone,
  ArrowLeft,
} from 'lucide-react';
import { doctorsService, DoctorRecord, DoctorAvailabilityDay } from '../../../../lib/api/doctors.service';

const DAYS_OF_WEEK = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
];

function DoctorDetailContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const id = searchParams.get('id') || 'doc-001-sharma';

  const [doctor, setDoctor] = useState<DoctorRecord | null>(null);
  const [schedules, setSchedules] = useState<DoctorAvailabilityDay[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  useEffect(() => {
    async function loadDoctor() {
      setIsLoading(true);
      try {
        const doc = await doctorsService.findById(id);
        setDoctor(doc);
        const avail = await doctorsService.getAvailability(id);

        // Ensure 7 days are represented
        const fullSchedule: DoctorAvailabilityDay[] = [0, 1, 2, 3, 4, 5, 6].map((day) => {
          const found = avail.find((a) => a.dayOfWeek === day);
          return (
            found || {
              dayOfWeek: day,
              startTime: '09:00',
              endTime: '13:00',
              slotDurationMinutes: 30,
              isActive: day >= 1 && day <= 5, // Mon-Fri active by default
            }
          );
        });
        setSchedules(fullSchedule);
      } finally {
        setIsLoading(false);
      }
    }
    loadDoctor();
  }, [id]);

  if (isLoading) {
    return <Skeleton className="h-64 w-full rounded-2xl" />;
  }

  if (!doctor) {
    return (
      <div className="p-12 text-center">
        <h2 className="text-base font-bold text-slate-800">Doctor Not Found</h2>
        <Button variant="outline" size="sm" className="mt-4" onClick={() => router.push('/dashboard/doctors')}>
          Back to Doctors
        </Button>
      </div>
    );
  }

  const handleScheduleChange = (
    dayOfWeek: number,
    field: keyof DoctorAvailabilityDay,
    value: any,
  ) => {
    setSchedules((prev) =>
      prev.map((s) => (s.dayOfWeek === dayOfWeek ? { ...s, [field]: value } : s)),
    );
    setSaveSuccess(false);
  };

  const handleSaveSchedule = async () => {
    setIsSaving(true);
    try {
      await doctorsService.setAvailability(doctor.id, schedules);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err: any) {
      alert(err.message || 'Failed to save schedule.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <PageHeader
        breadcrumbs={[
          { label: 'Doctors', href: '/dashboard/doctors' },
          { label: `Dr. ${doctor.user.firstName} ${doctor.user.lastName}` },
        ]}
        title={`Dr. ${doctor.user.firstName} ${doctor.user.lastName}`}
        description={`${doctor.specialization} &middot; Medical License: ${doctor.licenseNumber}`}
        actions={
          <Button
            variant="primary"
            size="sm"
            leftIcon={<Calendar className="w-4 h-4" />}
            onClick={() => router.push(`/dashboard/appointments/new?doctorId=${doctor.id}`)}
          >
            Book Consultation
          </Button>
        }
      />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Doctor Profile Information */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm flex items-center gap-2">
                <Stethoscope className="w-4 h-4 text-teal-600" />
                Clinician Profile
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-xs">
              <div>
                <span className="text-slate-500">Department:</span>
                <div className="font-semibold text-slate-800 dark:text-slate-200 mt-0.5">
                  {doctor.department?.name || doctor.specialization}
                </div>
              </div>
              <div>
                <span className="text-slate-500">Consultation Fee:</span>
                <div className="text-base font-bold text-teal-600 dark:text-teal-400 font-mono mt-0.5">
                  ₹{doctor.consultationFee}
                </div>
              </div>
              <div>
                <span className="text-slate-500">Medical Council License:</span>
                <div className="font-mono font-semibold text-slate-800 dark:text-slate-200 mt-0.5">
                  {doctor.licenseNumber}
                </div>
              </div>
              <div className="pt-2 border-t border-slate-100 dark:border-slate-800 space-y-1">
                <div className="flex items-center gap-2 text-slate-600 dark:text-slate-400">
                  <Mail className="w-3.5 h-3.5 text-slate-400" />
                  <span>{doctor.user.email}</span>
                </div>
                {doctor.user.phone && (
                  <div className="flex items-center gap-2 text-slate-600 dark:text-slate-400 font-mono">
                    <Phone className="w-3.5 h-3.5 text-slate-400" />
                    <span>{doctor.user.phone}</span>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {doctor.bio && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Biography & Clinical Background</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                  {doctor.bio}
                </p>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Interactive Weekly Availability Schedule Editor */}
        <div className="md:col-span-2 space-y-6">
          <Card>
            <CardHeader className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base flex items-center gap-2">
                  <Clock className="w-4 h-4 text-teal-600" />
                  Weekly Consultation Availability Schedule
                </CardTitle>
                <CardDescription>
                  Configure day-to-day outpatient OPD booking hours and slot durations
                </CardDescription>
              </div>
              {saveSuccess && (
                <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 flex items-center gap-1 animate-in fade-in">
                  <CheckCircle2 className="w-4 h-4" />
                  Saved!
                </span>
              )}
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {schedules.map((day) => {
                  const dayName = DAYS_OF_WEEK[day.dayOfWeek];
                  return (
                    <div
                      key={day.dayOfWeek}
                      className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                    >
                      <div className="flex items-center gap-3 w-32 shrink-0">
                        <input
                          type="checkbox"
                          id={`day-${day.dayOfWeek}`}
                          checked={day.isActive}
                          onChange={(e) =>
                            handleScheduleChange(day.dayOfWeek, 'isActive', e.target.checked)
                          }
                          className="w-4 h-4 text-teal-600 rounded border-slate-300 focus:ring-teal-500 cursor-pointer"
                        />
                        <label
                          htmlFor={`day-${day.dayOfWeek}`}
                          className={`text-xs sm:text-sm font-semibold cursor-pointer ${
                            day.isActive
                              ? 'text-slate-900 dark:text-white'
                              : 'text-slate-400 dark:text-slate-600 line-through'
                          }`}
                        >
                          {dayName}
                        </label>
                      </div>

                      {day.isActive ? (
                        <div className="flex items-center gap-2 flex-wrap">
                          <div className="flex items-center gap-1.5 text-xs">
                            <span className="text-slate-400">From:</span>
                            <input
                              type="time"
                              value={day.startTime}
                              onChange={(e) =>
                                handleScheduleChange(day.dayOfWeek, 'startTime', e.target.value)
                              }
                              className="px-2 py-1 text-xs rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 font-mono"
                            />
                          </div>
                          <div className="flex items-center gap-1.5 text-xs">
                            <span className="text-slate-400">To:</span>
                            <input
                              type="time"
                              value={day.endTime}
                              onChange={(e) =>
                                handleScheduleChange(day.dayOfWeek, 'endTime', e.target.value)
                              }
                              className="px-2 py-1 text-xs rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 font-mono"
                            />
                          </div>
                          <div className="flex items-center gap-1.5 text-xs">
                            <span className="text-slate-400">Slot:</span>
                            <select
                              value={day.slotDurationMinutes}
                              onChange={(e) =>
                                handleScheduleChange(
                                  day.dayOfWeek,
                                  'slotDurationMinutes',
                                  Number(e.target.value),
                                )
                              }
                              className="px-2 py-1 text-xs rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
                            >
                              <option value={15}>15m</option>
                              <option value={20}>20m</option>
                              <option value={30}>30m</option>
                              <option value={45}>45m</option>
                              <option value={60}>60m</option>
                            </select>
                          </div>
                        </div>
                      ) : (
                        <span className="text-xs text-slate-400 italic">
                          OPD Clinic Closed / Off-duty
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </CardContent>
            <CardFooter>
              <div className="text-xs text-slate-500">
                Changes apply immediately to appointment booking slot generation.
              </div>
              <Button
                variant="clinical"
                size="sm"
                isLoading={isSaving}
                leftIcon={<Save className="w-4 h-4" />}
                onClick={handleSaveSchedule}
              >
                Save Weekly Schedule
              </Button>
            </CardFooter>
          </Card>
        </div>
      </div>
    </div>
  );
}

export default function DoctorDetailPage() {
  return (
    <AppShell>
      <Suspense fallback={<Skeleton className="h-64 w-full rounded-2xl" />}>
        <DoctorDetailContent />
      </Suspense>
    </AppShell>
  );
}
