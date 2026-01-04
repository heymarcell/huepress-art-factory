import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
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
  StopCircle,
  XCircle,
  Ban,
  Wand2,
} from 'lucide-react';
import styles from './Dashboard.module.css';

export function Dashboard() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: projectInfo, isLoading } = useQuery({
    queryKey: ['project-info'],
    queryFn: async () => {
      const result = await window.huepress.app.getProjectInfo();
      return result.success ? result.data : null;
    },
    refetchInterval: 1000,
  });

  const { data: apiKeyStatus } = useQuery({
    queryKey: ['api-key-status'],
    queryFn: async () => {
      const result = await window.huepress.settings.getApiKeyStatus();
      return result.success ? result.data : null;
    },
  });

  // Mutation to generate all imported ideas
  const generateAllMutation = useMutation({
    mutationFn: async () => {
      // Get all imported ideas
      const result = await window.huepress.ideas.list({ status: ['Imported'], limit: 1000 });
      if (!result.success) throw new Error(result.error);
      
      const ids = result.data.ideas.map((i: { id: string }) => i.id);
      if (ids.length === 0) throw new Error('No imported ideas to generate');
      
      // Enqueue all
      const enqueueResult = await window.huepress.jobs.enqueue(ids);
      if (!enqueueResult.success) throw new Error(enqueueResult.error);
      
      return { count: ids.length };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project-info'] });
      queryClient.invalidateQueries({ queryKey: ['ideas'] });
    },
  });

  // Mutation to stop all generations (panic button)
  const stopAllMutation = useMutation({
    mutationFn: async () => {
      const result = await window.huepress.jobs.stopAll();
      if (!result.success) throw new Error(result.error);
      return result.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['project-info'] });
      queryClient.invalidateQueries({ queryKey: ['ideas'] });
    },
  });

  const stats = projectInfo?.stats;
  const byStatus = stats?.byStatus || {};
  const importedCount = byStatus.Imported || 0;
  const queuedCount = byStatus.Queued || 0;
  const generatingCount = byStatus.Generating || 0;
  const hasActiveJobs = queuedCount > 0 || generatingCount > 0;

  // Status cards with their corresponding filter values
  const approvedCount = byStatus.Approved || 0;
  const statusCards = [
    { label: 'Imported', value: byStatus.Imported || 0, icon: Download, color: 'info', filter: 'Imported' },
    { label: 'Queued', value: byStatus.Queued || 0, icon: Clock, color: 'warning', filter: 'Queued' },
    { label: 'Generated', value: byStatus.Generated || 0, icon: CheckCircle, color: 'success', filter: 'Generated' },
    { label: 'Needs Review', value: byStatus.NeedsAttention || 0, icon: AlertCircle, color: 'error', filter: 'NeedsAttention' },
    { label: 'Failed', value: byStatus.Failed || 0, icon: XCircle, color: 'error', filter: 'Failed' },
    { label: 'Approved', value: byStatus.Approved || 0, icon: FileCheck, color: 'accent', filter: 'Approved' },
    { label: 'Vectorized', value: byStatus.Vectorized || 0, icon: Wand2, color: 'accent', filter: 'Vectorized' },
    { label: 'Omitted', value: byStatus.Omitted || 0, icon: Ban, color: 'muted', filter: 'Omitted' },
    { label: 'Exported', value: byStatus.Exported || 0, icon: Package, color: 'muted', filter: 'Exported' },
  ];

  const handleStatusCardClick = (filter: string) => {
    navigate(`/library?status=${filter}`);
  };

  const handleGenerateAll = () => {
    if (importedCount === 0) {
      alert('No imported ideas to generate.');
      return;
    }
    
    const confirmed = confirm(
      `Start generating ${importedCount} imported idea${importedCount !== 1 ? 's' : ''}?\n\n` +
      `This will queue all ideas with "Imported" status for generation.`
    );
    
    if (confirmed) {
      generateAllMutation.mutate();
    }
  };

  const handleStopAll = () => {
    const totalActive = queuedCount + generatingCount;
    const confirmed = confirm(
      `⚠️ STOP ALL GENERATIONS?\n\n` +
      `This will:\n` +
      `• Cancel ${queuedCount} queued job${queuedCount !== 1 ? 's' : ''}\n` +
      `• Stop ${generatingCount} generating job${generatingCount !== 1 ? 's' : ''}\n` +
      `• Mark all ${totalActive} as Failed\n\n` +
      `This cannot be undone.`
    );
    
    if (confirmed) {
      stopAllMutation.mutate();
    }
  };

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

      {/* Stats Grid - Clickable */}
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Pipeline Status</h2>
        <div className={styles.statsGrid}>
          {statusCards.map(({ label, value, icon: Icon, color, filter }) => (
            <button
              key={label}
              className={`${styles.statCard} ${styles[`stat${color}`]} ${styles.clickable}`}
              onClick={() => handleStatusCardClick(filter)}
            >
              <div className={styles.statIcon}>
                <Icon size={18} strokeWidth={1.5} />
              </div>
              <div className={styles.statInfo}>
                <span className={styles.statValue}>{isLoading ? '—' : value}</span>
                <span className={styles.statLabel}>{label}</span>
              </div>
            </button>
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
          <button 
            className={styles.actionCard} 
            onClick={handleGenerateAll}
            disabled={importedCount === 0 || generateAllMutation.isPending}
          >
            <Paintbrush size={20} strokeWidth={1.5} />
            <div className={styles.actionContent}>
              <strong>Generate All</strong>
              <span>{importedCount > 0 ? `${importedCount} imported ready` : 'No imports pending'}</span>
            </div>
          </button>
          <button 
            className={`${styles.actionCard} ${hasActiveJobs ? styles.dangerCard : ''}`}
            onClick={handleStopAll}
            disabled={!hasActiveJobs || stopAllMutation.isPending}
          >
            <StopCircle size={20} strokeWidth={1.5} />
            <div className={styles.actionContent}>
              <strong>Stop All</strong>
              <span>{hasActiveJobs ? `${queuedCount + generatingCount} active` : 'No active jobs'}</span>
            </div>
          </button>
          <Link 
            to="/library?status=Approved"
            className={`${styles.actionCard} ${approvedCount > 0 ? styles.successCard : ''}`}
          >
            <Package size={20} strokeWidth={1.5} />
            <div className={styles.actionContent}>
              <strong>Export</strong>
              <span>{approvedCount > 0 ? `${approvedCount} ready to export` : 'No approved ideas'}</span>
            </div>
          </Link>
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

