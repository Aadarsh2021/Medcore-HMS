'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '../../stores/authStore';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';
import { Activity } from 'lucide-react';
import { UserRole } from '@medcore/types';

export interface AppShellProps {
  children: React.ReactNode;
}

export const AppShell: React.FC<AppShellProps> = ({ children }) => {
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
