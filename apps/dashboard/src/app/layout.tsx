import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { AppShell } from '@/components/AppShell';

const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-inter',
});

export const metadata: Metadata = {
  title: 'Job Application AI',
  description: 'AI-powered job application tracking and scoring dashboard',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={inter.variable}>
      <body>
        <a href="#main-content" className="skip-link">
          Skip to main content
        </a>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
