'use client';

import React, { Suspense } from 'react';
import { AppShell } from '../../../../components/layout/AppShell';
import { BillingHubContent } from '../BillingHubContent';

export default function BillingPaymentsPage() {
  return (
    <AppShell>
      <Suspense fallback={<div className="p-8 text-center text-xs text-slate-500">Loading Payments...</div>}>
        <BillingHubContent defaultTab="payments" />
      </Suspense>
    </AppShell>
  );
}
