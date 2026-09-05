import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'MedCore HMS — Hospital Management System',
  description: 'Enterprise Multi-Tenant Hospital & Clinical Management Platform',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-screen font-sans antialiased bg-slate-50 text-slate-900">
        {children}
      </body>
    </html>
  );
}
