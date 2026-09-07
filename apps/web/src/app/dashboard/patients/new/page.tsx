'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { AppShell } from '../../../../components/layout/AppShell';
import { PageHeader } from '../../../../components/layout/PageHeader';
import { Button } from '../../../../components/ui/Button';
import { Input } from '../../../../components/ui/Input';
import { Select } from '../../../../components/ui/Select';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '../../../../components/ui/Card';
import { CheckCircle2, User, Phone, MapPin, HeartHandshake, ArrowRight, ArrowLeft, Calendar, UserPlus } from 'lucide-react';
import { patientsService, RegisterPatientDto, PatientRecord } from '../../../../lib/api/patients.service';
import { Gender, BloodGroup } from '@medcore/types';

export default function RegisterPatientPage() {
  const router = useRouter();
  const [step, setStep] = useState<1 | 2 | 3 | 4 | 5>(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [registeredPatient, setRegisteredPatient] = useState<PatientRecord | null>(null);

  const [form, setForm] = useState<RegisterPatientDto>({
    firstName: '',
    lastName: '',
    dateOfBirth: '',
    gender: Gender.MALE,
    bloodGroup: BloodGroup.O_POSITIVE,
    phone: '',
    email: '',
    emergencyContactName: '',
    emergencyContactPhone: '',
    emergencyContactRelation: '',
    address: {
      street: '',
      city: '',
      state: '',
      postalCode: '',
      country: 'India',
    },
  });

  const [errors, setErrors] = useState<Record<string, string>>({});

  const validateStep = (currentStep: number): boolean => {
    const errs: Record<string, string> = {};
    if (currentStep === 1) {
      if (!form.firstName.trim()) errs.firstName = 'First name is required';
      if (!form.lastName.trim()) errs.lastName = 'Last name is required';
      if (!form.dateOfBirth) errs.dateOfBirth = 'Date of birth is required';
    } else if (currentStep === 2) {
      if (!form.phone.trim()) errs.phone = 'Phone number is required';
    } else if (currentStep === 3) {
      if (!form.address?.street.trim()) errs.street = 'Street address is required';
      if (!form.address?.city.trim()) errs.city = 'City is required';
      if (!form.address?.postalCode.trim()) errs.postalCode = 'Postal / PIN code is required';
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleNext = () => {
    if (validateStep(step)) {
      setStep((s) => (s + 1) as any);
    }
  };

  const handleBack = () => {
    setStep((s) => (s - 1) as any);
  };

  const handleSubmit = async () => {
    setIsSubmitting(true);
    try {
      const patient = await patientsService.register(form);
      setRegisteredPatient(patient);
      setStep(5); // Success step
    } catch (err: any) {
      alert(err.message || 'Failed to register patient. Please check input values.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AppShell>
      <PageHeader
        breadcrumbs={[
          { label: 'Patients', href: '/dashboard/patients' },
          { label: 'Register Patient' },
        ]}
        title="Patient Intake & Registration"
        description="Provision a verified patient identity with server-generated Unique Hospital ID (UHID)"
      />

      {step < 5 ? (
        <div className="max-w-3xl mx-auto space-y-6">
          {/* Multi-step progress indicator */}
          <div className="flex items-center justify-between pb-4 border-b border-slate-200 dark:border-slate-800 text-xs font-semibold">
            {[
              { num: 1, label: 'Demographics' },
              { num: 2, label: 'Contact' },
              { num: 3, label: 'Address' },
              { num: 4, label: 'Review & Confirm' },
            ].map((s) => (
              <div
                key={s.num}
                className={`flex items-center gap-2 ${
                  step === s.num
                    ? 'text-teal-600 dark:text-teal-400 font-bold'
                    : step > s.num
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : 'text-slate-400'
                }`}
              >
                <div
                  className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] ${
                    step === s.num
                      ? 'bg-teal-600 text-white'
                      : step > s.num
                      ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-400'
                  }`}
                >
                  {s.num}
                </div>
                <span className="hidden sm:inline">{s.label}</span>
              </div>
            ))}
          </div>

          <Card>
            {step === 1 && (
              <>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <User className="w-4 h-4 text-teal-600" />
                    Personal Information & Demographics
                  </CardTitle>
                  <CardDescription>Legal name, birth details, and blood group</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <Input
                      label="First Name"
                      required
                      value={form.firstName}
                      error={errors.firstName}
                      onChange={(e) => setForm({ ...form, firstName: e.target.value })}
                      placeholder="e.g. Ramesh"
                    />
                    <Input
                      label="Last Name"
                      required
                      value={form.lastName}
                      error={errors.lastName}
                      onChange={(e) => setForm({ ...form, lastName: e.target.value })}
                      placeholder="e.g. Gupta"
                    />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <Input
                      type="date"
                      label="Date of Birth"
                      required
                      value={form.dateOfBirth}
                      error={errors.dateOfBirth}
                      onChange={(e) => setForm({ ...form, dateOfBirth: e.target.value })}
                    />
                    <Select
                      label="Gender"
                      required
                      value={form.gender}
                      onChange={(e) => setForm({ ...form, gender: e.target.value as Gender })}
                      options={[
                        { value: Gender.MALE, label: 'Male' },
                        { value: Gender.FEMALE, label: 'Female' },
                        { value: Gender.OTHER, label: 'Other' },
                      ]}
                    />
                    <Select
                      label="Blood Group"
                      required
                      value={form.bloodGroup}
                      onChange={(e) => setForm({ ...form, bloodGroup: e.target.value as BloodGroup })}
                      options={[
                        { value: BloodGroup.A_POSITIVE, label: 'A+' },
                        { value: BloodGroup.A_NEGATIVE, label: 'A-' },
                        { value: BloodGroup.B_POSITIVE, label: 'B+' },
                        { value: BloodGroup.B_NEGATIVE, label: 'B-' },
                        { value: BloodGroup.AB_POSITIVE, label: 'AB+' },
                        { value: BloodGroup.AB_NEGATIVE, label: 'AB-' },
                        { value: BloodGroup.O_POSITIVE, label: 'O+' },
                        { value: BloodGroup.O_NEGATIVE, label: 'O-' },
                      ]}
                    />
                  </div>
                </CardContent>
              </>
            )}

            {step === 2 && (
              <>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Phone className="w-4 h-4 text-teal-600" />
                    Contact & Emergency Notifications
                  </CardTitle>
                  <CardDescription>Primary phone, email, and designated next of kin</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <Input
                      label="Primary Phone Number"
                      required
                      value={form.phone}
                      error={errors.phone}
                      onChange={(e) => setForm({ ...form, phone: e.target.value })}
                      placeholder="+91 98765 43210"
                    />
                    <Input
                      label="Email Address (Optional)"
                      type="email"
                      value={form.email || ''}
                      onChange={(e) => setForm({ ...form, email: e.target.value })}
                      placeholder="patient@example.com"
                    />
                  </div>
                  <div className="pt-2 border-t border-slate-100 dark:border-slate-800">
                    <h4 className="text-xs font-semibold text-slate-700 dark:text-slate-300 mb-3 flex items-center gap-2">
                      <HeartHandshake className="w-3.5 h-3.5 text-rose-500" />
                      Emergency Contact Person
                    </h4>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                      <Input
                        label="Contact Name"
                        value={form.emergencyContactName || ''}
                        onChange={(e) => setForm({ ...form, emergencyContactName: e.target.value })}
                        placeholder="e.g. Sunita Gupta"
                      />
                      <Input
                        label="Relationship"
                        value={form.emergencyContactRelation || ''}
                        onChange={(e) => setForm({ ...form, emergencyContactRelation: e.target.value })}
                        placeholder="e.g. Spouse / Parent"
                      />
                      <Input
                        label="Emergency Phone"
                        value={form.emergencyContactPhone || ''}
                        onChange={(e) => setForm({ ...form, emergencyContactPhone: e.target.value })}
                        placeholder="+91 98765 43211"
                      />
                    </div>
                  </div>
                </CardContent>
              </>
            )}

            {step === 3 && (
              <>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <MapPin className="w-4 h-4 text-teal-600" />
                    Residential Address
                  </CardTitle>
                  <CardDescription>Patient permanent or current local residence</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <Input
                    label="Street Address / House No."
                    required
                    value={form.address?.street}
                    error={errors.street}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        address: { ...form.address!, street: e.target.value },
                      })
                    }
                    placeholder="e.g. Flat 302, Green Valley Apartments"
                  />
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <Input
                      label="City"
                      required
                      value={form.address?.city}
                      error={errors.city}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          address: { ...form.address!, city: e.target.value },
                        })
                      }
                      placeholder="e.g. Mumbai"
                    />
                    <Input
                      label="State"
                      required
                      value={form.address?.state}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          address: { ...form.address!, state: e.target.value },
                        })
                      }
                      placeholder="e.g. Maharashtra"
                    />
                    <Input
                      label="Postal / PIN Code"
                      required
                      value={form.address?.postalCode}
                      error={errors.postalCode}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          address: { ...form.address!, postalCode: e.target.value },
                        })
                      }
                      placeholder="e.g. 400001"
                    />
                  </div>
                </CardContent>
              </>
            )}

            {step === 4 && (
              <>
                <CardHeader>
                  <CardTitle>Review & Confirm Patient Details</CardTitle>
                  <CardDescription>
                    Verify accuracy before final UHID generation
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4 text-xs sm:text-sm">
                  <div className="grid grid-cols-2 gap-3 p-4 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800">
                    <div>
                      <span className="text-slate-500">Full Legal Name:</span>
                      <div className="font-semibold text-slate-900 dark:text-white">
                        {form.firstName} {form.lastName}
                      </div>
                    </div>
                    <div>
                      <span className="text-slate-500">Date of Birth:</span>
                      <div className="font-semibold">{form.dateOfBirth}</div>
                    </div>
                    <div>
                      <span className="text-slate-500">Gender & Blood Group:</span>
                      <div className="font-semibold">
                        {form.gender} &middot; {form.bloodGroup.replace('_', ' ')}
                      </div>
                    </div>
                    <div>
                      <span className="text-slate-500">Phone Number:</span>
                      <div className="font-semibold font-mono">{form.phone}</div>
                    </div>
                    <div className="col-span-2">
                      <span className="text-slate-500">Residential Address:</span>
                      <div className="font-semibold">
                        {form.address?.street}, {form.address?.city}, {form.address?.state} - {form.address?.postalCode}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </>
            )}

            <CardFooter>
              {step > 1 ? (
                <Button
                  variant="outline"
                  size="sm"
                  leftIcon={<ArrowLeft className="w-4 h-4" />}
                  onClick={handleBack}
                >
                  Back
                </Button>
              ) : (
                <div />
              )}
              {step < 4 ? (
                <Button
                  variant="primary"
                  size="sm"
                  rightIcon={<ArrowRight className="w-4 h-4" />}
                  onClick={handleNext}
                >
                  Continue
                </Button>
              ) : (
                <Button
                  variant="clinical"
                  size="sm"
                  isLoading={isSubmitting}
                  rightIcon={<CheckCircle2 className="w-4 h-4" />}
                  onClick={handleSubmit}
                >
                  Confirm & Generate UHID
                </Button>
              )}
            </CardFooter>
          </Card>
        </div>
      ) : (
        /* Step 5: Success Screen with prominent UHID */
        <div className="max-w-xl mx-auto p-8 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-center shadow-lg space-y-6">
          <div className="w-16 h-16 rounded-full bg-emerald-100 dark:bg-emerald-950/80 text-emerald-600 flex items-center justify-center mx-auto shadow-md shadow-emerald-500/20">
            <CheckCircle2 className="w-10 h-10" />
          </div>

          <div>
            <h2 className="text-2xl font-bold text-slate-900 dark:text-white">
              Patient Registered Successfully
            </h2>
            <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">
              The patient has been assigned a permanent Unique Hospital Identification (UHID)
            </p>
          </div>

          <div className="p-5 rounded-2xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 space-y-1">
            <div className="text-xs uppercase font-semibold tracking-wider text-slate-400">
              Unique Hospital ID (UHID)
            </div>
            <div className="text-3xl font-mono font-bold text-teal-600 dark:text-teal-400 tracking-wider">
              {registeredPatient?.uhid}
            </div>
            <div className="text-xs text-slate-600 dark:text-slate-300 font-medium pt-1">
              {registeredPatient?.firstName} {registeredPatient?.lastName} &middot; {registeredPatient?.gender} &middot; {registeredPatient?.bloodGroup.replace('_', ' ')}
            </div>
          </div>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
            <Button
              variant="outline"
              onClick={() => router.push(`/dashboard/patients/detail?id=${registeredPatient?.id}`)}
              leftIcon={<User className="w-4 h-4" />}
            >
              View Patient 360°
            </Button>
            <Button
              variant="primary"
              onClick={() => router.push(`/dashboard/appointments/new?patientId=${registeredPatient?.id}`)}
              leftIcon={<Calendar className="w-4 h-4" />}
            >
              Book Appointment
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                setStep(1);
                setRegisteredPatient(null);
                setForm({
                  firstName: '',
                  lastName: '',
                  dateOfBirth: '',
                  gender: Gender.MALE,
                  bloodGroup: BloodGroup.O_POSITIVE,
                  phone: '',
                  email: '',
                  address: { street: '', city: '', state: '', postalCode: '', country: 'India' },
                });
              }}
              leftIcon={<UserPlus className="w-4 h-4" />}
            >
              Register Another
            </Button>
          </div>
        </div>
      )}
    </AppShell>
  );
}
