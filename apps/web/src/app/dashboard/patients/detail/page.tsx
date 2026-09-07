'use client';

import React, { useEffect, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { AppShell } from '../../../../components/layout/AppShell';
import { PageHeader } from '../../../../components/layout/PageHeader';
import { Tabs } from '../../../../components/ui/Tabs';
import { Badge } from '../../../../components/ui/Badge';
import { Button } from '../../../../components/ui/Button';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../../../../components/ui/Card';
import { Skeleton } from '../../../../components/ui/Skeleton';
import { useAuthStore } from '../../../../stores/authStore';
import { UserRole } from '@medcore/types';
import {
  User,
  Calendar,
  Phone,
  Mail,
  MapPin,
  HeartHandshake,
  AlertTriangle,
  Stethoscope,
  Pill,
  FileText,
  FlaskConical,
  Receipt,
  Download,
  Clock,
  ArrowRight,
  ShieldAlert,
} from 'lucide-react';
import { patientsService, PatientRecord } from '../../../../lib/api/patients.service';
import { appointmentsService, AppointmentRecord } from '../../../../lib/api/appointments.service';
import { prescriptionsService, PrescriptionRecord } from '../../../../lib/api/prescriptions.service';
import { laboratoryService, LabOrderItem } from '../../../../lib/api/laboratory.service';
import { billingService, InvoiceRecord } from '../../../../lib/api/billing.service';

function PatientDetailContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user } = useAuthStore();
  const id = searchParams.get('id') || 'p-001-arjun-verma';

  const [patient, setPatient] = useState<PatientRecord | null>(null);
  const [appointments, setAppointments] = useState<AppointmentRecord[]>([]);
  const [prescriptions, setPrescriptions] = useState<PrescriptionRecord[]>([]);
  const [labOrders, setLabOrders] = useState<LabOrderItem[]>([]);
  const [invoices, setInvoices] = useState<InvoiceRecord[]>([]);
  const [activeTab, setActiveTab] = useState('overview');
  const [isLoading, setIsLoading] = useState(true);

  // Enforce patient privacy: patients can only inspect their own record
  const isPatientRole = user?.role === UserRole.PATIENT;
  const isUnauthorizedPatient = Boolean(isPatientRole && patient && patient.userId && user?.id && patient.userId !== user.id);

  useEffect(() => {
    async function loadPatient360() {
      if (!id) {
        setIsLoading(false);
        return;
      }
      setIsLoading(true);
      try {
        const p = await patientsService.findById(id);
        setPatient(p);

        const [apts, rxs, labs, invs] = await Promise.all([
          appointmentsService.list({ patientId: id }),
          prescriptionsService.list({ patientId: id }),
          laboratoryService.getOrders(),
          billingService.getInvoices(),
        ]);

        setAppointments(apts.items.filter((a) => a.patientId === id || a.patient?.uhid === p?.uhid));
        setPrescriptions(rxs.filter((r) => r.patientId === id || r.patient?.uhid === p?.uhid));
        setLabOrders(labs.filter((l) => l.patientId === id || l.patientUhid === p?.uhid));
        setInvoices(invs.filter((i) => i.patientId === id || i.patientUhid === p?.uhid));
      } finally {
        setIsLoading(false);
      }
    }
    loadPatient360();
  }, [id]);

  if (isUnauthorizedPatient) {
    return (
      <div className="p-12 text-center max-w-md mx-auto space-y-3">
        <div className="w-12 h-12 rounded-2xl bg-rose-100 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-900 flex items-center justify-center mx-auto">
          <ShieldAlert className="w-6 h-6" />
        </div>
        <h2 className="text-base font-bold text-slate-900 dark:text-white">Patient Record Access Restricted</h2>
        <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
          Patients are restricted to viewing their personal health history only. Access to external medical records is prevented by backend tenant and patient access controls.
        </p>
        <Button variant="outline" size="sm" onClick={() => router.push('/dashboard')}>
          Back to My Health Portal
        </Button>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-32 w-full rounded-2xl" />
        <Skeleton className="h-10 w-96" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Skeleton className="h-64 md:col-span-2 rounded-xl" />
          <Skeleton className="h-64 rounded-xl" />
        </div>
      </div>
    );
  }

  if (!patient) {
    return (
      <div className="p-12 text-center max-w-md mx-auto space-y-3">
        <h2 className="text-base font-bold text-slate-800 dark:text-slate-200">Patient Record Not Found</h2>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          The requested patient record could not be retrieved from the medical directory.
        </p>
        <Button
          variant="outline"
          size="sm"
          className="mt-2"
          onClick={() => router.push('/dashboard/patients')}
        >
          Return to Patients Directory
        </Button>
      </div>
    );
  }

  const birthYear = new Date(patient.dateOfBirth).getFullYear();
  const age = new Date().getFullYear() - birthYear;

  const tabs = [
    { id: 'overview', label: 'Overview & Profile' },
    { id: 'appointments', label: 'Appointments', count: appointments.length },
    { id: 'prescriptions', label: 'Prescriptions', count: prescriptions.length },
    { id: 'lab', label: 'Lab Reports', count: labOrders.length },
    { id: 'billing', label: 'Billing & Invoices', count: invoices.length },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        breadcrumbs={[
          { label: 'Patients', href: '/dashboard/patients' },
          { label: `${patient.firstName} ${patient.lastName}` },
        ]}
        title={`${patient.firstName} ${patient.lastName}`}
        description={`UHID: ${patient.uhid} &middot; Registered on ${new Date(patient.createdAt).toLocaleDateString()}`}
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              leftIcon={<Calendar className="w-4 h-4" />}
              onClick={() => router.push(`/dashboard/appointments/new?patientId=${patient.id}`)}
            >
              Book Appointment
            </Button>
            <Button
              variant="primary"
              size="sm"
              leftIcon={<Stethoscope className="w-4 h-4" />}
              onClick={() => router.push('/dashboard/clinical')}
            >
              Start Clinical Encounter
            </Button>
          </div>
        }
      />

      {/* 360° Clinical Patient Header Banner */}
      <div className="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div className="flex items-start gap-4">
          <div className="w-14 h-14 rounded-2xl bg-teal-600 text-white flex items-center justify-center font-bold text-xl shadow-md shadow-teal-600/30 shrink-0">
            {patient.firstName[0]}
            {patient.lastName[0]}
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-xl font-bold text-slate-900 dark:text-white">
                {patient.firstName} {patient.lastName}
              </h2>
              <span className="font-mono text-xs font-semibold px-2 py-0.5 rounded bg-teal-50 dark:bg-teal-950 text-teal-700 dark:text-teal-300 border border-teal-200 dark:border-teal-800">
                {patient.uhid}
              </span>
              <Badge variant="purple" size="sm">
                {patient.bloodGroup.replace('_', ' ')}
              </Badge>
            </div>
            <div className="text-xs text-slate-500 dark:text-slate-400 mt-1 flex flex-wrap items-center gap-3">
              <span>{age} years old</span>
              <span>&middot;</span>
              <span>{patient.gender}</span>
              <span>&middot;</span>
              <span className="flex items-center gap-1 font-mono">
                <Phone className="w-3 h-3" />
                {patient.phone}
              </span>
              {patient.email && (
                <>
                  <span>&middot;</span>
                  <span className="flex items-center gap-1">
                    <Mail className="w-3 h-3" />
                    {patient.email}
                  </span>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Allergy Alert Indicator */}
        {patient.allergies && patient.allergies.length > 0 ? (
          <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-900/60 max-w-sm">
            <div className="text-xs font-bold text-rose-700 dark:text-rose-300 flex items-center gap-1.5 mb-1">
              <AlertTriangle className="w-3.5 h-3.5" />
              Documented Allergies
            </div>
            <div className="flex flex-wrap gap-1.5">
              {patient.allergies.map((al, idx) => (
                <span
                  key={idx}
                  className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-rose-100 dark:bg-rose-900 text-rose-800 dark:text-rose-200"
                >
                  {al.allergen} ({al.severity})
                </span>
              ))}
            </div>
          </div>
        ) : (
          <div className="text-xs text-slate-400 italic">No known drug allergies recorded</div>
        )}
      </div>

      {/* Navigation Tabs */}
      <Tabs tabs={tabs} activeTab={activeTab} onChange={setActiveTab} />

      {/* Tab Content */}
      {activeTab === 'overview' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="md:col-span-2 space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Patient Demographics & Address</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 text-xs sm:text-sm">
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                  <div>
                    <span className="text-slate-500">Date of Birth:</span>
                    <div className="font-semibold">{patient.dateOfBirth}</div>
                  </div>
                  <div>
                    <span className="text-slate-500">Biological Gender:</span>
                    <div className="font-semibold">{patient.gender}</div>
                  </div>
                  <div>
                    <span className="text-slate-500">Blood Group:</span>
                    <div className="font-semibold">{patient.bloodGroup.replace('_', ' ')}</div>
                  </div>
                </div>
                <div className="pt-3 border-t border-slate-100 dark:border-slate-800">
                  <span className="text-slate-500">Residential Address:</span>
                  <div className="font-semibold mt-0.5">
                    {patient.address
                      ? `${patient.address.street}, ${patient.address.city}, ${patient.address.state} - ${patient.address.postalCode}, ${patient.address.country}`
                      : 'No residential address on file'}
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-sm flex items-center gap-2">
                  <HeartHandshake className="w-4 h-4 text-rose-500" />
                  Emergency Next of Kin Contact
                </CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs sm:text-sm">
                <div>
                  <span className="text-slate-500">Contact Name:</span>
                  <div className="font-semibold">{patient.emergencyContactName || 'Not specified'}</div>
                </div>
                <div>
                  <span className="text-slate-500">Relationship:</span>
                  <div className="font-semibold">{patient.emergencyContactRelation || 'Not specified'}</div>
                </div>
                <div>
                  <span className="text-slate-500">Emergency Phone:</span>
                  <div className="font-semibold font-mono">{patient.emergencyContactPhone || 'Not specified'}</div>
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Care Summary</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-xs">
                <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800">
                  <span className="text-slate-500">Total Consultations</span>
                  <span className="font-bold font-mono">{appointments.length}</span>
                </div>
                <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800">
                  <span className="text-slate-500">Prescriptions Issued</span>
                  <span className="font-bold font-mono">{prescriptions.length}</span>
                </div>
                <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800">
                  <span className="text-slate-500">Diagnostic Tests</span>
                  <span className="font-bold font-mono">{labOrders.length}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">Outstanding Invoices</span>
                  <span className="font-bold font-mono text-emerald-600">
                    ₹{invoices.reduce((acc, i) => acc + i.balanceDue, 0)}
                  </span>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {activeTab === 'appointments' && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Consultation History & Schedules</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {appointments.length > 0 ? (
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {appointments.map((apt) => (
                  <div key={apt.id} className="p-4 flex items-center justify-between">
                    <div>
                      <div className="font-semibold text-sm">
                        {apt.appointmentDate} at {apt.startTime} ({apt.type})
                      </div>
                      <div className="text-xs text-slate-500">
                        Doctor: {apt.doctor?.user.firstName} {apt.doctor?.user.lastName} ({apt.doctor?.specialization})
                      </div>
                      {apt.reason && <div className="text-xs text-slate-600 mt-1 italic">"{apt.reason}"</div>}
                    </div>
                    <Badge variant={apt.status === 'COMPLETED' ? 'success' : 'neutral'}>
                      {apt.status}
                    </Badge>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-8 text-center text-xs text-slate-500">
                No appointment records found for this patient.
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {activeTab === 'prescriptions' && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Prescription & Medication Records</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {prescriptions.length > 0 ? (
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {prescriptions.map((rx) => (
                  <div key={rx.id} className="p-4 flex items-center justify-between">
                    <div>
                      <div className="font-semibold font-mono text-sm text-teal-600">
                        {rx.prescriptionNumber}
                      </div>
                      <div className="text-xs text-slate-500 mt-0.5">
                        Issued: {new Date(rx.createdAt).toLocaleDateString()} &middot; {rx.items.length} Medicines
                      </div>
                      <div className="text-xs text-slate-700 mt-1">
                        {rx.items.map((i) => i.customMedicineName).join(', ')}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant={rx.status === 'ISSUED' ? 'success' : 'neutral'}>
                        {rx.status}
                      </Badge>
                      <Button
                        variant="outline"
                        size="sm"
                        leftIcon={<Download className="w-3.5 h-3.5" />}
                        onClick={() => router.push(`/dashboard/prescriptions/detail?id=${rx.id}`)}
                      >
                        View Rx
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-8 text-center text-xs text-slate-500">
                No active or historical prescriptions on file.
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {activeTab === 'lab' && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Diagnostic Pathology Reports</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {labOrders.length > 0 ? (
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {labOrders.map((lab) => (
                  <div key={lab.id} className="p-4 flex items-center justify-between">
                    <div>
                      <div className="font-semibold text-sm">
                        {lab.orderNumber} &middot; {lab.specimenType}
                      </div>
                      <div className="text-xs text-slate-500">
                        Ordered by {lab.doctorName} &middot; {new Date(lab.orderDate).toLocaleDateString()}
                      </div>
                      <div className="text-xs text-slate-700 mt-1">
                        {lab.tests.map((t) => t.name).join(', ')}
                      </div>
                    </div>
                    <Badge variant={lab.status === 'APPROVED' ? 'success' : 'warning'}>
                      {lab.status.replace('_', ' ')}
                    </Badge>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-8 text-center text-xs text-slate-500">
                No pathology diagnostic orders on file.
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {activeTab === 'billing' && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Patient Invoices & Receipts</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {invoices.length > 0 ? (
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {invoices.map((inv) => (
                  <div key={inv.id} className="p-4 flex items-center justify-between">
                    <div>
                      <div className="font-semibold font-mono text-sm text-slate-900 dark:text-white">
                        {inv.invoiceNumber}
                      </div>
                      <div className="text-xs text-slate-500">
                        Issued: {new Date(inv.issuedAt).toLocaleDateString()} &middot; Total: ₹{inv.totalAmount}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant={inv.status === 'PAID' ? 'success' : 'warning'}>
                        {inv.status}
                      </Badge>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => router.push(`/dashboard/billing?id=${inv.id}`)}
                      >
                        View Invoice
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-8 text-center text-xs text-slate-500">
                No billing statements or invoices generated.
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export default function PatientDetailPage() {
  return (
    <AppShell>
      <Suspense fallback={<Skeleton className="h-64 w-full rounded-2xl" />}>
        <PatientDetailContent />
      </Suspense>
    </AppShell>
  );
}
