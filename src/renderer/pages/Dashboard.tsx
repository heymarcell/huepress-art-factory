import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
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
    { label: 'Imported', value: byStatus.Imported || 0, color: 'info' },
    { label: 'Queued', value: byStatus.Queued || 0, color: 'warning' },
    { label: 'Generated', value: byStatus.Generated || 0, color: 'success' },
    { label: 'Needs Attention', value: byStatus.NeedsAttention || 0, color: 'error' },
    { label: 'Approved', value: byStatus.Approved || 0, color: 'accent' },
    { label: 'Exported', value: byStatus.Exported || 0, color: 'muted' },
  ];

  return (
    <div className={styles.dashboard}>
      <header className={styles.header}>
        <div>
          <h1 className={styles.title}>Dashboard</h1>
          <p className={styles.subtitle}>
            Overview of your coloring page production pipeline
          </p>
        </div>
      </header>

      {/* Setup Check */}
      {!apiKeyStatus?.hasApiKey && (
        <div className={styles.alert}>
          <div className={styles.alertIcon}>⚠️</div>
          <div className={styles.alertContent}>
            <strong>API Key Required</strong>
            <p>Configure your Gemini API key in Settings to enable image generation.</p>
          </div>
          <Link to="/settings" className={styles.alertAction}>
            Go to Settings →
          </Link>
        </div>
      )}

      {/* Stats Grid */}
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Pipeline Status</h2>
        <div className={styles.statsGrid}>
          {statusCards.map(({ label, value, color }) => (
            <div key={label} className={`${styles.statCard} ${styles[`stat${color}`]}`}>
              <div className={styles.statValue}>{isLoading ? '—' : value}</div>
              <div className={styles.statLabel}>{label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Quick Actions */}
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Quick Actions</h2>
        <div className={styles.actionsGrid}>
          <Link to="/import" className={styles.actionCard}>
            <div className={styles.actionIcon}>📥</div>
            <div className={styles.actionContent}>
              <strong>Import Ideas</strong>
              <span>Paste a JSON array of coloring page ideas</span>
            </div>
          </Link>
          <Link to="/library" className={styles.actionCard}>
            <div className={styles.actionIcon}>📚</div>
            <div className={styles.actionContent}>
              <strong>Browse Library</strong>
              <span>View and manage all your ideas</span>
            </div>
          </Link>
          <button className={styles.actionCard} disabled>
            <div className={styles.actionIcon}>🎨</div>
            <div className={styles.actionContent}>
              <strong>Generate Images</strong>
              <span>Start batch generation (M2)</span>
            </div>
          </button>
          <button className={styles.actionCard} disabled>
            <div className={styles.actionIcon}>📤</div>
            <div className={styles.actionContent}>
              <strong>Export Assets</strong>
              <span>Export approved images (M4)</span>
            </div>
          </button>
        </div>
      </section>

      {/* Summary */}
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Summary</h2>
        <div className={styles.summaryCard}>
          <div className={styles.summaryItem}>
            <span className={styles.summaryLabel}>Total Ideas</span>
            <span className={styles.summaryValue}>
              {isLoading ? '—' : stats?.totalIdeas || 0}
            </span>
          </div>
          <div className={styles.summaryItem}>
            <span className={styles.summaryLabel}>Total Batches</span>
            <span className={styles.summaryValue}>
              {isLoading ? '—' : stats?.totalBatches || 0}
            </span>
          </div>
          <div className={styles.summaryItem}>
            <span className={styles.summaryLabel}>Database</span>
            <span className={styles.summaryValue} title={projectInfo?.databasePath}>
              {projectInfo?.databasePath ? '✓ Connected' : '—'}
            </span>
          </div>
          <div className={styles.summaryItem}>
            <span className={styles.summaryLabel}>API Key</span>
            <span className={styles.summaryValue}>
              {apiKeyStatus?.hasApiKey ? '✓ Configured' : '✗ Not set'}
            </span>
          </div>
        </div>
      </section>
    </div>
  );
}
