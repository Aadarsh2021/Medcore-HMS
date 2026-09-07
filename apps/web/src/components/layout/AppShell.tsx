'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '../../stores/authStore';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';
import { Activity, ShieldAlert } from 'lucide-react';
import { UserRole } from '@medcore/types';
import { Button } from '../ui/Button';

export interface AppShellProps {
  children: React.ReactNode;
  requiredRoles?: UserRole[];
}

export const AppShell: React.FC<AppShellProps> = ({ children, requiredRoles }) => {
  const router = useRouter();
  const { user, session, isInitialized, init } = useAuthStore();
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isMobileOpen, setIsMobileOpen] = useState(false);

  useEffect(() => {
    init();
  }, [init]);

  useEffect(() => {
    if (isInitialized && !user && !session) {
      router.push('/login');
    }
  }, [isInitialized, user, session, router]);

  if (!isInitialized || (!user && !session)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950">
        <div className="text-center">
          <div className="w-12 h-12 rounded-2xl bg-teal-600 text-white flex items-center justify-center mx-auto mb-3 shadow-lg shadow-teal-600/30 animate-pulse">
            <Activity className="w-6 h-6 animate-spin" />
          </div>
          <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">
            MedCore Clinical Operating System
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Establishing secure hospital session...
          </p>
        </div>
      </div>
    );
  }

  const role = user?.role || UserRole.DOCTOR;
  const hospitalName = user?.hospitalName || 'Metro General Hospital';

  // Role-aware navigation & UI access control check
  if (requiredRoles && requiredRoles.length > 0 && !requiredRoles.includes(role)) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex">
        <Sidebar
          role={role}
          hospitalName={hospitalName}
          isCollapsed={isSidebarCollapsed}
          onToggleCollapse={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
          isMobileOpen={isMobileOpen}
          onCloseMobile={() => setIsMobileOpen(false)}
        />
        <div className="flex-1 flex flex-col min-w-0">
          <TopBar onToggleMobileMenu={() => setIsMobileOpen(true)} />
          <main className="flex-1 p-6 max-w-lg mx-auto flex flex-col items-center justify-center text-center">
            <div className="w-14 h-14 rounded-2xl bg-rose-100 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-900 flex items-center justify-center mb-4 shadow-sm">
              <ShieldAlert className="w-7 h-7" />
            </div>
            <h2 className="text-lg font-bold text-slate-900 dark:text-white">
              Workstation Access Restricted
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-2 leading-relaxed">
              Your institutional account role ({role.replace('_', ' ')}) does not have navigation permissions for this workstation. The backend enforces authoritative access controls for all clinical and administrative records.
            </p>
            <div className="mt-6">
              <Button variant="primary" size="sm" onClick={() => router.push('/dashboard')}>
                Return to My Dashboard
              </Button>
            </div>
          </main>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex">
      {/* Sidebar */}
      <Sidebar
        role={role}
        hospitalName={hospitalName}
        isCollapsed={isSidebarCollapsed}
        onToggleCollapse={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
        isMobileOpen={isMobileOpen}
        onCloseMobile={() => setIsMobileOpen(false)}
      />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        <TopBar onToggleMobileMenu={() => setIsMobileOpen(true)} />
        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto space-y-6">
          {children}
        </main>
      </div>
    </div>
  );
};
