'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '../../../stores/authStore';
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  Building2,
  Calendar,
  CheckCircle2,
  Clock,
  FileText,
  FileUp,
  History,
  Lock,
  Plus,
  Save,
  ShieldAlert,
  ShieldCheck,
  Stethoscope,
  Trash2,
  User,
  XCircle,
} from 'lucide-react';
import {
  EncounterStatus,
  DiagnosisType,
  AllergySeverity,
  AmendmentType,
  AmendmentSection,
} from '@medcore/types';
import { PrescriptionSection } from '../../../components/clinical/PrescriptionSection';

interface VitalForm {
  bpSystolic: string;
  bpDiastolic: string;
  heartRate: string;
  respiratoryRate: string;
  temperature: string;
  spo2: string;
  heightCm: string;
  weightKg: string;
}

interface DiagnosisItem {
  code: string;
  description: string;
  type: DiagnosisType;
  isPrimary: boolean;
}

interface AmendmentItem {
  id: string;
  amendmentNumber: number;
  reason: string;
  section: AmendmentSection;
  amendmentType: AmendmentType;
  createdAt: string;
  amendedBy: {
    fullName: string;
    licenseNumber: string;
  };
  previousValueJson: any;
  newValueJson: any;
}

export default function DoctorClinicalWorkspacePage() {
  const router = useRouter();
  const { user, session, isInitialized, init } = useAuthStore();

  // Encounter state
  const [encounterStatus, setEncounterStatus] = useState<EncounterStatus>(
    EncounterStatus.IN_PROGRESS,
  );
  const [isCompleted, setIsCompleted] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Patient Demographic Banner state
  const patient = {
    fullName: 'Arjun Verma',
    uhid: 'MGH-2025-000001',
    age: 38,
    gender: 'Male',
    bloodGroup: 'B+',
    allergies: [
      { allergen: 'Penicillin', reaction: 'Anaphylaxis', severity: AllergySeverity.SEVERE },
      { allergen: 'Sulfa Drugs', reaction: 'Skin Rash', severity: AllergySeverity.MODERATE },
    ],
  };

  // Vitals State
  const [vitals, setVitals] = useState<VitalForm>({
    bpSystolic: '120',
    bpDiastolic: '80',
    heartRate: '72',
    respiratoryRate: '16',
    temperature: '98.6',
    spo2: '99',
    heightCm: '178',
    weightKg: '75',
  });

  // Client-calculated BMI preview (Canonical computed on server)
  const computedBmi = React.useMemo(() => {
    const h = parseFloat(vitals.heightCm);
    const w = parseFloat(vitals.weightKg);
    if (!h || !w || h <= 0 || w <= 0) return null;
    const heightM = h / 100;
    return (w / (heightM * heightM)).toFixed(1);
  }, [vitals.heightCm, vitals.weightKg]);

  // Clinical Documentation State
  const [chiefComplaint, setChiefComplaint] = useState(
    'Persistent chest tightness and mild dyspnea on exertion for 3 days.',
  );
  const [presentingSymptoms, setPresentingSymptoms] = useState(
    'Discomfort radiates intermittently to left shoulder, exacerbated by climbing stairs. Relieved by rest.',
  );
  const [clinicalNotes, setClinicalNotes] = useState(
    'Cardiovascular examination unremarkable. S1/S2 audible, no murmurs or gallops. Chest clear to auscultation bilaterally.',
  );
  const [treatmentPlan, setTreatmentPlan] = useState(
    '1. 12-lead ECG stat\n2. Serum Troponin-I and Lipid Panel\n3. Tab. Aspirin 75mg PO OD\n4. Tab. Atorvastatin 20mg PO HS\n5. Cardiology consultation if enzymes elevated',
  );
  const [followUpDate, setFollowUpDate] = useState('2026-09-12');

  // Diagnoses State
  const [diagnoses, setDiagnoses] = useState<DiagnosisItem[]>([
    {
      code: 'I20.9',
      description: 'Angina pectoris, unspecified',
      type: DiagnosisType.PROVISIONAL,
      isPrimary: true,
    },
  ]);

  const [newDiagnosis, setNewDiagnosis] = useState<DiagnosisItem>({
    code: '',
    description: '',
    type: DiagnosisType.CONFIRMED,
    isPrimary: false,
  });

  // Attachments State
  const [attachments, setAttachments] = useState<
    Array<{ name: string; size: number; mime: string; uploadedAt: string }>
  >([
    {
      name: 'ECG_Baseline_Lead12.pdf',
      size: 1420500,
      mime: 'application/pdf',
      uploadedAt: '2026-09-05 16:45',
    },
  ]);
  const [uploadError, setUploadError] = useState<string | null>(null);

  // Amendments State & Modal
  const [amendments, setAmendments] = useState<AmendmentItem[]>([]);
  const [isAmendmentModalOpen, setIsAmendmentModalOpen] = useState(false);
  const [amendmentReason, setAmendmentReason] = useState('');
  const [amendmentSection, setAmendmentSection] = useState<AmendmentSection>(
    AmendmentSection.TREATMENT_PLAN,
  );
  const [amendmentType, setAmendmentType] = useState<AmendmentType>(AmendmentType.CORRECTION);
  const [amendmentNewContent, setAmendmentNewContent] = useState('');

  useEffect(() => {
    init();
  }, [init]);

  const handleAddDiagnosis = () => {
    if (!newDiagnosis.description.trim()) return;
    setDiagnoses([...diagnoses, newDiagnosis]);
    setNewDiagnosis({
      code: '',
      description: '',
      type: DiagnosisType.CONFIRMED,
      isPrimary: false,
    });
  };

  const handleRemoveDiagnosis = (index: number) => {
    if (isCompleted) return;
    setDiagnoses(diagnoses.filter((_, i) => i !== index));
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Check size limit: 20 MB = 20 * 1024 * 1024 bytes
    if (file.size > 20 * 1024 * 1024) {
      setUploadError('Attachment exceeds maximum allowed size of 20 MB.');
      return;
    }

    // Check MIME whitelist
    const allowedMime = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];
    if (!allowedMime.includes(file.type)) {
      setUploadError('Invalid MIME type. Only PDF, JPEG, PNG, and WebP files are allowed.');
      return;
    }

    setUploadError(null);
    setAttachments([
      ...attachments,
      {
        name: file.name,
        size: file.size,
        mime: file.type,
        uploadedAt: new Date().toISOString().replace('T', ' ').substring(0, 16),
      },
    ]);
  };

  // Complete Encounter (Atomic Finalization)
  const handleCompleteEncounter = () => {
    if (chiefComplaint.trim().length < 3) {
      setErrorMessage('Chief complaint must contain at least 3 characters.');
      return;
    }
    if (diagnoses.length === 0) {
      setErrorMessage('Encounter requires at least one recorded diagnosis to finalize.');
      return;
    }

    setSaveStatus('saving');
    setTimeout(() => {
      setIsCompleted(true);
      setEncounterStatus(EncounterStatus.COMPLETED);
      setSaveStatus('saved');
      setErrorMessage(null);
    }, 600);
  };

  // Submit Additive Amendment
  const handleCreateAmendment = () => {
    if (!amendmentReason.trim() || amendmentReason.length < 5) {
      setErrorMessage('Amendment reason must be at least 5 characters long.');
      return;
    }
    if (!amendmentNewContent.trim()) {
      setErrorMessage('Amendment content cannot be empty.');
      return;
    }

    const newAmendment: AmendmentItem = {
      id: `amend-${Date.now()}`,
      amendmentNumber: amendments.length + 1,
      reason: amendmentReason,
      section: amendmentSection,
      amendmentType,
      createdAt: new Date().toISOString(),
      amendedBy: {
        fullName: `${user?.firstName || 'Dr. Ananya'} ${user?.lastName || 'Iyer'}`,
        licenseNumber: 'MCI-2018-78901',
      },
      previousValueJson: { section: amendmentSection, snapshot: treatmentPlan },
      newValueJson: { content: amendmentNewContent },
    };

    setAmendments([...amendments, newAmendment]);
    setIsAmendmentModalOpen(false);
    setAmendmentReason('');
    setAmendmentNewContent('');
    setErrorMessage(null);
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 pb-16">
      {/* Header Bar */}
      <header className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 sticky top-0 z-30 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => router.push('/dashboard')}
              className="p-2 rounded-lg border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 transition-colors"
              title="Return to Dashboard"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <div className="w-9 h-9 rounded-lg bg-teal-600 flex items-center justify-center text-white shadow-md shadow-teal-600/20">
              <Stethoscope className="w-5 h-5" />
            </div>
            <div>
              <div className="font-bold text-slate-900 dark:text-white leading-tight flex items-center gap-2 text-sm sm:text-base">
                Doctor Clinical Workspace
                {isCompleted ? (
                  <span className="text-xs px-2 py-0.5 rounded font-medium bg-purple-100 text-purple-800 dark:bg-purple-950/80 dark:text-purple-300 border border-purple-300 dark:border-purple-800 flex items-center gap-1">
                    <Lock className="w-3 h-3" /> Finalized & Immutable
                  </span>
                ) : (
                  <span className="text-xs px-2 py-0.5 rounded font-medium bg-emerald-100 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800 flex items-center gap-1">
                    <Clock className="w-3 h-3" /> Encounter In Progress
                  </span>
                )}
              </div>
              <div className="text-xs text-slate-500 dark:text-slate-400">
                Phase 5 EMR &middot; Tenant: {user?.hospitalName || 'Metro General Hospital'}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {isCompleted ? (
              <button
                onClick={() => setIsAmendmentModalOpen(true)}
                className="px-4 py-2 rounded-lg bg-purple-600 hover:bg-purple-700 text-white text-xs sm:text-sm font-medium flex items-center gap-2 shadow-sm transition-colors"
              >
                <History className="w-4 h-4" />
                Add Amendment ({amendments.length})
              </button>
            ) : (
              <>
                <button
                  onClick={() => {
                    setSaveStatus('saving');
                    setTimeout(() => setSaveStatus('saved'), 400);
                  }}
                  className="px-3.5 py-2 rounded-lg border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs sm:text-sm font-medium flex items-center gap-2 transition-colors"
                >
                  <Save className="w-4 h-4" />
                  Save Draft
                </button>
                <button
                  onClick={handleCompleteEncounter}
                  className="px-4 py-2 rounded-lg bg-teal-600 hover:bg-teal-700 text-white text-xs sm:text-sm font-semibold flex items-center gap-2 shadow-sm transition-colors"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  Finalize Encounter
                </button>
              </>
            )}
          </div>
        </div>
      </header>

      {/* Main Workspace Container */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        {errorMessage && (
          <div className="p-4 rounded-xl bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-900 text-rose-800 dark:text-rose-200 text-sm flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-rose-600" />
              <span>{errorMessage}</span>
            </div>
            <button onClick={() => setErrorMessage(null)} className="text-xs font-semibold underline">
              Dismiss
            </button>
          </div>
        )}

        {/* 1. Patient Demographic & Safety Banner */}
        <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-teal-50 dark:bg-teal-950/60 border border-teal-200 dark:border-teal-800 flex items-center justify-center text-teal-700 dark:text-teal-300 font-bold text-lg">
              AV
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold text-slate-900 dark:text-white">
                  {patient.fullName}
                </h1>
                <span className="text-xs font-mono px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                  UHID: {patient.uhid}
                </span>
              </div>
              <div className="text-xs text-slate-500 dark:text-slate-400 mt-1 flex items-center gap-3">
                <span>
                  {patient.age} yrs &middot; {patient.gender}
                </span>
                <span>&bull;</span>
                <span>Blood Group: <strong className="text-slate-700 dark:text-slate-200">{patient.bloodGroup}</strong></span>
                <span>&bull;</span>
                <span>Encounter ID: enc-7890-mgh</span>
              </div>
            </div>
          </div>

          {/* Active Allergy Badges */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 flex items-center gap-1 mr-1">
              <ShieldAlert className="w-3.5 h-3.5 text-rose-500" /> Allergies:
            </span>
            {patient.allergies.map((all, idx) => (
              <span
                key={idx}
                className="text-xs px-2.5 py-1 rounded-full font-medium bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300 border border-rose-300 dark:border-rose-800 flex items-center gap-1.5"
              >
                <strong>{all.allergen}</strong> ({all.reaction} - {all.severity})
              </span>
            ))}
          </div>
        </div>

        {/* 2. Clinical Vitals Grid with Server BMI notice */}
        <div className="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold flex items-center gap-2">
              <Activity className="w-5 h-5 text-teal-600" />
              Patient Vitals & Anthropometrics
            </h2>
            <div className="text-xs text-slate-500 dark:text-slate-400 italic">
              * Canonical BMI is strictly computed server-side from height and weight
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3 text-xs">
            <div>
              <label className="text-slate-500 block mb-1">BP Systolic</label>
              <div className="flex items-center">
                <input
                  type="number"
                  disabled={isCompleted}
                  value={vitals.bpSystolic}
                  onChange={(e) => setVitals({ ...vitals, bpSystolic: e.target.value })}
                  className="w-full p-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 disabled:opacity-75 font-mono text-sm"
                />
                <span className="ml-1 text-slate-400">mmHg</span>
              </div>
            </div>

            <div>
              <label className="text-slate-500 block mb-1">BP Diastolic</label>
              <div className="flex items-center">
                <input
                  type="number"
                  disabled={isCompleted}
                  value={vitals.bpDiastolic}
                  onChange={(e) => setVitals({ ...vitals, bpDiastolic: e.target.value })}
                  className="w-full p-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 disabled:opacity-75 font-mono text-sm"
                />
                <span className="ml-1 text-slate-400">mmHg</span>
              </div>
            </div>

            <div>
              <label className="text-slate-500 block mb-1">Pulse</label>
              <div className="flex items-center">
                <input
                  type="number"
                  disabled={isCompleted}
                  value={vitals.heartRate}
                  onChange={(e) => setVitals({ ...vitals, heartRate: e.target.value })}
                  className="w-full p-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 disabled:opacity-75 font-mono text-sm"
                />
                <span className="ml-1 text-slate-400">bpm</span>
              </div>
            </div>

            <div>
              <label className="text-slate-500 block mb-1">Resp Rate</label>
              <div className="flex items-center">
                <input
                  type="number"
                  disabled={isCompleted}
                  value={vitals.respiratoryRate}
                  onChange={(e) => setVitals({ ...vitals, respiratoryRate: e.target.value })}
                  className="w-full p-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 disabled:opacity-75 font-mono text-sm"
                />
                <span className="ml-1 text-slate-400">/min</span>
              </div>
            </div>

            <div>
              <label className="text-slate-500 block mb-1">Temp</label>
              <div className="flex items-center">
                <input
                  type="number"
                  step="0.1"
                  disabled={isCompleted}
                  value={vitals.temperature}
                  onChange={(e) => setVitals({ ...vitals, temperature: e.target.value })}
                  className="w-full p-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 disabled:opacity-75 font-mono text-sm"
                />
                <span className="ml-1 text-slate-400">&deg;F</span>
              </div>
            </div>

            <div>
              <label className="text-slate-500 block mb-1">SpO2</label>
              <div className="flex items-center">
                <input
                  type="number"
                  disabled={isCompleted}
                  value={vitals.spo2}
                  onChange={(e) => setVitals({ ...vitals, spo2: e.target.value })}
                  className="w-full p-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 disabled:opacity-75 font-mono text-sm"
                />
                <span className="ml-1 text-slate-400">%</span>
              </div>
            </div>

            <div>
              <label className="text-slate-500 block mb-1">Height</label>
              <div className="flex items-center">
                <input
                  type="number"
                  disabled={isCompleted}
                  value={vitals.heightCm}
                  onChange={(e) => setVitals({ ...vitals, heightCm: e.target.value })}
                  className="w-full p-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 disabled:opacity-75 font-mono text-sm"
                />
                <span className="ml-1 text-slate-400">cm</span>
              </div>
            </div>

            <div>
              <label className="text-slate-500 block mb-1">Weight & BMI</label>
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  step="0.1"
                  disabled={isCompleted}
                  value={vitals.weightKg}
                  onChange={(e) => setVitals({ ...vitals, weightKg: e.target.value })}
                  className="w-16 p-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 disabled:opacity-75 font-mono text-sm"
                />
                <span className="p-1.5 px-2 rounded bg-teal-50 dark:bg-teal-950/80 text-teal-700 dark:text-teal-300 font-bold border border-teal-200 dark:border-teal-800">
                  {computedBmi || '--'}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* 3. Two-Column Workspace: Documentation & Diagnoses */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Clinical Documentation (7 cols) */}
          <div className="lg:col-span-7 space-y-6">
            <div className="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
              <h2 className="text-base font-semibold flex items-center gap-2">
                <FileText className="w-5 h-5 text-teal-600" />
                Encounter Documentation
              </h2>

              <div className="space-y-3">
                <div>
                  <label className="text-xs font-semibold text-slate-600 dark:text-slate-300 block mb-1">
                    Chief Complaint <span className="text-rose-500">*</span>
                  </label>
                  <textarea
                    rows={2}
                    disabled={isCompleted}
                    value={chiefComplaint}
                    onChange={(e) => setChiefComplaint(e.target.value)}
                    placeholder="Primary reason for visit (minimum 3 characters)..."
                    className="w-full p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm disabled:opacity-75 focus:outline-none focus:ring-2 focus:ring-teal-500/30"
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-600 dark:text-slate-300 block mb-1">
                    Presenting Symptoms & History of Present Illness
                  </label>
                  <textarea
                    rows={3}
                    disabled={isCompleted}
                    value={presentingSymptoms}
                    onChange={(e) => setPresentingSymptoms(e.target.value)}
                    className="w-full p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm disabled:opacity-75 focus:outline-none focus:ring-2 focus:ring-teal-500/30"
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-600 dark:text-slate-300 block mb-1">
                    Clinical Examination & Findings
                  </label>
                  <textarea
                    rows={3}
                    disabled={isCompleted}
                    value={clinicalNotes}
                    onChange={(e) => setClinicalNotes(e.target.value)}
                    className="w-full p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm disabled:opacity-75 focus:outline-none focus:ring-2 focus:ring-teal-500/30"
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-600 dark:text-slate-300 block mb-1">
                    Treatment Plan & Orders
                  </label>
                  <textarea
                    rows={3}
                    disabled={isCompleted}
                    value={treatmentPlan}
                    onChange={(e) => setTreatmentPlan(e.target.value)}
                    className="w-full p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm disabled:opacity-75 focus:outline-none focus:ring-2 focus:ring-teal-500/30"
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-600 dark:text-slate-300 block mb-1">
                    Advisory Follow-Up Date
                  </label>
                  <div className="flex items-center gap-2 max-w-xs">
                    <Calendar className="w-4 h-4 text-slate-400" />
                    <input
                      type="date"
                      disabled={isCompleted}
                      value={followUpDate}
                      onChange={(e) => setFollowUpDate(e.target.value)}
                      className="p-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-mono disabled:opacity-75"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Electronic Prescription Management & Medication Orders (Phase 6) */}
            <PrescriptionSection
              encounterId="enc-7890-mgh"
              doctorLicenseNumber={user?.role === 'DOCTOR' ? 'MCI-2018-78901' : 'MCI-2018-78901'}
              doctorName={`${user?.firstName || 'Dr. Ananya'} ${user?.lastName || 'Iyer'}`}
              isEncounterCompleted={isCompleted}
            />
          </div>

          {/* Diagnoses, Attachments & Amendments (5 cols) */}
          <div className="lg:col-span-5 space-y-6">
            {/* Diagnoses Card */}
            <div className="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-base font-semibold flex items-center gap-2">
                  <Activity className="w-5 h-5 text-teal-600" />
                  ICD-10 Diagnoses <span className="text-rose-500">*</span>
                </h2>
                <span className="text-xs text-slate-400 font-mono">
                  {diagnoses.length} recorded
                </span>
              </div>

              <div className="space-y-2">
                {diagnoses.map((diag, index) => (
                  <div
                    key={index}
                    className="p-3 rounded-xl border border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 flex items-start justify-between gap-3 text-xs"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        {diag.code && (
                          <span className="font-mono font-bold text-teal-600 dark:text-teal-400">
                            [{diag.code}]
                          </span>
                        )}
                        <span className="font-medium text-slate-900 dark:text-white">
                          {diag.description}
                        </span>
                      </div>
                      <div className="mt-1 flex items-center gap-2">
                        <span
                          className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                            diag.type === DiagnosisType.CONFIRMED
                              ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                              : 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                          }`}
                        >
                          {diag.type}
                        </span>
                        {diag.isPrimary && (
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300">
                            Primary
                          </span>
                        )}
                      </div>
                    </div>
                    {!isCompleted && (
                      <button
                        onClick={() => handleRemoveDiagnosis(index)}
                        className="text-slate-400 hover:text-rose-500 transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                ))}

                {!isCompleted && (
                  <div className="pt-2 border-t border-slate-100 dark:border-slate-800 space-y-2">
                    <div className="grid grid-cols-3 gap-2">
                      <input
                        type="text"
                        placeholder="ICD Code"
                        value={newDiagnosis.code}
                        onChange={(e) =>
                          setNewDiagnosis({ ...newDiagnosis, code: e.target.value.toUpperCase() })
                        }
                        className="p-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-mono"
                      />
                      <input
                        type="text"
                        placeholder="Condition description"
                        value={newDiagnosis.description}
                        onChange={(e) =>
                          setNewDiagnosis({ ...newDiagnosis, description: e.target.value })
                        }
                        className="col-span-2 p-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs"
                      />
                    </div>
                    <div className="flex items-center justify-between">
                      <label className="flex items-center gap-1.5 text-xs text-slate-500">
                        <input
                          type="checkbox"
                          checked={newDiagnosis.isPrimary}
                          onChange={(e) =>
                            setNewDiagnosis({ ...newDiagnosis, isPrimary: e.target.checked })
                          }
                          className="rounded border-slate-300 text-teal-600 focus:ring-teal-500"
                        />
                        Primary Diagnosis
                      </label>
                      <button
                        onClick={handleAddDiagnosis}
                        disabled={!newDiagnosis.description.trim()}
                        className="px-3 py-1.5 rounded-lg bg-teal-600 text-white text-xs font-medium hover:bg-teal-700 disabled:opacity-50 transition-colors flex items-center gap-1"
                      >
                        <Plus className="w-3.5 h-3.5" /> Add
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* S3 Clinical Attachments Card */}
            <div className="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-base font-semibold flex items-center gap-2">
                  <FileUp className="w-5 h-5 text-teal-600" />
                  Clinical Attachments (S3)
                </h2>
                <span className="text-xs text-slate-400 font-mono">Max 20 MB</span>
              </div>

              {uploadError && (
                <div className="p-2 rounded bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-300 text-xs">
                  {uploadError}
                </div>
              )}

              <div className="space-y-2">
                {attachments.map((att, i) => (
                  <div
                    key={i}
                    className="p-2.5 rounded-xl border border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 flex items-center justify-between text-xs"
                  >
                    <div className="truncate max-w-[240px]">
                      <div className="font-medium text-slate-900 dark:text-white truncate">
                        {att.name}
                      </div>
                      <div className="text-[10px] text-slate-400 font-mono">
                        {(att.size / 1024 / 1024).toFixed(2)} MB &middot; {att.mime}
                      </div>
                    </div>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-50 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800">
                      S3 Encrypted
                    </span>
                  </div>
                ))}

                {!isCompleted && (
                  <label className="mt-2 block cursor-pointer text-center p-3 rounded-xl border border-dashed border-slate-300 dark:border-slate-700 hover:border-teal-500 hover:bg-teal-50/20 transition-all text-xs text-slate-500 dark:text-slate-400">
                    <input
                      type="file"
                      className="hidden"
                      accept=".pdf,.png,.jpg,.jpeg,.webp"
                      onChange={handleFileUpload}
                    />
                    <span className="font-medium text-teal-600 dark:text-teal-400">
                      Click to upload attachment
                    </span>
                    <span className="block text-[10px] text-slate-400 mt-0.5">
                      PDF, JPEG, PNG, WebP (Pre-signed 15-min upload)
                    </span>
                  </label>
                )}
              </div>
            </div>

            {/* Additive Amendments History Log */}
            {amendments.length > 0 && (
              <div className="p-6 rounded-2xl bg-purple-50/50 dark:bg-purple-950/20 border border-purple-200 dark:border-purple-900 shadow-sm space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-base font-semibold flex items-center gap-2 text-purple-900 dark:text-purple-200">
                    <History className="w-5 h-5 text-purple-600" />
                    Additive Amendment History ({amendments.length})
                  </h2>
                </div>

                <div className="space-y-3">
                  {amendments.map((am) => (
                    <div
                      key={am.id}
                      className="p-3 rounded-xl bg-white dark:bg-slate-900 border border-purple-200 dark:border-purple-800 text-xs space-y-1.5"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-purple-700 dark:text-purple-300">
                          Amendment #{am.amendmentNumber} &middot; {am.section}
                        </span>
                        <span className="text-[10px] font-mono text-slate-400">
                          {am.createdAt.substring(0, 16).replace('T', ' ')}
                        </span>
                      </div>
                      <p className="text-slate-600 dark:text-slate-300 italic">
                        &quot;{am.reason}&quot;
                      </p>
                      <div className="p-2 rounded bg-slate-50 dark:bg-slate-800/80 font-mono text-[11px] text-slate-700 dark:text-slate-200 whitespace-pre-wrap">
                        {am.newValueJson.content}
                      </div>
                      <div className="text-[10px] text-slate-400 text-right">
                        Amended by: {am.amendedBy.fullName} ({am.amendedBy.licenseNumber})
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Additive Amendment Modal */}
      {isAmendmentModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl max-w-lg w-full p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <History className="w-5 h-5 text-purple-600" />
                Add Additive Historical Amendment
              </h3>
              <button
                onClick={() => setIsAmendmentModalOpen(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <XCircle className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-slate-500 dark:text-slate-400">
              Original finalized clinical records are immutable. This action records an append-only
              audit trail item with your clinician attribution.
            </p>

            <div className="space-y-3 text-xs">
              <div>
                <label className="font-semibold block mb-1">Target Section</label>
                <select
                  value={amendmentSection}
                  onChange={(e) => setAmendmentSection(e.target.value as AmendmentSection)}
                  className="w-full p-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                >
                  <option value={AmendmentSection.TREATMENT_PLAN}>Treatment Plan</option>
                  <option value={AmendmentSection.CLINICAL_NOTES}>Clinical Notes</option>
                  <option value={AmendmentSection.DIAGNOSIS}>Diagnosis</option>
                  <option value={AmendmentSection.OTHER}>Other</option>
                </select>
              </div>

              <div>
                <label className="font-semibold block mb-1">Clinical Justification / Reason *</label>
                <input
                  type="text"
                  placeholder="Reason for amendment (min 5 characters)..."
                  value={amendmentReason}
                  onChange={(e) => setAmendmentReason(e.target.value)}
                  className="w-full p-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                />
              </div>

              <div>
                <label className="font-semibold block mb-1">Additive Amendment Content *</label>
                <textarea
                  rows={4}
                  placeholder="Enter amendment details, revised therapy, or newly obtained lab correlation..."
                  value={amendmentNewContent}
                  onChange={(e) => setAmendmentNewContent(e.target.value)}
                  className="w-full p-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100 dark:border-slate-800">
              <button
                onClick={() => setIsAmendmentModalOpen(false)}
                className="px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-xs font-medium hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateAmendment}
                className="px-4 py-2 rounded-lg bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold transition-colors shadow-sm"
              >
                Sign & Append Amendment
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
