import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  Download,
  Upload,
  Library,
  Paintbrush,
  CheckCircle,
  Clock,
  AlertCircle,
  FileCheck,
  Package,
} from 'lucide-react';
import styles from './Dashboard.module.css';

export function Dashboard() {
  const { data: projectInfo, isLoading } = useQuery({
    queryKey: ['project-info'],
    queryFn: async () => {
      const result = await window.huepress.app.getProjectInfo();
      return result.success ? result.data : null;
    },
  });

  const { data: apiKeyStatus } = useQuery({
    queryKey: ['api-key-status'],
    queryFn: async () => {
      const result = await window.huepress.settings.getApiKeyStatus();
      return result.success ? result.data : null;
    },
  });

  const stats = projectInfo?.stats;
  const byStatus = stats?.byStatus || {};

  const statusCards = [
    { label: 'Imported', value: byStatus.Imported || 0, icon: Download, color: 'info' },
    { label: 'Queued', value: byStatus.Queued || 0, icon: Clock, color: 'warning' },
    { label: 'Generated', value: byStatus.Generated || 0, icon: CheckCircle, color: 'success' },
    { label: 'Needs Review', value: byStatus.NeedsAttention || 0, icon: AlertCircle, color: 'error' },
    { label: 'Approved', value: byStatus.Approved || 0, icon: FileCheck, color: 'accent' },
    { label: 'Exported', value: byStatus.Exported || 0, icon: Package, color: 'muted' },
  ];

  return (
    <div className={styles.dashboard}>
      <header className={styles.header}>
        <h1 className={styles.title}>Dashboard</h1>
        <p className={styles.subtitle}>Production pipeline overview</p>
      </header>

      {/* Setup Alert */}
      {!apiKeyStatus?.hasApiKey && (
        <div className={styles.alert}>
          <AlertTriangle size={18} />
          <div className={styles.alertContent}>
            <strong>API Key Required</strong>
            <span>Configure your Gemini API key to enable generation</span>
          </div>
          <Link to="/settings" className={styles.alertAction}>
            Configure
          </Link>
        </div>
      )}

      {/* Stats Grid */}
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Pipeline Status</h2>
        <div className={styles.statsGrid}>
          {statusCards.map(({ label, value, icon: Icon, color }) => (
            <div key={label} className={`${styles.statCard} ${styles[`stat${color}`]}`}>
              <div className={styles.statIcon}>
                <Icon size={18} strokeWidth={1.5} />
              </div>
              <div className={styles.statInfo}>
                <span className={styles.statValue}>{isLoading ? '—' : value}</span>
                <span className={styles.statLabel}>{label}</span>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Quick Actions */}
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Quick Actions</h2>
        <div className={styles.actionsGrid}>
          <Link to="/import" className={styles.actionCard}>
            <Upload size={20} strokeWidth={1.5} />
            <div className={styles.actionContent}>
              <strong>Import Ideas</strong>
              <span>Load JSON array of ideas</span>
            </div>
          </Link>
          <Link to="/library" className={styles.actionCard}>
            <Library size={20} strokeWidth={1.5} />
            <div className={styles.actionContent}>
              <strong>Browse Library</strong>
              <span>View and manage ideas</span>
            </div>
          </Link>
          <button className={styles.actionCard} disabled>
            <Paintbrush size={20} strokeWidth={1.5} />
            <div className={styles.actionContent}>
              <strong>Generate</strong>
              <span>Coming in M2</span>
            </div>
          </button>
          <button className={styles.actionCard} disabled>
            <Download size={20} strokeWidth={1.5} />
            <div className={styles.actionContent}>
              <strong>Export</strong>
              <span>Coming in M4</span>
            </div>
          </button>
        </div>
      </section>

      {/* Summary */}
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Summary</h2>
        <div className={styles.summaryGrid}>
          <div className={styles.summaryItem}>
            <span className={styles.summaryLabel}>Total Ideas</span>
            <span className={styles.summaryValue}>
              {isLoading ? '—' : stats?.totalIdeas || 0}
            </span>
          </div>
          <div className={styles.summaryItem}>
            <span className={styles.summaryLabel}>Batches</span>
            <span className={styles.summaryValue}>
              {isLoading ? '—' : stats?.totalBatches || 0}
            </span>
          </div>
          <div className={styles.summaryItem}>
            <span className={styles.summaryLabel}>Database</span>
            <span className={`${styles.summaryValue} ${styles.statusOk}`}>
              Connected
            </span>
          </div>
          <div className={styles.summaryItem}>
            <span className={styles.summaryLabel}>API Key</span>
            <span className={`${styles.summaryValue} ${apiKeyStatus?.hasApiKey ? styles.statusOk : styles.statusError}`}>
              {apiKeyStatus?.hasApiKey ? 'Configured' : 'Not Set'}
            </span>
          </div>
        </div>
      </section>
    </div>
  );
}
