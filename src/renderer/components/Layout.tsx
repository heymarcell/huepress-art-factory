import { NavLink, Outlet } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  LayoutDashboard,
  Import,
  Library,
  Settings,
  Layers,
  Download,
} from 'lucide-react';
import styles from './Layout.module.css';

const navItems = [
  { path: '/', label: 'Dashboard', icon: LayoutDashboard },
  { path: '/import', label: 'Import', icon: Import },
  { path: '/library', label: 'Library', icon: Library },
  { path: '/export', label: 'Export', icon: Download },
  { path: '/batch-jobs', label: 'Batch Jobs', icon: Layers },
  { path: '/settings', label: 'Settings', icon: Settings },
];

export function Layout() {


  const { data: versionInfo } = useQuery({
    queryKey: ['app-version'],
    queryFn: async () => {
      const result = await window.huepress.app.getVersion();
      return result.success ? result.data : null;
    },
    staleTime: Infinity,
  });

  return (
    <div className={styles.layout}>
      {/* Sidebar */}
      <aside className={styles.sidebar}>
        {/* Logo */}
        <div className={styles.logo}>
          <div className={styles.logoIcon}>
            <Layers size={20} strokeWidth={1.5} />
          </div>
          <div className={styles.logoText}>
            <span className={styles.logoTitle}>HuePress</span>
            <span className={styles.logoSubtitle}>Art Factory</span>
          </div>
        </div>

        {/* Navigation */}
        <nav className={styles.nav}>
          {navItems.map(({ path, label, icon: Icon }) => (
            <NavLink
              key={path}
              to={path}
              className={({ isActive }) =>
                `${styles.navItem} ${isActive ? styles.navItemActive : ''}`
              }
            >
              <Icon size={16} strokeWidth={1.5} />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>

        {/* Footer */}
        <div className={styles.sidebarFooter}>
          <span className={styles.version}>
            v{versionInfo?.version || '0.1.0'}
          </span>
        </div>
      </aside>

      {/* Main Content */}
      <main className={styles.main}>
        <div className={styles.content}>
          <Outlet />
        </div>
      </main>
    </div>
  );
}
