import Link from 'next/link';
import { 
  Building2, 
  Stethoscope, 
  UserCheck, 
  Pill, 
  FlaskConical, 
  Receipt, 
  ShieldCheck, 
  Activity,
  CalendarCheck,
  CheckCircle2
} from 'lucide-react';

export default function HomePage() {
  const roles = [
    { title: 'Super Admin', desc: 'Cross-tenant oversight, hospital onboarding & analytics', href: '/admin/super', icon: ShieldCheck, color: 'text-purple-600 bg-purple-50' },
    { title: 'Hospital Admin', desc: 'Departments, staff, beds, operational KPIs & billing config', href: '/admin/hospital', icon: Building2, color: 'text-blue-600 bg-blue-50' },
    { title: 'Doctor Workspace', desc: 'Queue, clinical EMR, ICD-10 diagnoses & digital prescriptions', href: '/doctor', icon: Stethoscope, color: 'text-teal-600 bg-teal-50' },
    { title: 'Nurse / Triage', desc: 'Patient check-in, vitals measurement & automated BMI', href: '/nurse', icon: Activity, color: 'text-emerald-600 bg-emerald-50' },
    { title: 'Reception Counter', desc: 'Patient registration, concurrency-safe scheduling & intake', href: '/receptionist', icon: CalendarCheck, color: 'text-sky-600 bg-sky-50' },
    { title: 'Pharmacy Hub', desc: 'Prescription fulfillment, FIFO batch dispensing & low-stock alerts', href: '/pharmacy', icon: Pill, color: 'text-amber-600 bg-amber-50' },
    { title: 'Laboratory', desc: 'Specimen intake, structured result entry & reference ranges', href: '/lab', icon: FlaskConical, color: 'text-indigo-600 bg-indigo-50' },
    { title: 'Billing & Cashier', desc: 'Itemized invoices, insurance claims & digital payments', href: '/billing', icon: Receipt, color: 'text-rose-600 bg-rose-50' },
    { title: 'Patient Portal', desc: 'Book slots, view records, download lab reports & pay bills', href: '/portal', icon: UserCheck, color: 'text-cyan-600 bg-cyan-50' },
  ];

  return (
    <main className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="border-b bg-white/80 backdrop-blur sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-teal-600 flex items-center justify-center text-white font-bold text-lg shadow-sm">
              M+
            </div>
            <div>
              <span className="font-bold text-slate-900 text-lg tracking-tight">MedCore HMS</span>
              <span className="ml-2 text-xs px-2 py-0.5 rounded-full font-medium bg-teal-100 text-teal-800">
                v1.0 Production
              </span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href="/login"
              className="px-4 py-2 text-sm font-medium text-slate-700 hover:text-slate-900 transition"
            >
              Sign In
            </Link>
            <Link
              href="/portal"
              className="px-4 py-2 text-sm font-medium text-white bg-teal-600 hover:bg-teal-700 rounded-md transition shadow-sm"
            >
              Patient Portal
            </Link>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="py-16 px-6 max-w-7xl mx-auto">
        <div className="max-w-3xl">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 mb-4">
            <CheckCircle2 className="w-3.5 h-3.5" />
            Milestone 1 Active: PostgreSQL 16 3NF Relational Architecture
          </div>
          <h1 className="text-4xl font-extrabold text-slate-900 tracking-tight sm:text-5xl">
            Enterprise Clinical & Hospital Management Platform
          </h1>
          <p className="mt-4 text-lg text-slate-600 leading-relaxed">
            Multi-tenant hospital platform modeling real-world outpatient & inpatient workflows. 
            Powered by row-level tenancy isolation, ACID transactions with PostgreSQL pessimistic locking, 
            append-only EMR records, FIFO pharmacy dispensing, and consolidated department billing.
          </p>
        </div>

        {/* Clinical Role Workspaces */}
        <div className="mt-12">
          <h2 className="text-xl font-bold text-slate-900 mb-6 flex items-center gap-2">
            <span>Role-Specific Clinical & Administrative Workspaces</span>
            <span className="text-xs font-normal text-slate-500">(9 Verified Roles)</span>
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {roles.map((role) => {
              const Icon = role.icon;
              return (
                <div
                  key={role.title}
                  className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm hover:shadow-md transition group"
                >
                  <div className="flex items-center gap-4">
                    <div className={`p-3 rounded-lg ${role.color}`}>
                      <Icon className="w-6 h-6" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-slate-900 group-hover:text-teal-600 transition">
                        {role.title}
                      </h3>
                      <p className="text-xs text-slate-500 mt-1">{role.desc}</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Architecture Specs */}
        <div className="mt-14 p-6 bg-slate-900 text-slate-100 rounded-xl">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 border-b border-slate-800 pb-4">
            <div>
              <h3 className="text-base font-semibold text-white">System Architecture & Invariant Enforcement</h3>
              <p className="text-xs text-slate-400 mt-0.5">PostgreSQL 16 + Prisma ORM + NestJS Modular Monolith</p>
            </div>
            <span className="text-xs font-mono bg-teal-900/60 text-teal-300 px-2.5 py-1 rounded border border-teal-700/50">
              Tenancy: Row-Level Isolation (hospitalId)
            </span>
          </div>

          <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
            <div className="p-3 bg-slate-800/60 rounded border border-slate-800">
              <span className="text-slate-400 block">Appointment Concurrency</span>
              <span className="text-slate-200 font-medium">PostgreSQL SELECT FOR UPDATE + Unique Slot Index</span>
            </div>
            <div className="p-3 bg-slate-800/60 rounded border border-slate-800">
              <span className="text-slate-400 block">Medical Records (EMR)</span>
              <span className="text-slate-200 font-medium">Append-Only Clinical History + Auto BMI</span>
            </div>
            <div className="p-3 bg-slate-800/60 rounded border border-slate-800">
              <span className="text-slate-400 block">Pharmacy Inventory</span>
              <span className="text-slate-200 font-medium">FIFO Expiry Dispensing + Batch Quarantine</span>
            </div>
            <div className="p-3 bg-slate-800/60 rounded border border-slate-800">
              <span className="text-slate-400 block">Financial Invoicing</span>
              <span className="text-slate-200 font-medium">Immutable Line Items + Webhook Verification</span>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
