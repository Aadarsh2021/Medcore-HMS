'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { AppShell } from '../../../../components/layout/AppShell';
import { PageHeader } from '../../../../components/layout/PageHeader';
import { Button } from '../../../../components/ui/Button';
import { Input } from '../../../../components/ui/Input';
import { Select } from '../../../../components/ui/Select';
import { Textarea } from '../../../../components/ui/Textarea';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '../../../../components/ui/Card';
import { Stethoscope, CheckCircle2, UserPlus } from 'lucide-react';

export default function OnboardDoctorPage() {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [form, setForm] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    specialization: 'Cardiology',
    licenseNumber: '',
    departmentId: 'dept-cardiology',
    consultationFee: 750,
    bio: '',
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.firstName || !form.lastName || !form.licenseNumber || !form.email) {
      alert('Please fill all required clinician credentials.');
      return;
    }
    setIsSubmitting(true);
    // Simulate brief network save
    setTimeout(() => {
      setIsSubmitting(false);
      router.push('/dashboard/doctors');
    }, 600);
  };

  return (
    <AppShell>
      <PageHeader
        breadcrumbs={[
          { label: 'Doctors', href: '/dashboard/doctors' },
          { label: 'Onboard Doctor' },
        ]}
        title="Clinician Onboarding & Credentialing"
        description="Provision a licensed medical specialist with verified department affiliation"
      />

      <div className="max-w-2xl mx-auto space-y-6">
        <form onSubmit={handleSubmit}>
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Stethoscope className="w-4 h-4 text-teal-600" />
                Medical Staff Profile
              </CardTitle>
              <CardDescription>Enter practitioner council credentials and OPD fee details</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Input
                  label="First Name"
                  required
                  placeholder="e.g. Arvind"
                  value={form.firstName}
                  onChange={(e) => setForm({ ...form, firstName: e.target.value })}
                />
                <Input
                  label="Last Name"
                  required
                  placeholder="e.g. Sharma"
                  value={form.lastName}
                  onChange={(e) => setForm({ ...form, lastName: e.target.value })}
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Input
                  label="Hospital Email"
                  type="email"
                  required
                  placeholder="doctor@metrogeneral.org"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                />
                <Input
                  label="Contact Phone"
                  placeholder="+91 98220 12345"
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Input
                  label="Medical Council License No."
                  required
                  placeholder="e.g. MCI-2012-88741"
                  value={form.licenseNumber}
                  onChange={(e) => setForm({ ...form, licenseNumber: e.target.value })}
                />
                <Input
                  label="OPD Consultation Fee (₹)"
                  type="number"
                  required
                  value={form.consultationFee}
                  onChange={(e) => setForm({ ...form, consultationFee: Number(e.target.value) })}
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Select
                  label="Department"
                  required
                  value={form.departmentId}
                  onChange={(e) => setForm({ ...form, departmentId: e.target.value })}
                  options={[
                    { value: 'dept-cardiology', label: 'Cardiology (CARD)' },
                    { value: 'dept-medicine', label: 'General Medicine (MED)' },
                    { value: 'dept-orthopedics', label: 'Orthopedics (ORTHO)' },
                    { value: 'dept-pediatrics', label: 'Pediatrics (PED)' },
                  ]}
                />
                <Input
                  label="Specialization"
                  required
                  placeholder="e.g. Interventional Cardiology"
                  value={form.specialization}
                  onChange={(e) => setForm({ ...form, specialization: e.target.value })}
                />
              </div>

              <Textarea
                label="Clinical Biography / Qualifications"
                rows={3}
                placeholder="e.g. MD, DM with fellowship in coronary interventions..."
                value={form.bio}
                onChange={(e) => setForm({ ...form, bio: e.target.value })}
              />
            </CardContent>
            <CardFooter>
              <Button variant="outline" size="sm" type="button" onClick={() => router.back()}>
                Cancel
              </Button>
              <Button
                variant="primary"
                size="sm"
                type="submit"
                isLoading={isSubmitting}
                leftIcon={<CheckCircle2 className="w-4 h-4" />}
              >
                Provision Doctor Profile
              </Button>
            </CardFooter>
          </Card>
        </form>
      </div>
    </AppShell>
  );
}
