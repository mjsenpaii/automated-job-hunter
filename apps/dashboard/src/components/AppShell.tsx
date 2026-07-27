'use client';

import { useEffect, useState } from 'react';
import Sidebar from './Sidebar';

const SIDEBAR_PREFERENCE_KEY = 'job-app-sidebar-collapsed';

export function AppShell({ children }: { children: React.ReactNode }) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [preferenceReady, setPreferenceReady] = useState(false);

  useEffect(() => {
    try {
      setSidebarCollapsed(
        window.localStorage.getItem(SIDEBAR_PREFERENCE_KEY) === 'true',
      );
    } catch {
      setSidebarCollapsed(false);
    } finally {
      setPreferenceReady(true);
    }
  }, []);

  const toggleSidebar = () => {
    setSidebarCollapsed((current) => {
      const next = !current;
      try {
        window.localStorage.setItem(SIDEBAR_PREFERENCE_KEY, String(next));
      } catch {
        // The preference is optional; the control still works for this session.
      }
      return next;
    });
  };

  return (
    <div
      className={`app-shell${sidebarCollapsed ? ' sidebar-is-collapsed' : ''}${
        preferenceReady ? ' sidebar-preference-ready' : ''
      }`}
    >
      <Sidebar collapsed={sidebarCollapsed} onToggle={toggleSidebar} />
      <main id="main-content" className="main-content" tabIndex={-1}>
        <div className="content-frame">{children}</div>
      </main>
    </div>
  );
}
