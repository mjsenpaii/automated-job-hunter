'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { AppIcon, type AppIconName } from './icons';

const NAV_ITEMS: Array<{ label: string; href: string; icon: AppIconName }> = [
  { label: 'Overview', href: '/', icon: 'overview' },
  { label: 'Import Job', href: '/import-job', icon: 'import' },
  { label: 'PH Jobs', href: '/ph-jobs', icon: 'briefcase' },
  { label: 'International', href: '/intl-jobs', icon: 'globe' },
];

export default function Sidebar({
  collapsed,
  onToggle,
}: {
  collapsed: boolean;
  onToggle: () => void;
}) {
  const pathname = usePathname();

  return (
    <>
      <aside
        className={`sidebar${collapsed ? ' sidebar-collapsed' : ''}`}
        aria-label="Primary navigation"
      >
        <div className="sidebar-header">
          <Link href="/" className="brand" aria-label="Job Application AI overview">
            <span className="brand-mark" aria-hidden="true">
              JA
            </span>
            <span className="brand-copy">
              <strong>Job Application AI</strong>
              <small>Research workspace</small>
            </span>
          </Link>
          <button
            type="button"
            className="sidebar-toggle"
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            aria-expanded={!collapsed}
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            onClick={onToggle}
          >
            <AppIcon
              name="sidebarToggle"
              size={19}
              className={collapsed ? 'sidebar-toggle-icon collapsed' : 'sidebar-toggle-icon'}
            />
          </button>
        </div>

        <nav className="sidebar-nav">
          {NAV_ITEMS.map((item) => {
            const active =
              pathname === item.href ||
              (item.href !== '/' && pathname.startsWith(`${item.href}/`));
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`nav-item${active ? ' active' : ''}`}
                aria-current={active ? 'page' : undefined}
                aria-label={collapsed ? item.label : undefined}
                title={collapsed ? item.label : undefined}
              >
                <AppIcon name={item.icon} size={19} />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="sidebar-note">
          <span className="sidebar-note-dot" aria-hidden="true" />
          <span>
            <strong>Local workspace</strong>
            <small>Review before every action</small>
          </span>
        </div>
      </aside>

      <div className="mobile-brand" aria-hidden="true">
        <span className="brand-mark">JA</span>
        <strong>Job Application AI</strong>
      </div>
    </>
  );
}
