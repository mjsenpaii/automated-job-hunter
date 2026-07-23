'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export default function Sidebar() {
  const pathname = usePathname();

  const navItems = [
    { label: 'Dashboard', href: '/' },
    { label: 'Add Job', href: '/add-job' },
    { label: 'Import URL', href: '/import-job' },
    { label: 'PH Jobs', href: '/ph-jobs' },
    { label: 'International Jobs', href: '/intl-jobs' },
    // 'Applications' (/applications) and 'Resume Profiles' (/profiles) are intentionally
    // hidden until those pages are implemented (avoids dead links / 404s).
  ];

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <div className="logo-icon"></div>
        <h2>Job App AI</h2>
      </div>
      
      <nav className="sidebar-nav">
        {navItems.map((item) => {
          const isActive = pathname === item.href;
          return (
            <Link 
              key={item.href} 
              href={item.href}
              className={`nav-item ${isActive ? 'active' : ''}`}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>

      <style>{`
        .sidebar {
          width: 280px;
          height: 100vh;
          position: fixed;
          top: 0;
          left: 0;
          background: var(--glass-bg);
          backdrop-filter: var(--glass-blur);
          -webkit-backdrop-filter: var(--glass-blur);
          border-right: 1px solid var(--glass-border);
          padding: 2rem 1.5rem;
          display: flex;
          flex-direction: column;
          z-index: 100;
        }

        .sidebar-header {
          display: flex;
          align-items: center;
          gap: 1rem;
          margin-bottom: 3rem;
        }

        .logo-icon {
          width: 32px;
          height: 32px;
          border-radius: 8px;
          background: var(--accent-gradient);
          box-shadow: 0 0 15px rgba(59, 130, 246, 0.5);
        }

        .sidebar-header h2 {
          font-size: 1.25rem;
          margin: 0;
          background: var(--accent-gradient);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
        }

        .sidebar-nav {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
        }

        .nav-item {
          padding: 0.875rem 1rem;
          border-radius: 8px;
          color: var(--text-secondary);
          font-weight: 500;
          transition: all 0.2s ease;
        }

        .nav-item:hover {
          background: rgba(255, 255, 255, 0.05);
          color: var(--text-primary);
        }

        .nav-item.active {
          background: rgba(59, 130, 246, 0.15);
          color: var(--accent-primary);
          border-left: 3px solid var(--accent-primary);
        }

        @media (max-width: 768px) {
          .sidebar {
            width: 100%;
            height: auto;
            position: fixed;
            bottom: 0;
            top: auto;
            border-right: none;
            border-top: 1px solid var(--glass-border);
            padding: 1rem;
            flex-direction: row;
            justify-content: space-around;
            align-items: center;
          }
          
          .sidebar-header {
            display: none;
          }

          .sidebar-nav {
            flex-direction: row;
            width: 100%;
            justify-content: space-around;
          }

          .nav-item {
            font-size: 0.75rem;
            padding: 0.5rem;
            border-left: none;
          }
          
          .nav-item.active {
            border-left: none;
            border-bottom: 3px solid var(--accent-primary);
          }
        }
      `}</style>
    </aside>
  );
}
