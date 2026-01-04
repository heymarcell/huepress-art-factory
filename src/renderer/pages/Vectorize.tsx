import { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Wand2,
  CheckSquare,
  Square,
  Check,
  AlertCircle,
  Loader2,
  Download,
  RefreshCw,
  CheckCircle,
  XCircle,
  Clock,
} from 'lucide-react';
import type { Idea } from '../../shared/schemas';
import styles from './Vectorize.module.css';

// Track vectorization jobs in progress
interface VectorizeJob {
  ideaId: string;
  jobId: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  error?: string;
}

export function Vectorize() {
  const queryClient = useQueryClient();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [jobs, setJobs] = useState<Map<string, VectorizeJob>>(new Map());
  const [isPolling, setIsPolling] = useState(false);
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);
  
  // REF to avoid stale closure in setInterval
  const jobsRef = useRef<Map<string, VectorizeJob>>(new Map());
  
  // Keep ref in sync with state
  useEffect(() => {
    jobsRef.current = jobs;
  }, [jobs]);

  // Health check query
  const { data: healthData } = useQuery({
    queryKey: ['vectorize-health'],
    queryFn: async () => {
      const result = await window.huepress.vectorize.checkHealth();
      if (!result.success) return { healthy: false, error: result.error };
      return result.data;
    },
    refetchInterval: 30000, // Check every 30s
    staleTime: 10000,
  });

  // Restore active jobs on mount
  useEffect(() => {
    async function loadActiveJobs() {
      try {
        const result = await window.huepress.vectorize.listJobs();
        if (result.success && result.data.length > 0) {
          const loadedJobs = new Map<string, VectorizeJob>();
          result.data.forEach((job: any) => {
            loadedJobs.set(job.jobId, {
              jobId: job.jobId,
              ideaId: job.ideaId,
              status: job.status,
            });
            // Also select the idea to show it as processing
            setSelectedIds(prev => {
              const next = new Set(prev);
              next.add(job.ideaId);
              return next;
            });
          });
          setJobs(loadedJobs);
          // Start polling if we have jobs
          setIsPolling(true);
        }
      } catch (err) {
        console.error('Failed to load active jobs:', err);
      }
    }
    loadActiveJobs();
  }, []);

  // Fetch approved/generated ideas
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['ideas', 'vectorizable'],
    queryFn: async () => {
      const result = await window.huepress.ideas.list({
        status: ['Approved'],
        limit: 1000,
      });
      if (!result.success) throw new Error(result.error);
      return result.data.ideas;
    },
  });

  // Filter ideas with images
  const ideasWithImages = (data || []).filter((idea: Idea) => idea.image_path);

  // Auto-select all on first load only
  const hasInitializedRef = useRef(false);
  useEffect(() => {
    if (!hasInitializedRef.current && ideasWithImages.length > 0) {
      setSelectedIds(new Set(ideasWithImages.map((i: Idea) => i.id)));
      hasInitializedRef.current = true;
    }
  }, [ideasWithImages]);

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }
    };
  }, []);

  // Selection Logic
  const toggleSelection = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    if (selectedIds.size === ideasWithImages.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(ideasWithImages.map((i: Idea) => i.id)));
    }
  };

  // Poll job statuses
  const pollJobStatuses = async () => {
    console.log('[Vectorize] Polling job statuses, jobs map size:', jobsRef.current.size);
    
    const pendingJobs = Array.from(jobsRef.current.values()).filter(
      j => j.status === 'pending' || j.status === 'processing'
    );

    console.log('[Vectorize] Pending jobs to poll:', pendingJobs.length, pendingJobs.map(j => j.jobId));

    if (pendingJobs.length === 0) {
      console.log('[Vectorize] No pending jobs, stopping poll');
      setIsPolling(false);
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
      return;
    }

    for (const job of pendingJobs) {
      try {
        console.log('[Vectorize] Calling getStatus for job:', job.jobId);
        const result = await window.huepress.vectorize.getStatus(job.jobId);
        console.log('[Vectorize] getStatus result:', result);
        
        if (result.success && result.data) {
          const newStatus = result.data.status;
          console.log('[Vectorize] Job status update:', job.jobId, newStatus);
          
          setJobs(prev => {
            const updated = new Map(prev);
            updated.set(job.ideaId, {
              ...job,
              status: newStatus,
              error: result.data.error,
            });
            return updated;
          });

          // If completed, download the result
          if (newStatus === 'completed') {
            console.log('[Vectorize] Job completed, downloading:', job.jobId);
            try {
              await window.huepress.vectorize.download(job.ideaId, job.jobId);
              console.log('[Vectorize] Download complete for:', job.jobId);
              
              // Invalidate ideas queries to refresh lists (Library and Vectorize page)
              queryClient.invalidateQueries({ queryKey: ['ideas'] });
              
              // Remove from local jobs state so it stops polling
              setJobs(prev => {
                const updated = new Map(prev);
                updated.delete(job.ideaId);
                return updated;
              });
            } catch (err) {
              console.error('[Vectorize] Download error:', err);
            }
          }
        }
      } catch (err) {
        console.error('[Vectorize] Poll error for job:', job.jobId, err);
      }
    }
  };

  // Vectorize mutation
  const vectorizeMutation = useMutation({
    mutationFn: async () => {
      if (selectedIds.size === 0) throw new Error('No ideas selected');

      const result = await window.huepress.vectorize.submitBatch(Array.from(selectedIds));
      if (!result.success) throw new Error(result.error);

      // Initialize job tracking
      const newJobs = new Map<string, VectorizeJob>();
      for (const job of result.data.jobs) {
        newJobs.set(job.ideaId, {
          ideaId: job.ideaId,
          jobId: job.jobId,
          status: job.error ? 'failed' : 'pending',
          error: job.error,
        });
      }

      return newJobs;
    },
    onSuccess: (newJobs) => {
      setJobs(prev => new Map([...prev, ...newJobs]));
      setSelectedIds(new Set()); // Clear selection
      
      // Start polling
      setIsPolling(true);
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }
      pollIntervalRef.current = setInterval(pollJobStatuses, 5000);
    },
  });

  const canVectorize = selectedIds.size > 0 && healthData?.healthy && !vectorizeMutation.isPending;

  // Get job status for an idea
  const getJobStatus = (ideaId: string): VectorizeJob | undefined => {
    return jobs.get(ideaId);
  };

  // Count completed jobs
  const completedCount = Array.from(jobs.values()).filter(j => j.status === 'completed').length;
  const totalJobCount = jobs.size;

  return (
    <div className={styles.container}>
      <div className={styles.library}>
        <header className={styles.header}>
          <div>
            <h1 className={styles.title}>Vectorize Images</h1>
            <p className={styles.subtitle}>
              {selectedIds.size} selected • {completedCount}/{totalJobCount} vectorized
            </p>
          </div>
          
          <div className={styles.headerActions}>
            {/* Health indicator */}
            <div className={`${styles.healthBadge} ${healthData?.healthy ? styles.healthy : styles.unhealthy}`}>
              {healthData?.healthy ? (
                <>
                  <CheckCircle size={14} />
                  API Ready
                </>
              ) : (
                <>
                  <XCircle size={14} />
                  API Offline
                </>
              )}
            </div>

            <button
              onClick={() => vectorizeMutation.mutate()}
              disabled={!canVectorize}
              className={styles.btnPrimary}
            >
              {vectorizeMutation.isPending ? (
                <>
                  <Loader2 size={16} className={styles.spin} />
                  Submitting...
                </>
              ) : (
                <>
                  <Wand2 size={16} />
                  Vectorize Selected
                </>
              )}
            </button>
          </div>
        </header>

        {/* Error Banner */}
        {vectorizeMutation.isError && (
          <div className={styles.errorBanner}>
            <AlertCircle size={16} />
            <span>{(vectorizeMutation.error as Error).message}</span>
          </div>
        )}

        {/* Polling Status */}
        {isPolling && (
          <div className={styles.pollingBanner}>
            <Loader2 size={16} className={styles.spin} />
            <span>Processing vectorization jobs... This may take 30-90 seconds per image.</span>
          </div>
        )}

        {/* Toolbar */}
        <div className={styles.toolbar}>
          <button onClick={() => refetch()} className={styles.btnSecondary}>
            <RefreshCw size={14} />
            Refresh
          </button>
          
          <div className={styles.toolbarSpacer} />
          
          <button onClick={selectAll} className={styles.btnText}>
            {selectedIds.size === ideasWithImages.length ? 'Deselect All' : 'Select All'}
          </button>
        </div>

        {/* Grid Content */}
        <div className={styles.content}>
          {isLoading ? (
            <div className={styles.loading}>
              <Loader2 size={32} className={styles.spin} />
              <p>Loading images...</p>
            </div>
          ) : ideasWithImages.length === 0 ? (
            <div className={styles.empty}>
              <p>No approved images to vectorize.</p>
            </div>
          ) : (
            <div className={styles.grid}>
              {ideasWithImages.map((idea) => {
                const isSelected = selectedIds.has(idea.id);
                const job = getJobStatus(idea.id);
                
                return (
                  <div
                    key={idea.id}
                    className={`${styles.card} ${isSelected ? styles.selected : ''} ${job?.status ? styles[job.status] : ''}`}
                    onClick={() => !job && toggleSelection(idea.id)}
                  >
                    {/* Selection checkbox or status indicator */}
                    <div className={styles.statusOverlay}>
                      {job ? (
                        <div className={`${styles.jobStatus} ${styles[job.status]}`}>
                          {job.status === 'pending' && <Clock size={20} />}
                          {job.status === 'processing' && <Loader2 size={20} className={styles.spin} />}
                          {job.status === 'completed' && <Check size={20} />}
                          {job.status === 'failed' && <XCircle size={20} />}
                        </div>
                      ) : (
                        <div className={styles.checkbox}>
                          {isSelected ? <CheckSquare size={20} /> : <Square size={20} />}
                        </div>
                      )}
                    </div>
                    
                    {idea.image_path && (
                      <img
                        src={`asset://${idea.image_path}`}
                        alt={idea.title}
                        className={styles.thumbnail}
                        loading="lazy"
                      />
                    )}
                    
                    <div className={styles.cardInfo}>
                      <div className={styles.cardTitle}>{idea.title}</div>
                      <div className={styles.cardMeta}>
                        {job?.status === 'completed' ? (
                          <span className={styles.completedBadge}>
                            <Download size={12} />
                            SVG Ready
                          </span>
                        ) : job?.status === 'failed' ? (
                          <span className={styles.failedBadge}>
                            {job.error || 'Failed'}
                          </span>
                        ) : (
                          <span className={styles.statusBadge}>{idea.status}</span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
