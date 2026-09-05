'use client';

import React, { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '../../stores/authStore';
import {
  Activity,
  Building2,
  Calendar,
  ClipboardList,
  CreditCard,
  FileText,
  HeartPulse,
  LogOut,
  Pill,
  ShieldCheck,
  Stethoscope,
  TestTube2,
  User,
  Users,
} from 'lucide-react';
import { UserRole } from '@medcore/types';

export default function DashboardPage() {
  const router = useRouter();
  const { user, session, logout, isInitialized, init } = useAuthStore();

  useEffect(() => {
    init();
  }, [init]);

  useEffect(() => {
    if (isInitialized && !user && !session) {
      router.push('/login');
    }
  }, [isInitialized, user, session, router]);

  const handleSignOut = async () => {
    await logout();
    router.push('/login');
  };

  if (!user && !session) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950">
        <div className="text-center">
          <Activity className="w-10 h-10 text-teal-600 animate-spin mx-auto mb-3" />
          <p className="text-slate-600 dark:text-slate-400 text-sm">Loading MedCore Clinical Session...</p>
        </div>
      </div>
    );
  }

  const role = user?.role || UserRole.DOCTOR;

  const getRoleBadgeStyle = (r: UserRole) => {
    switch (r) {
      case UserRole.SUPER_ADMIN:
        return 'bg-purple-100 text-purple-800 border-purple-300 dark:bg-purple-950 dark:text-purple-300';
      case UserRole.HOSPITAL_ADMIN:
        return 'bg-blue-100 text-blue-800 border-blue-300 dark:bg-blue-950 dark:text-blue-300';
      case UserRole.DOCTOR:
        return 'bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-950 dark:text-emerald-300';
      case UserRole.NURSE:
        return 'bg-teal-100 text-teal-800 border-teal-300 dark:bg-teal-950 dark:text-teal-300';
      case UserRole.RECEPTIONIST:
        return 'bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-950 dark:text-amber-300';
      case UserRole.LAB_TECHNICIAN:
        return 'bg-cyan-100 text-cyan-800 border-cyan-300 dark:bg-cyan-950 dark:text-cyan-300';
      case UserRole.PHARMACIST:
        return 'bg-indigo-100 text-indigo-800 border-indigo-300 dark:bg-indigo-950 dark:text-indigo-300';
      case UserRole.ACCOUNTANT:
        return 'bg-orange-100 text-orange-800 border-orange-300 dark:bg-orange-950 dark:text-orange-300';
      case UserRole.PATIENT:
        return 'bg-rose-100 text-rose-800 border-rose-300 dark:bg-rose-950 dark:text-rose-300';
      default:
        return 'bg-slate-100 text-slate-800 border-slate-300 dark:bg-slate-800 dark:text-slate-300';
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100">
      {/* Navigation Header */}
      <header className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 sticky top-0 z-30 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-teal-600 flex items-center justify-center text-white shadow-md shadow-teal-600/20">
              <Activity className="w-6 h-6" />
            </div>
            <div>
              <div className="font-bold text-slate-900 dark:text-white leading-tight flex items-center gap-2">
                MedCore <span className="text-teal-600 dark:text-teal-400">HMS</span>
                <span className="text-xs px-2 py-0.5 rounded font-mono bg-teal-50 dark:bg-teal-950/60 text-teal-700 dark:text-teal-300 border border-teal-200 dark:border-teal-800">
                  Supabase Auth Active
                </span>
              </div>
              <div className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1">
                <Building2 className="w-3 h-3" />
                {user?.hospitalName || 'Metro General Hospital'}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="text-right hidden sm:block">
              <div className="text-sm font-semibold text-slate-900 dark:text-white">
                {user?.firstName} {user?.lastName}
              </div>
              <div className="text-xs text-slate-500 dark:text-slate-400">{user?.email}</div>
            </div>
            <span
              className={`text-xs px-2.5 py-1 rounded-full font-medium border ${getRoleBadgeStyle(
                role,
              )}`}
            >
              {role.replace('_', ' ')}
            </span>
            <button
              onClick={handleSignOut}
              className="p-2 rounded-lg border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 transition-colors"
              title="Sign Out"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        {/* Welcome & Security Banner */}
        <div className="p-6 rounded-2xl bg-gradient-to-r from-teal-900 via-teal-800 to-slate-900 text-white shadow-lg flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <div className="flex items-center gap-2 text-teal-300 text-xs font-semibold uppercase tracking-wider mb-1">
              <ShieldCheck className="w-4 h-4" />
              Authenticated Clinical Session
            </div>
            <h1 className="text-2xl font-bold">
              Welcome back, {user?.firstName} {user?.lastName}
            </h1>
            <p className="text-teal-100/80 text-xs sm:text-sm mt-1">
              Role permissions verified via Supabase Identity &middot; Tenant: {user?.hospitalName || 'Metro General Hospital'}
            </p>
          </div>
          <div className="bg-teal-950/70 border border-teal-700/50 p-3 rounded-xl text-xs font-mono space-y-1">
            <div className="text-teal-400">SESSION: Active</div>
            <div className="text-slate-300 truncate max-w-[260px]">UID: {user?.id}</div>
            <div className="text-slate-400">DB: PostgreSQL 16 (Mumbai)</div>
          </div>
        </div>

        {/* Dynamic Metric Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="p-5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm">
            <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
              <span className="text-xs uppercase tracking-wider font-semibold">Today's Appointments</span>
              <Calendar className="w-4 h-4 text-teal-600" />
            </div>
            <div className="text-2xl font-bold mt-2">18 Patients</div>
            <div className="text-xs text-emerald-600 dark:text-emerald-400 mt-1">↑ 4 waiting in OPD queue</div>
          </div>

          <div className="p-5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm">
            <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
              <span className="text-xs uppercase tracking-wider font-semibold">Active Inpatients</span>
              <HeartPulse className="w-4 h-4 text-blue-600" />
            </div>
            <div className="text-2xl font-bold mt-2">42 Beds</div>
            <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">Occupancy rate: 84%</div>
          </div>

          <div className="p-5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm">
            <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
              <span className="text-xs uppercase tracking-wider font-semibold">Lab Orders</span>
              <TestTube2 className="w-4 h-4 text-purple-600" />
            </div>
            <div className="text-2xl font-bold mt-2">7 Pending</div>
            <div className="text-xs text-purple-600 dark:text-purple-400 mt-1">Lipid & CBC reports ready</div>
          </div>

          <div className="p-5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm">
            <div className="flex items-center justify-between text-slate-500 dark:text-slate-400">
              <span className="text-xs uppercase tracking-wider font-semibold">Prescriptions</span>
              <Pill className="w-4 h-4 text-emerald-600" />
            </div>
            <div className="text-2xl font-bold mt-2">12 Dispensed</div>
            <div className="text-xs text-emerald-600 dark:text-emerald-400 mt-1">Pharmacy inventory synced</div>
          </div>
        </div>

        {/* Operational Modules */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold flex items-center gap-2">
                <Stethoscope className="w-5 h-5 text-teal-600" />
                Active Clinical Encounter Queue
              </h2>
              <span className="text-xs px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 font-mono">
                Live Doctor View
              </span>
            </div>

            <div className="divide-y divide-slate-100 dark:divide-slate-800 text-sm">
              <div className="py-3 flex items-center justify-between">
                <div>
                  <div className="font-semibold text-slate-900 dark:text-white">
                    Arjun Verma (38M) &middot; UHID: MGH-2025-000001
                  </div>
                  <div className="text-xs text-slate-500 dark:text-slate-400">
                    Chief Complaint: Chest discomfort, BP: 142/88 mmHg, BMI: 25.1
                  </div>
                </div>
                <span className="text-xs font-semibold px-2.5 py-1 rounded bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                  In Consultation
                </span>
              </div>

              <div className="py-3 flex items-center justify-between">
                <div>
                  <div className="font-semibold text-slate-900 dark:text-white">
                    Kavita Patel (45F) &middot; UHID: MGH-2025-000002
                  </div>
                  <div className="text-xs text-slate-500 dark:text-slate-400">
                    Follow-up: Type 2 Diabetes Mellitus, HbA1c: 7.2%
                  </div>
                </div>
                <span className="text-xs font-semibold px-2.5 py-1 rounded bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300">
                  Vitals Recorded
                </span>
              </div>
            </div>
          </div>

          <div className="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
            <h2 className="text-base font-semibold flex items-center gap-2">
              <ClipboardList className="w-5 h-5 text-teal-600" />
              Quick Actions
            </h2>
            <div className="grid grid-cols-1 gap-2.5">
              <button className="w-full text-left p-3 rounded-lg border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors flex items-center gap-3 text-xs sm:text-sm font-medium">
                <FileText className="w-4 h-4 text-teal-600" />
                <span>Start New Clinical Encounter</span>
              </button>
              <button className="w-full text-left p-3 rounded-lg border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors flex items-center gap-3 text-xs sm:text-sm font-medium">
                <Users className="w-4 h-4 text-blue-600" />
                <span>Register New Patient (UHID)</span>
              </button>
              <button className="w-full text-left p-3 rounded-lg border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors flex items-center gap-3 text-xs sm:text-sm font-medium">
                <TestTube2 className="w-4 h-4 text-purple-600" />
                <span>Order Diagnostic Lab Tests</span>
              </button>
              <button className="w-full text-left p-3 rounded-lg border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors flex items-center gap-3 text-xs sm:text-sm font-medium">
                <CreditCard className="w-4 h-4 text-emerald-600" />
                <span>Generate OPD Consultation Invoice</span>
              </button>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
