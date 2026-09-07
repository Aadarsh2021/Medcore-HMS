import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Activity,
  LayoutDashboard,
  Users,
  Calendar,
  Stethoscope,
  Building2,
  FileText,
  Pill,
  FlaskConical,
  Receipt,
  BarChart3,
  ShieldCheck,
  Settings,
  HeartHandshake,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  UserCheck,
} from 'lucide-react';
import { UserRole } from '@medcore/types';

export interface SidebarProps {
  role: UserRole;
  hospitalName: string;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  isMobileOpen: boolean;
  onCloseMobile: () => void;
}

interface NavItem {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  allowedRoles: UserRole[];
  badge?: string;
}

const NAV_ITEMS: NavItem[] = [
  {
    label: 'Dashboard',
    href: '/dashboard',
    icon: LayoutDashboard,
    allowedRoles: [
      UserRole.SUPER_ADMIN,
      UserRole.HOSPITAL_ADMIN,
      UserRole.DOCTOR,
      UserRole.NURSE,
      UserRole.RECEPTIONIST,
      UserRole.PHARMACIST,
      UserRole.LAB_TECHNICIAN,
      UserRole.ACCOUNTANT,
      UserRole.PATIENT,
    ],
  },
  {
    label: 'Patients',
    href: '/dashboard/patients',
    icon: Users,
    allowedRoles: [
      UserRole.SUPER_ADMIN,
      UserRole.HOSPITAL_ADMIN,
      UserRole.DOCTOR,
      UserRole.NURSE,
      UserRole.RECEPTIONIST,
    ],
  },
  {
    label: 'Appointments',
    href: '/dashboard/appointments',
    icon: Calendar,
    allowedRoles: [
      UserRole.SUPER_ADMIN,
      UserRole.HOSPITAL_ADMIN,
      UserRole.DOCTOR,
      UserRole.NURSE,
      UserRole.RECEPTIONIST,
      UserRole.PATIENT,
    ],
  },
  {
    label: 'Doctors',
    href: '/dashboard/doctors',
    icon: Stethoscope,
    allowedRoles: [
      UserRole.SUPER_ADMIN,
      UserRole.HOSPITAL_ADMIN,
      UserRole.RECEPTIONIST,
    ],
  },
  {
    label: 'Departments',
    href: '/dashboard/departments',
    icon: Building2,
    allowedRoles: [
      UserRole.SUPER_ADMIN,
      UserRole.HOSPITAL_ADMIN,
      UserRole.RECEPTIONIST,
    ],
  },
  {
    label: 'Clinical Workspace',
    href: '/dashboard/clinical',
    icon: Activity,
    badge: 'OPD Live',
    allowedRoles: [
      UserRole.SUPER_ADMIN,
      UserRole.DOCTOR,
      UserRole.NURSE,
    ],
  },
  {
    label: 'Prescriptions',
    href: '/dashboard/prescriptions',
    icon: FileText,
    allowedRoles: [
      UserRole.SUPER_ADMIN,
      UserRole.HOSPITAL_ADMIN,
      UserRole.DOCTOR,
      UserRole.PHARMACIST,
      UserRole.PATIENT,
    ],
  },
  {
    label: 'Pharmacy Hub',
    href: '/dashboard/pharmacy',
    icon: Pill,
    badge: 'FEFO',
    allowedRoles: [
      UserRole.SUPER_ADMIN,
      UserRole.HOSPITAL_ADMIN,
      UserRole.PHARMACIST,
    ],
  },
  {
    label: 'Laboratory',
    href: '/dashboard/laboratory',
    icon: FlaskConical,
    allowedRoles: [
      UserRole.SUPER_ADMIN,
      UserRole.HOSPITAL_ADMIN,
      UserRole.DOCTOR,
      UserRole.LAB_TECHNICIAN,
      UserRole.PATIENT,
    ],
  },
  {
    label: 'Billing & Cashier',
    href: '/dashboard/billing',
    icon: Receipt,
    allowedRoles: [
      UserRole.SUPER_ADMIN,
      UserRole.HOSPITAL_ADMIN,
      UserRole.ACCOUNTANT,
      UserRole.PATIENT,
    ],
  },
  {
    label: 'Reports & Analytics',
    href: '/dashboard/reports',
    icon: BarChart3,
    allowedRoles: [
      UserRole.SUPER_ADMIN,
      UserRole.HOSPITAL_ADMIN,
      UserRole.ACCOUNTANT,
    ],
  },
  {
    label: 'Administration',
    href: '/dashboard/admin',
    icon: ShieldCheck,
    allowedRoles: [
      UserRole.SUPER_ADMIN,
      UserRole.HOSPITAL_ADMIN,
    ],
  },
  {
    label: 'Settings',
    href: '/dashboard/settings',
    icon: Settings,
    allowedRoles: [
      UserRole.SUPER_ADMIN,
      UserRole.HOSPITAL_ADMIN,
      UserRole.DOCTOR,
      UserRole.NURSE,
      UserRole.RECEPTIONIST,
      UserRole.PHARMACIST,
      UserRole.LAB_TECHNICIAN,
      UserRole.ACCOUNTANT,
      UserRole.PATIENT,
    ],
  },
];

