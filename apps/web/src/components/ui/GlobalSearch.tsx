import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  Search,
  User,
  Calendar,
  Stethoscope,
  Pill,
  X,
  ArrowRight,
  FlaskConical,
  Receipt,
} from 'lucide-react';

export interface GlobalSearchProps {
  isOpen: boolean;
  onClose: () => void;
}

export const GlobalSearch: React.FC<GlobalSearchProps> = ({ isOpen, onClose }) => {
  const router = useRouter();
  const [query, setQuery] = useState('');

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        isOpen ? onClose() : null;
      }
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const navigate = (path: string) => {
    router.push(path);
    onClose();
  };

  const results = [
    {
      category: 'Clinical Workspaces',
      items: [
        { title: 'Clinical Encounter Workspace', desc: 'OPD Queue, Vitals, ICD-10 Diagnoses & EMR', path: '/dashboard/clinical', icon: Stethoscope },
        { title: 'Patient Directory', desc: 'Search records by UHID or register new patients', path: '/dashboard/patients', icon: User },
        { title: 'Appointments Schedule', desc: 'Doctor calendars, day/week view & booking', path: '/dashboard/appointments', icon: Calendar },
        { title: 'Pharmacy Hub', desc: 'Dispensing queue & FEFO batch allocation', path: '/dashboard/pharmacy', icon: Pill },
        { title: 'Laboratory Diagnostics', desc: 'Lab orders, specimen collection & report viewer', path: '/dashboard/laboratory', icon: FlaskConical },
        { title: 'Billing & Cashier', desc: 'Itemized consultation invoices & receipts', path: '/dashboard/billing', icon: Receipt },
      ],
    },
    {
      category: 'Recent Patients',
      items: [
        { title: 'Arjun Verma (38M)', desc: 'UHID: MGH-2025-000001 · B+ · In Consultation', path: '/dashboard/patients/detail?id=p-001-arjun-verma', icon: User },
        { title: 'Kavita Patel (45F)', desc: 'UHID: MGH-2025-000002 · O+ · Type 2 Diabetes', path: '/dashboard/patients/detail?id=p-002-kavita-patel', icon: User },
        { title: 'Rohit Mehta (30M)', desc: 'UHID: MGH-2025-000003 · A+ · Lab Specimen Collected', path: '/dashboard/patients/detail?id=p-003-rohit-mehta', icon: User },
      ],
    },
  ];

  const filteredCategories = results.map((cat) => ({
    ...cat,
    items: cat.items.filter(
      (item) =>
        item.title.toLowerCase().includes(query.toLowerCase()) ||
        item.desc.toLowerCase().includes(query.toLowerCase()),
    ),
  })).filter((cat) => cat.items.length > 0);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-20 p-4">
      <div
        className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      />
      <div className="relative w-full max-w-xl bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden z-10 animate-in fade-in zoom-in-95 duration-150">
        {/* Search Input Bar */}
        <div className="flex items-center px-4 py-3.5 border-b border-slate-200 dark:border-slate-800">
          <Search className="w-5 h-5 text-slate-400 mr-3 shrink-0" />
          <input
            autoFocus
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search patients by name or UHID, doctors, appointments, prescriptions..."
            className="w-full bg-transparent text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none"
          />
          {query && (
            <button
              onClick={() => setQuery('')}
              className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 mr-2"
            >
              <X className="w-4 h-4" />
            </button>
          )}
          <kbd className="hidden sm:inline-block px-1.5 py-0.5 text-[10px] font-mono font-semibold text-slate-500 bg-slate-100 dark:bg-slate-800 rounded border border-slate-200 dark:border-slate-700">
            ESC
          </kbd>
        </div>

        {/* Results List */}
        <div className="max-h-[60vh] overflow-y-auto p-2 divide-y divide-slate-100 dark:divide-slate-800">
          {filteredCategories.length > 0 ? (
            filteredCategories.map((cat, idx) => (
              <div key={idx} className="py-2 first:pt-0 last:pb-0">
                <div className="px-3 py-1.5 text-[11px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
                  {cat.category}
                </div>
                <div className="space-y-1">
                  {cat.items.map((item, iIdx) => {
                    const Icon = item.icon;
                    return (
                      <button
                        key={iIdx}
                        onClick={() => navigate(item.path)}
                        className="w-full text-left px-3 py-2 rounded-xl flex items-center justify-between hover:bg-slate-100 dark:hover:bg-slate-800/70 transition group"
                      >
                        <div className="flex items-center gap-3">
                          <div className="p-2 rounded-lg bg-teal-50 dark:bg-teal-950/60 text-teal-600 dark:text-teal-400 group-hover:bg-teal-600 group-hover:text-white transition">
                            <Icon className="w-4 h-4" />
                          </div>
                          <div>
                            <div className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                              {item.title}
                            </div>
                            <div className="text-xs text-slate-500 dark:text-slate-400">
                              {item.desc}
                            </div>
                          </div>
                        </div>
                        <ArrowRight className="w-4 h-4 text-slate-300 dark:text-slate-600 group-hover:text-teal-600 transition" />
                      </button>
                    );
                  })}
                </div>
              </div>
            ))
          ) : (
            <div className="p-8 text-center text-xs text-slate-500">
              No matching hospital records found for "{query}".
            </div>
          )}
        </div>

        <div className="p-3 bg-slate-50/70 dark:bg-slate-900/70 border-t border-slate-100 dark:border-slate-800 text-[11px] text-slate-400 flex items-center justify-between">
          <span>Press Enter to select</span>
          <span className="font-mono">MedCore Unified Search</span>
        </div>
      </div>
    </div>
  );
};
