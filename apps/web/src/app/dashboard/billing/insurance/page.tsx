'use client';

import React, { Suspense } from 'react';
import { AppShell } from '../../../../components/layout/AppShell';
import { BillingHubContent } from '../BillingHubContent';

export default function BillingInsurancePage() {
  return (
    <AppShell>
      <Suspense fallback={<div className="p-8 text-center text-xs text-slate-500">Loading Insurance & TPA...</div>}>
        <BillingHubContent defaultTab="insurance" />
      </Suspense>
    </AppShell>
  );
}