export const Sidebar: React.FC<SidebarProps> = ({
  role,
  hospitalName,
  isCollapsed,
  onToggleCollapse,
  isMobileOpen,
  onCloseMobile,
}) => {
  const pathname = usePathname();

  // Filter navigation items strictly by role
  const allowedNav = NAV_ITEMS.filter((item) => item.allowedRoles.includes(role));

  const content = (
    <aside
      className={`h-full flex flex-col bg-slate-900 text-slate-100 border-r border-slate-800 transition-all duration-200 ${
        isCollapsed ? 'w-20' : 'w-64'
      }`}
    >
      {/* Brand Header */}
      <div className="h-16 flex items-center justify-between px-4 border-b border-slate-800">
        <Link href="/dashboard" className="flex items-center gap-3 overflow-hidden">
          <div className="w-10 h-10 rounded-xl bg-teal-600 flex items-center justify-center text-white font-bold shrink-0 shadow-md shadow-teal-600/30">
            <Activity className="w-6 h-6" />
          </div>
          {!isCollapsed && (
            <div className="truncate">
              <div className="font-bold text-white tracking-tight leading-tight flex items-center gap-1.5">
                <span>MedCore</span>
                <span className="text-teal-400 font-semibold">HMS</span>
              </div>
              <div className="text-[11px] text-slate-400 truncate">
                {hospitalName || 'Metro General Hospital'}
              </div>
            </div>
          )}
        </Link>
        <button
          onClick={onToggleCollapse}
          className="hidden md:flex p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition"
          title={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {isCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
        </button>
      </div>

      {/* Navigation List */}
      <div className="flex-1 py-4 px-2 space-y-1 overflow-y-auto no-scrollbar">
        {allowedNav.map((item) => {
          const Icon = item.icon;
          const isActive =
            pathname === item.href ||
            (item.href !== '/dashboard' && pathname.startsWith(item.href));

          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onCloseMobile}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs sm:text-sm font-medium transition-all ${
                isActive
                  ? 'bg-teal-600 text-white shadow-sm font-semibold'
                  : 'text-slate-300 hover:bg-slate-800/80 hover:text-white'
              }`}
              title={isCollapsed ? item.label : undefined}
            >
              <Icon className="w-5 h-5 shrink-0" />
              {!isCollapsed && (
                <div className="flex items-center justify-between flex-1 truncate">
                  <span className="truncate">{item.label}</span>
                  {item.badge && (
                    <span className="text-[10px] uppercase font-bold px-1.5 py-0.5 rounded bg-teal-800/80 text-teal-200 border border-teal-600/40">
                      {item.badge}
                    </span>
                  )}
                </div>
              )}
            </Link>
          );
        })}
      </div>

      {/* Hospital Identity Footer */}
      {!isCollapsed && (
        <div className="p-4 border-t border-slate-800 text-xs bg-slate-950/40">
          <div className="flex items-center gap-2 text-teal-400 font-semibold mb-1">
            <Building2 className="w-3.5 h-3.5" />
            <span className="truncate">{hospitalName}</span>
          </div>
          <div className="text-[11px] text-slate-400 flex items-center justify-between">
            <span>Operating Tenant</span>
            <span className="text-emerald-400 font-mono">Verified</span>
          </div>
        </div>
      )}
    </aside>
  );

  return (
    <>
      {/* Desktop Sidebar */}
      <div className="hidden md:block h-screen sticky top-0 z-30">{content}</div>

      {/* Mobile Drawer */}
      {isMobileOpen && (
        <div className="fixed inset-0 z-50 md:hidden flex">
          <div
            className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm transition-opacity"
            onClick={onCloseMobile}
          />
          <div className="relative w-64 h-full z-10 animate-in slide-in-from-left duration-200">
            {content}
          </div>
        </div>
      )}
    </>
  );
};
