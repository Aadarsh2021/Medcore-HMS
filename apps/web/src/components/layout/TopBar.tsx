import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '../../stores/authStore';
import {
  Search,
  Bell,
  Building2,
  LogOut,
  Menu,
  Shield,
  User,
  ChevronDown,
} from 'lucide-react';
import { UserRole } from '@medcore/types';
import { Badge } from '../ui/Badge';
import { GlobalSearch } from '../ui/GlobalSearch';
import { NotificationCenter } from '../ui/NotificationCenter';

export interface TopBarProps {
  onToggleMobileMenu: () => void;
}

export const TopBar: React.FC<TopBarProps> = ({ onToggleMobileMenu }) => {
  const router = useRouter();
  const { user, logout } = useAuthStore();
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isNotifOpen, setIsNotifOpen] = useState(false);
  const [isTenantMenuOpen, setIsTenantMenuOpen] = useState(false);

  const role = user?.role || UserRole.DOCTOR;
  const isSuperAdmin = role === UserRole.SUPER_ADMIN;

  const handleSignOut = async () => {
    await logout();
    router.push('/login');
  };

  const getRoleVariant = (r: UserRole) => {
    switch (r) {
      case UserRole.SUPER_ADMIN:
        return 'purple';
      case UserRole.HOSPITAL_ADMIN:
        return 'info';
      case UserRole.DOCTOR:
        return 'success';
      case UserRole.NURSE:
        return 'default';
      case UserRole.RECEPTIONIST:
        return 'warning';
      case UserRole.PHARMACIST:
        return 'info';
      case UserRole.LAB_TECHNICIAN:
        return 'info';
      case UserRole.ACCOUNTANT:
        return 'warning';
      case UserRole.PATIENT:
        return 'danger';
      default:
        return 'neutral';
    }
  };

  return (
    <>
      <header className="h-16 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 sticky top-0 z-20 flex items-center justify-between px-4 sm:px-6 shadow-sm">
        {/* Left: Mobile hamburger & Tenant Indicator */}
        <div className="flex items-center gap-3">
          <button
            onClick={onToggleMobileMenu}
            className="md:hidden p-2 rounded-lg text-slate-500 hover:text-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
            aria-label="Open navigation drawer"
          >
            <Menu className="w-5 h-5" />
          </button>

          {/* Hospital Tenant Display */}
          <div className="flex items-center gap-2">
            <div className="hidden sm:flex p-1.5 rounded-lg bg-teal-50 dark:bg-teal-950/80 text-teal-600 dark:text-teal-400">
              <Building2 className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-1.5 text-xs sm:text-sm font-semibold text-slate-900 dark:text-white">
                <span>{user?.hospitalName || 'Metro General Hospital'}</span>
                {isSuperAdmin && (
                  <button
                    onClick={() => setIsTenantMenuOpen(!isTenantMenuOpen)}
                    className="text-[10px] px-1.5 py-0.5 rounded bg-purple-100 dark:bg-purple-950 text-purple-700 dark:text-purple-300 font-mono font-medium hover:bg-purple-200 transition"
                    title="Switch target hospital tenant override (Super Admin)"
                  >
                    Override Tenant ▾
                  </button>
                )}
              </div>
              <div className="text-[11px] text-slate-500 dark:text-slate-400 hidden sm:block">
                MedCore Clinical Tenant &middot; Active Facility
              </div>
            </div>
          </div>
        </div>

        {/* Right: Search, Notifications, User Menu */}
        <div className="flex items-center gap-2 sm:gap-4">
          {/* Global Search Button (⌘K) */}
          <button
            onClick={() => setIsSearchOpen(true)}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 hover:bg-slate-100 text-slate-500 dark:text-slate-400 text-xs transition"
          >
            <Search className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Search records...</span>
            <kbd className="hidden sm:inline-block px-1.5 py-0.5 text-[10px] font-mono bg-white dark:bg-slate-900 border rounded text-slate-400 shadow-2xs">
              ⌘K
            </kbd>
          </button>

          {/* Notification Bell */}
          <button
            onClick={() => setIsNotifOpen(true)}
            className="relative p-2 rounded-lg text-slate-500 dark:text-slate-400 hover:text-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
            title="Hospital Operational Alerts"
          >
            <Bell className="w-4 h-4" />
            <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-teal-500 ring-2 ring-white dark:ring-slate-900 animate-pulse" />
          </button>

          {/* User Profile Info */}
          <div className="flex items-center gap-3 pl-2 border-l border-slate-200 dark:border-slate-800">
            <div className="text-right hidden lg:block">
              <div className="text-xs sm:text-sm font-semibold text-slate-900 dark:text-white leading-tight">
                {user?.firstName} {user?.lastName}
              </div>
              <div className="text-[11px] text-slate-500 dark:text-slate-400">
                {user?.email}
              </div>
            </div>

            <Badge variant={getRoleVariant(role)} size="sm">
              {role.replace(/_/g, ' ')}
            </Badge>

            <button
              onClick={handleSignOut}
              className="p-2 rounded-lg text-slate-500 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/50 transition"
              title="Sign Out of MedCore"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      {/* Global Search Palette */}
      <GlobalSearch isOpen={isSearchOpen} onClose={() => setIsSearchOpen(false)} />

      {/* Notification Center */}
      <NotificationCenter isOpen={isNotifOpen} onClose={() => setIsNotifOpen(false)} />
    </>
  );
};
