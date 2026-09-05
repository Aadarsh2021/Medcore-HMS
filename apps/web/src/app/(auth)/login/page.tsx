'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '../../../stores/authStore';
import {
  Activity,
  Shield,
  Stethoscope,
  Lock,
  Mail,
  Eye,
  EyeOff,
  Building2,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Users,
} from 'lucide-react';

const DEMO_ACCOUNTS = [
  {
    role: 'SUPER_ADMIN',
    label: 'Super Admin',
    email: 'superadmin@medcore.io',
    name: 'Dr. Vikramaditya Singhania',
    hospital: 'MedCore Global HQ',
    badgeClass: 'bg-purple-100 text-purple-800 border-purple-300 hover:bg-purple-200 dark:bg-purple-950/60 dark:text-purple-300 dark:border-purple-800',
  },
  {
    role: 'HOSPITAL_ADMIN',
    label: 'Hospital Admin',
    email: 'admin.metro@medcore.io',
    name: 'Rajesh Varma',
    hospital: 'Metro General Hospital',
    badgeClass: 'bg-blue-100 text-blue-800 border-blue-300 hover:bg-blue-200 dark:bg-blue-950/60 dark:text-blue-300 dark:border-blue-800',
  },
  {
    role: 'DOCTOR',
    label: 'Lead Cardiologist',
    email: 'dr.sharma@metrogeneral.org',
    name: 'Dr. Arvind Sharma, MD, DM',
    hospital: 'Metro General Hospital',
    badgeClass: 'bg-emerald-100 text-emerald-800 border-emerald-300 hover:bg-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800',
  },
  {
    role: 'NURSE',
    label: 'OPD Charge Nurse',
    email: 'nurse.sunita@metrogeneral.org',
    name: 'Sunita Rao, B.Sc Nursing',
    hospital: 'Metro General Hospital',
    badgeClass: 'bg-teal-100 text-teal-800 border-teal-300 hover:bg-teal-200 dark:bg-teal-950/60 dark:text-teal-300 dark:border-teal-800',
  },
  {
    role: 'RECEPTIONIST',
    label: 'Front Desk Reception',
    email: 'reception.rahul@metrogeneral.org',
    name: 'Rahul Sen',
    hospital: 'Metro General Hospital',
    badgeClass: 'bg-amber-100 text-amber-800 border-amber-300 hover:bg-amber-200 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-800',
  },
  {
    role: 'LAB_TECHNICIAN',
    label: 'Pathology Lab Tech',
    email: 'lab.tech@metrogeneral.org',
    name: 'Vikram Joshi, DMLT',
    hospital: 'Metro General Hospital',
    badgeClass: 'bg-cyan-100 text-cyan-800 border-cyan-300 hover:bg-cyan-200 dark:bg-cyan-950/60 dark:text-cyan-300 dark:border-cyan-800',
  },
  {
    role: 'PHARMACIST',
    label: 'Chief Pharmacist',
    email: 'pharmacy.priya@metrogeneral.org',
    name: 'Priya Iyer, B.Pharm',
    hospital: 'Metro General Hospital',
    badgeClass: 'bg-indigo-100 text-indigo-800 border-indigo-300 hover:bg-indigo-200 dark:bg-indigo-950/60 dark:text-indigo-300 dark:border-indigo-800',
  },
  {
    role: 'ACCOUNTANT',
    label: 'Billing Specialist',
    email: 'accounts.amit@metrogeneral.org',
    name: 'Amit Agarwal, CA Inter',
    hospital: 'Metro General Hospital',
    badgeClass: 'bg-orange-100 text-orange-800 border-orange-300 hover:bg-orange-200 dark:bg-orange-950/60 dark:text-orange-300 dark:border-orange-800',
  },
  {
    role: 'PATIENT',
    label: 'Patient (OPD)',
    email: 'patient.arjun@gmail.com',
    name: 'Arjun Verma (UHID: MGH-2025-000001)',
    hospital: 'Metro General Hospital',
    badgeClass: 'bg-rose-100 text-rose-800 border-rose-300 hover:bg-rose-200 dark:bg-rose-950/60 dark:text-rose-300 dark:border-rose-800',
  },
];

