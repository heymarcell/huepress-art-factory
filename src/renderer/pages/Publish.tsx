import { useState, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Globe,
  Loader2,
  CheckSquare,
  Square,
  UploadCloud,
  CheckCircle,
  XCircle
} from 'lucide-react';
import type { Idea } from '../../shared/schemas';
import { useBatchPublish } from '../hooks/useBatchPublish';
import styles from './Publish.module.css';

export function Publish() {
  const queryClient = useQueryClient();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const { publish, cancel, reset, batchStatus, isPublishing } = useBatchPublish();

  // Fetch only Vectorized ideas (ready for publish)
  const { data, isLoading } = useQuery({
    queryKey: ['ideas', 'publishable'],
    queryFn: async () => {
      const result = await window.huepress.ideas.list({
        status: ['Vectorized'], // Strictly Vectorized only, as requested 
        // The user said "only allow asset that has vectorized state"
        // Usually 'Vectorized' status implies it has SVG. 
        limit: 1000,
      });
      if (!result.success) throw new Error(result.error);
      return result.data.ideas;
    },
  });

  const ideas = data || [];

  // Selection Logic
  const toggleSelection = (id: string) => {
    if (isPublishing) return;
    
    // Clear previous batch status if user interacts
    if (Object.keys(batchStatus).length > 0) reset();

    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    if (isPublishing) return;

    // Clear previous batch status if user interacts
    if (Object.keys(batchStatus).length > 0) reset();

    if (selectedIds.size === ideas.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(ideas.map((i: Idea) => i.id)));
    }
  };

  const handlePublish = async () => {
    await publish(Array.from(selectedIds));
    // Invalidate queries to refresh any status changes? 
    // Currently sync doesn't change local status in DB (it stays Vectorized), 
    // but maybe we should visualize "Synced" state if we tracked it.
  };

  // Calculate Progress
  const progress = useMemo(() => {
    if (!isPublishing && selectedIds.size === 0) return 0;
    const total = selectedIds.size;
    const completed = Array.from(selectedIds).filter(id => 
      batchStatus[id]?.status === 'success' || batchStatus[id]?.status === 'error'
    ).length;
    return (completed / total) * 100;
  }, [isPublishing, selectedIds, batchStatus]);

  const successCount = Array.from(selectedIds).filter(id => batchStatus[id]?.status === 'success').length;
  const errorCount = Array.from(selectedIds).filter(id => batchStatus[id]?.status === 'error').length;

  return (
    <div className={styles.container}>
      <div className={styles.library}>
        <header className={styles.header}>
          <div>
            <h1 className={styles.title}>Publish to Web</h1>
            <p className={styles.subtitle}>
              {selectedIds.size} selected for publishing
            </p>
          </div>
          
          <div className={styles.headerActions}>
             {isPublishing ? (
               <button onClick={cancel} className={styles.btnSecondary}>
                 Cancel
               </button>
             ) : (
               <button
                onClick={handlePublish}
                disabled={selectedIds.size === 0}
                className={styles.btnPrimary}
              >
                <UploadCloud size={16} />
                Publish Selected
              </button>
             )}
          </div>
        </header>

        {/* Progress Bar */}
        {(isPublishing || successCount > 0 || errorCount > 0) && (
          <div className={styles.progressContainer}>
            <div className={styles.progressLabel}>
              <span>
                {isPublishing ? 'Publishing...' : 'Batch Complete'} 
                {status && ` (${successCount} success, ${errorCount} failed)`}
              </span>
              <span>{Math.round(progress)}%</span>
            </div>
            <div className={styles.progressBar}>
              <div 
                className={styles.progressFill} 
                style={{ width: `${progress}%` }} 
              />
            </div>
          </div>
        )}

        {/* Toolbar */}
        <div className={styles.toolbar}>
          <div className={styles.toolbarSpacer} />
           <button onClick={selectAll} className={styles.btnText} disabled={isPublishing}>
            {selectedIds.size === ideas.length ? 'Deselect All' : 'Select All'}
          </button>
        </div>

        {/* Grid Content */}
        <div className={styles.content}>
          {isLoading ? (
            <div className={styles.loading}>
              <Loader2 size={32} className={styles.spin} />
              <p>Loading vectorized assets...</p>
            </div>
          ) : ideas.length === 0 ? (
            <div className={styles.empty}>
              <p>No vectorized assets found. Go to Library and vectorize some ideas first.</p>
            </div>
          ) : (
            <div className={styles.grid}>
              {ideas.map((idea) => {
                const isSelected = selectedIds.has(idea.id);
                const status = batchStatus[idea.id]?.status;
                const error = batchStatus[idea.id]?.error;

                return (
                  <div
                    key={idea.id}
                    className={`${styles.card} ${isSelected ? styles.selected : ''}`}
                    onClick={() => toggleSelection(idea.id)}
                  >
                    {/* Status Overlay */}
                    {status === 'pending' && (
                       <div className={styles.statusOverlay}>
                         <Loader2 size={24} className={styles.spin} />
                       </div>
                    )}
                    {status === 'success' && (
                       <div className={`${styles.statusOverlay} ${styles.statusSuccess}`}>
                         <CheckCircle size={32} />
                       </div>
                    )}
                    {status === 'error' && (
                       <div className={`${styles.statusOverlay} ${styles.statusError}`} title={error}>
                         <XCircle size={32} />
                       </div>
                    )}

                    <div className={styles.checkbox}>
                      {isSelected ? (
                        <CheckSquare size={20} />
                      ) : (
                        <Square size={20} />
                      )}
                    </div>
                    
                    {idea.svg_path ? (
                      <img
                        src={`asset://${idea.svg_path}`}
                        alt={idea.title}
                        className={styles.thumbnail}
                        loading="lazy"
                      />
                    ) : null}
                    
                    <div className={styles.cardInfo}>
                      <div className={styles.cardTitle}>{idea.title}</div>
                      <div className={styles.cardMeta}>
                        <span className={styles.statusBadge}>{idea.category}</span>
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
