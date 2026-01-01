
import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { 
  Loader2, RefreshCw, CheckCircle2, XCircle, Clock, 
  ChevronRight, ChevronDown, Layers, FileText
} from 'lucide-react';
import styles from './BatchJobs.module.css';

// Raw DB row from backend
interface BatchJobRow {
  id: string;
  gemini_job_id: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  idea_ids: string; // JSON string in DB
  mode: string;
  created_at: string;
  completed_at?: string;
  error?: string;
}

// UI Model
interface BatchJob {
  id: string;
  gemini_job_id: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  idea_ids: string[]; // Parsed array
  mode: string;
  created_at: string;
  completed_at?: string;
  error?: string;
  // Computed fields
  totalIdeas: number;
}

export function BatchJobs() {
  const queryClient = useQueryClient();
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Fetch batch jobs
  const { data: jobs = [], isLoading, isError } = useQuery({
    queryKey: ['batch-jobs'],
    queryFn: async (): Promise<BatchJob[]> => {
      const result = await window.huepress.batch.list();
      if (!result.success) return [];
      
      // Transform raw rows to UI model
      return (result.data as BatchJobRow[]).map(row => {
        let parsedIds: string[] = [];
        try {
          parsedIds = JSON.parse(row.idea_ids);
        } catch (e) {
          console.error('Failed to parse idea_ids for job', row.id);
        }

        return {
          ...row,
          idea_ids: parsedIds,
          totalIdeas: parsedIds.length
        };
      });
    },
    refetchInterval: 10000, // Poll every 10s
  });

  // Manual Poll Mutation
  const pollMutation = useMutation({
    mutationFn: async () => {
      const result = await window.huepress.batch.poll();
      return result;
    },
    onSuccess: (data) => {
      if (data.success) {
        queryClient.invalidateQueries({ queryKey: ['batch-jobs'] });
        queryClient.invalidateQueries({ queryKey: ['ideas'] });
      }
    }
  });

  const toggleExpand = (id: string) => {
    setExpandedId(expandedId === id ? null : id);
  };

  const formatTimeAgo = (dateStr: string) => {
    try {
      const date = new Date(dateStr);
      const now = new Date();
      const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);
      
      if (diffInSeconds < 60) return 'just now';
      if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m ago`;
      if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h ago`;
      return date.toLocaleDateString();
    } catch (e) {
      return dateStr;
    }
  };

  const getStatusColor = (status: string) => {
    switch(status) {
      case 'completed': return 'var(--color-success)';
      case 'processing': return 'var(--color-primary)';
      case 'failed': return 'var(--color-error)';
      default: return 'var(--color-warning)';
    }
  };

  const getStatusIcon = (status: string) => {
    switch(status) {
      case 'completed': return <CheckCircle2 size={16} />;
      case 'processing': return <Loader2 size={16} className={styles.spin} />;
      case 'failed': return <XCircle size={16} />;
      default: return <Clock size={16} />;
    }
  };

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <div className={styles.headerLeft}>
          <div>
            <h1 className={styles.title}>Batch Jobs</h1>
            <p className={styles.subtitle}>Monitor background generation tasks</p>
          </div>
        </div>
        
        <button 
          onClick={() => pollMutation.mutate()}
          className={styles.refreshBtn}
          disabled={pollMutation.isPending}
        >
          {pollMutation.isPending ? (
            <Loader2 size={16} className={styles.spin} />
          ) : (
            <RefreshCw size={16} />
          )}
          {pollMutation.isPending ? 'Syncing...' : 'Sync Now'}
        </button>
      </header>

      {isLoading ? (
        <div className={styles.loading}>
          <Loader2 size={32} className={styles.spin} />
          <p>Loading batch jobs...</p>
        </div>
      ) : isError ? (
        <div className={styles.error}>
          <XCircle size={32} />
          <p>Failed to load batch jobs</p>
        </div>
      ) : jobs.length === 0 ? (
        <div className={styles.empty}>
          <Layers size={48} />
          <h2>No batch jobs found</h2>
          <p>Start a "Slow Mode" generation from the Library to create a batch job.</p>
        </div>
      ) : (
        <div className={styles.jobList}>
          {jobs.map((job: BatchJob) => (
            <div key={job.id} className={styles.jobCard}>
              <div 
                className={styles.jobHeader}
                onClick={() => toggleExpand(job.id)}
              >
                <div className={styles.jobStatus} style={{ color: getStatusColor(job.status) }}>
                  {getStatusIcon(job.status)}
                  <span className={styles.statusText}>{job.status.toUpperCase()}</span>
                </div>
                
                <div className={styles.jobInfo}>
                  <span className={styles.jobId}>Batch #{job.gemini_job_id?.split('/').pop() || job.id.slice(0, 8)}</span>
                  <span className={styles.jobDate}>{formatTimeAgo(job.created_at)}</span>
                </div>

                <div className={styles.jobMetrics}>
                  <div className={styles.metric}>
                    <FileText size={14} />
                    <span>{job.idea_ids.length} Ideas</span>
                  </div>
                </div>

                <div className={styles.expandIcon}>
                  {expandedId === job.id ? <ChevronDown size={20} /> : <ChevronRight size={20} />}
                </div>
              </div>

              {expandedId === job.id && (
                <div className={styles.jobDetails}>
                  <div className={styles.detailRow}>
                    <span className={styles.detailLabel}>Gemini Job ID:</span>
                    <span className={styles.detailValue}>{job.gemini_job_id}</span>
                  </div>
                  {job.error && (
                    <div className={styles.errorBox}>
                      <strong>Error:</strong> {job.error}
                    </div>
                  )}
                  <div className={styles.ideasGrid}>
                     {/* We could list individual ideas here if we fetch their titles later */}
                     <p className={styles.ideasMeta}>Contains {job.idea_ids.length} items. Check Library for individual status.</p>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