export default function LoginPage() {
  const router = useRouter();
  const { user, login, isLoading, error, clearError, init } = useAuthStore();

  const [email, setEmail] = useState('dr.sharma@metrogeneral.org');
  const [password, setPassword] = useState('Password123!');
  const [showPassword, setShowPassword] = useState(false);
  const [activeRoleLabel, setActiveRoleLabel] = useState('Lead Cardiologist');

  useEffect(() => {
    init();
  }, [init]);

  useEffect(() => {
    if (user) {
      router.push('/dashboard');
    }
  }, [user, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    clearError();
    const ok = await login(email, password);
    if (ok) {
      router.push('/dashboard');
    }
  };

  const handleSelectDemo = (account: typeof DEMO_ACCOUNTS[0]) => {
    setEmail(account.email);
    setPassword('Password123!');
    setActiveRoleLabel(account.label);
    clearError();
  };

  return (
    <div className="min-h-screen flex flex-col justify-center py-12 px-4 sm:px-6 lg:px-8 bg-gradient-to-br from-slate-50 via-slate-100 to-teal-50/40 dark:from-slate-950 dark:via-slate-900 dark:to-emerald-950/20 text-slate-900 dark:text-slate-100">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <div className="flex justify-center items-center gap-3 mb-2">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-tr from-teal-600 to-emerald-500 flex items-center justify-center shadow-lg shadow-teal-500/20 text-white">
            <Activity className="w-7 h-7" />
          </div>
          <span className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
            MedCore <span className="text-teal-600 dark:text-teal-400">HMS</span>
          </span>
        </div>
        <h2 className="text-center text-xl font-semibold text-slate-800 dark:text-slate-200">
          Clinical Portal Sign In
        </h2>
        <p className="mt-1 text-center text-xs text-slate-500 dark:text-slate-400 flex items-center justify-center gap-1.5">
          <Shield className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400 inline" />
          HIPAA Compliant &middot; Supabase Identity &middot; 9-Role Access
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-2xl">
        <div className="bg-white dark:bg-slate-900 py-8 px-6 shadow-xl shadow-slate-200/50 dark:shadow-black/40 border border-slate-200 dark:border-slate-800 sm:rounded-2xl sm:px-10">
          {/* Demo Account Quick-Fill Selector */}
          <div className="mb-6 p-4 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                <Users className="w-4 h-4 text-teal-600" />
                1-Click Role Quick Fill
              </span>
              <span className="text-[11px] text-slate-500 dark:text-slate-400 font-mono">
                Password: Password123!
              </span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {DEMO_ACCOUNTS.map((acc) => {
                const isSelected = email === acc.email;
                return (
                  <button
                    key={acc.role}
                    type="button"
                    onClick={() => handleSelectDemo(acc)}
                    className={`text-left p-2.5 rounded-lg border text-xs transition-all duration-150 ${
                      isSelected
                        ? 'ring-2 ring-teal-500 border-teal-500 bg-teal-50/70 dark:bg-teal-950/50 shadow-sm'
                        : `${acc.badgeClass}`
                    }`}
                  >
                    <div className="font-semibold truncate flex items-center justify-between">
                      <span>{acc.label}</span>
                      {isSelected && <CheckCircle2 className="w-3.5 h-3.5 text-teal-600 shrink-0" />}
                    </div>
                    <div className="text-[11px] opacity-75 truncate">{acc.email}</div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Error Message */}
          {error && (
            <div className="mb-6 p-3.5 rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800/80 flex items-start gap-2.5 text-rose-700 dark:text-rose-300 text-sm">
              <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
              <div className="flex-1 text-xs sm:text-sm">{error}</div>
            </div>
          )}

          {/* Form */}
          <form className="space-y-5" onSubmit={handleSubmit}>
            <div>
              <label
                htmlFor="email"
                className="block text-xs font-medium text-slate-700 dark:text-slate-300"
              >
                Work / Patient Email
              </label>
              <div className="mt-1 relative rounded-md shadow-sm">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                  <Mail className="h-4 w-4" />
                </div>
                <input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="block w-full pl-10 pr-3 py-2 text-sm border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent transition-colors"
                  placeholder="doctor@hospital.org"
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between">
                <label
                  htmlFor="password"
                  className="block text-xs font-medium text-slate-700 dark:text-slate-300"
                >
                  Password
                </label>
                <span className="text-[11px] text-teal-600 dark:text-teal-400">
                  Active Role: {activeRoleLabel}
                </span>
              </div>
              <div className="mt-1 relative rounded-md shadow-sm">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                  <Lock className="h-4 w-4" />
                </div>
                <input
                  id="password"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="block w-full pl-10 pr-10 py-2 text-sm border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent transition-colors"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
            </div>

            <div>
              <button
                type="submit"
                disabled={isLoading}
                className="w-full flex justify-center items-center py-2.5 px-4 border border-transparent rounded-lg shadow-md text-sm font-medium text-white bg-gradient-to-r from-teal-600 to-emerald-600 hover:from-teal-700 hover:to-emerald-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-teal-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-150"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Authenticating with Supabase...
                  </>
                ) : (
                  <>
                    <Stethoscope className="w-4 h-4 mr-2" />
                    Access Clinical Dashboard
                  </>
                )}
              </button>
            </div>
          </form>

          {/* Multi-Tenancy Assurance Banner */}
          <div className="mt-6 pt-5 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span className="flex items-center gap-1.5">
              <Building2 className="w-4 h-4 text-teal-600" />
              Tenant: Metro General Hospital (MGH-MUM)
            </span>
            <span className="font-mono text-[11px] bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded">
              ap-south-1 &middot; PostgreSQL 16
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
