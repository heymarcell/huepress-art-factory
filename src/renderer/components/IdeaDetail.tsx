import { useState, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { X, Palette, Check, Tag, Lightbulb, Heart, FileText, Trash2, Image as ImageIcon, AlertCircle, Pencil } from 'lucide-react';
import type { Idea, GenerationAttempt } from '../../shared/schemas';
import styles from './IdeaDetail.module.css';

interface IdeaDetailProps {
  idea: Idea;
  onClose: () => void;
  onStatusChange?: (status: Idea['status']) => void;
  onDelete?: () => void;
  onGenerate?: () => void;
  onVersionChange?: (attemptId: string) => void;
}

const STATUS_OPTIONS: Idea['status'][] = [
  'Imported',
  'Queued',
  'Generating',
  'Generated',
  'NeedsAttention',
  'Failed',
  'Approved',
  'Exported',
  'Omitted',
];

export function IdeaDetail({ idea, onClose, onStatusChange, onDelete, onGenerate, onVersionChange }: IdeaDetailProps) {
  const [logs, setLogs] = useState<string[]>([]);
  const [now, setNow] = useState(Date.now());
  const [showLightbox, setShowLightbox] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editInstruction, setEditInstruction] = useState('');
  const [isSubmittingEdit, setIsSubmittingEdit] = useState(false);
  const queryClient = useQueryClient();

  // Fetch attempts (history)
  const { data: attempts, refetch: refetchAttempts } = useQuery<GenerationAttempt[]>({
    queryKey: ['attempts', idea.id],
    queryFn: async () => {
       const res = await window.huepress.ideas.getAttempts(idea.id);
       return res.success ? res.data : [];
    },
    enabled: !!idea.id,
  });

  // Refetch attempts when idea updates (e.g. status changes to Generated)
  useEffect(() => {
    if (idea.status === 'Generated' || idea.status === 'Failed') {
      refetchAttempts();
    }
  }, [idea.status, idea.updated_at, refetchAttempts]);

  // Get the currently selected attempt (for QC report display)
  const selectedAttempt = attempts?.find(a => a.id === idea.selected_attempt_id) || attempts?.[0];

  const handleStatusChange = (newStatus: Idea['status']) => {
    if (onStatusChange) {
      onStatusChange(newStatus);
    }
  };

  useEffect(() => {
    // Reset state when idea changes
    setLogs([]);
    // No need to reset elapsed manually as it derives from idea.updated_at
  }, [idea.id]);

  useEffect(() => {
    if (idea.status !== 'Generating' && idea.status !== 'Queued') {
      return;
    }

    const timer = setInterval(() => setNow(Date.now()), 1000);

    // Subscribe to progress if available
    let unsubscribe = () => { /* noop */ };
    if (window.huepress?.jobs?.onProgress) {
      unsubscribe = window.huepress.jobs.onProgress((data) => {
        if (data.ideaId === idea.id && data.message) {
          setLogs(prev => [...prev.slice(-4), data.message!]);
        }
      });
    }

    return () => {
      clearInterval(timer);
      unsubscribe();
    };
  }, [idea.id, idea.status]);

  const elapsed = idea.updated_at 
    ? Math.max(0, Math.floor((now - new Date(idea.updated_at).getTime()) / 1000))
    : 0;


  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const validAttempts = attempts?.filter(a => a.image_path) || [];

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        if (validAttempts.length < 2) return;
        e.preventDefault();

        const currentId = idea.selected_attempt_id || validAttempts[0]?.id;
        const idx = validAttempts.findIndex(a => a.id === currentId);
        if (idx === -1) return;

        let newIdx = idx;
        // ArrowRight = Next in list, ArrowLeft = Prev in list
        // Assuming list is rendered in order (usually newest or oldest first depending on API, but array order matters)
        if (e.key === 'ArrowRight') {
          newIdx = Math.min(validAttempts.length - 1, idx + 1);
        } else {
          newIdx = Math.max(0, idx - 1);
        }

        if (newIdx !== idx && onVersionChange) {
          onVersionChange(validAttempts[newIdx].id);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [validAttempts, idea.selected_attempt_id, onVersionChange]);

  const isGenerating = idea.status === 'Generating' || idea.status === 'Queued';

  const renderProgress = () => (
    <>
      <Palette size={isGenerating && idea.image_path ? 24 : 48} strokeWidth={1} className={styles.spinner} />
      <span className={isGenerating && idea.image_path ? "text-xs font-medium text-blue-400" : "mt-2 text-blue-400 font-medium"}>
        Generating Art... {formatTime(elapsed)}
      </span>
      
      {/* Progress Bar */}
      <div className={styles.progressBarContainer} style={isGenerating && idea.image_path ? { marginTop: 8, height: 2 } : {}}>
          <div className={styles.progressBarFill} />
      </div>

      {/* Streaming Logs */}
      <div className={styles.logContainer} style={isGenerating && idea.image_path ? { height: 30, marginTop: 4 } : {}}>
        {logs.map((log, i) => (
          <span key={i} className={`${styles.logItem} ${i === logs.length - 1 ? styles.logLatest : ''}`}>
            {log}
          </span>
        ))}
      </div>
    </>
  );

  /* Lightbox State */
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [resolution, setResolution] = useState<{w: number, h: number} | null>(null);

  useEffect(() => {
    // Reset resolution when image changes
    setResolution(null);
  }, [idea.image_path, idea.selected_attempt_id]);

  /* Reset Lightbox on open/close */
  useEffect(() => {
    if (!showLightbox) {
      setZoom(1);
      setPan({ x: 0, y: 0 });
    }
  }, [showLightbox]);

  const handleZoom = (delta: number) => {
    setZoom(prev => Math.min(5, Math.max(1, prev + delta)));
  };

  const handleWheel = (e: React.WheelEvent) => {
    e.stopPropagation();
    if (e.ctrlKey || e.metaKey || showLightbox) {
      // Zoom
      const delta = -e.deltaY * 0.005;
      setZoom(prev => Math.min(5, Math.max(1, prev + delta)));
    }
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (zoom > 1) {
      setIsDragging(true);
      setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isDragging && zoom > 1) {
      setPan({
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y
      });
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  /* Smart ESC Logic */
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore inputs
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      if (e.key === 'Escape') {
        if (showLightbox) {
          setShowLightbox(false);
          e.stopPropagation();
          return;
        } else {
          onClose(); // Close detail panel
          return;
        }
      }

      // Existing Arrow logic
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        if (validAttempts.length < 2) return;
        e.preventDefault();

        const currentId = idea.selected_attempt_id || validAttempts[0]?.id;
        const idx = validAttempts.findIndex(a => a.id === currentId);
        if (idx === -1) return;

        let newIdx = idx;
        if (e.key === 'ArrowRight') {
          newIdx = Math.min(validAttempts.length - 1, idx + 1);
        } else {
          newIdx = Math.max(0, idx - 1);
        }

        if (newIdx !== idx && onVersionChange) {
          onVersionChange(validAttempts[newIdx].id);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [validAttempts, idea.selected_attempt_id, onVersionChange, showLightbox, onClose]);

  // ... (render) ...

  return (
    <>
      <div className={styles.overlay} onClick={onClose}>
        {/* ... (panel code remains same) ... */}
        <div className={styles.panel} onClick={(e) => e.stopPropagation()}>
           {/* ... header ... */}
           <header className={styles.header}>
            <h2 className={styles.title}>{idea.title}</h2>
            <div className={styles.headerActions}>
              <div className={styles.badges}>
                <select
                  className={styles.statusSelect}
                  value={idea.status}
                  onChange={(e) => handleStatusChange(e.target.value as Idea['status'])}
                >
                  {STATUS_OPTIONS.map((status) => (
                    <option key={status} value={status}>
                      {status}
                    </option>
                  ))}
                </select>
                <span className={styles.skillBadge}>{idea.skill}</span>
                <span className={styles.categoryBadge}>{idea.category}</span>
              </div>
              <div className={styles.separator} />
              <button className={styles.closeButton} onClick={onClose}>
                <X size={18} />
              </button>
            </div>
          </header>

          <div className={styles.body}>
            {/* Left Side: Image & Versions */}
            <div className={styles.imageContainer}>
              {/* Main Image */}
              <div className={styles.imageWrapper} onClick={() => idea.image_path && setShowLightbox(true)}>
                {idea.image_path ? (
                  <>
                    <img 
                      src={`asset://${idea.image_path}`} 
                      alt={idea.title} 
                      className={styles.image} 
                      onLoad={(e) => {
                        setResolution({
                          w: e.currentTarget.naturalWidth,
                          h: e.currentTarget.naturalHeight
                        });
                      }}
                    />
                    {resolution && (
                      <div className={styles.resolutionBadge}>
                         {resolution.w} x {resolution.h}
                      </div>
                    )}
                    {isGenerating && (
                      <div className={styles.overlayProgress}>
                        {renderProgress()}
                      </div>
                    )}
                  </>
                ) : (
                    <div className={styles.placeholder}>
                      {idea.status === 'Failed' ? (
                        <>
                          <AlertCircle size={48} strokeWidth={1} className="text-red-500" />
                          <span className="text-red-400 mt-2">Generation Failed</span>
                        </>
                      ) : isGenerating ? (
                        renderProgress()
                      ) : (
                        <>
                          <ImageIcon size={48} strokeWidth={1} />
                          <span>No image generated</span>
                        </>
                      )}
                    </div>
                )}
              </div>

              {/* Versions List */}
              {validAttempts.length > 0 && (
                <>
                  <div className={styles.versionsLabel}>Versions ({validAttempts.length})</div>
                  <div className={styles.versionsList}>
                    {validAttempts.map((attempt) => (
                        <div 
                          key={attempt.id} 
                          className={`${styles.versionThumb} ${
                            (idea.selected_attempt_id === attempt.id || (!idea.selected_attempt_id && validAttempts[0].id === attempt.id)) 
                              ? styles.versionThumbActive 
                              : ''
                          }`}
                          onClick={() => onVersionChange && onVersionChange(attempt.id)}
                          title={new Date(attempt.created_at).toLocaleString()}
                        >
                          <img src={`asset://${attempt.image_path}`} className={styles.versionImg} loading="lazy" />
                        </div>
                    ))}
                  </div>
                </>
              )}
            </div>

            {/* Right Side: Details */}
            <div className={styles.content}>

            {/* Description */}
            <section className={styles.section}>
              <div className={styles.sectionHeader}>
                <FileText size={14} />
                <h3>Description</h3>
              </div>
              <p className={styles.description}>{idea.description}</p>
            </section>

            {/* Extended Description */}
            {idea.extended_description && (
              <section className={styles.section}>
                <div className={styles.sectionHeader}>
                  <FileText size={14} />
                  <h3>Extended Description</h3>
                </div>
                <p className={styles.text}>{idea.extended_description}</p>
              </section>
            )}

            {/* Tags */}
            {idea.tags && idea.tags.length > 0 && (
              <section className={styles.section}>
                <div className={styles.sectionHeader}>
                  <Tag size={14} />
                  <h3>Tags</h3>
                </div>
                <div className={styles.tags}>
                  {idea.tags.map((tag) => (
                    <span key={tag} className={styles.tag}>
                      {tag}
                    </span>
                  ))}
                </div>
              </section>
            )}

            {/* Fun Facts */}
            {idea.fun_facts && idea.fun_facts.length > 0 && (
              <section className={styles.section}>
                <div className={styles.sectionHeader}>
                  <Lightbulb size={14} />
                  <h3>Fun Facts</h3>
                </div>
                <ul className={styles.list}>
                  {idea.fun_facts.map((fact, i) => (
                    <li key={i}>{fact}</li>
                  ))}
                </ul>
              </section>
            )}

            {/* Coloring Tips */}
            {idea.coloring_tips && idea.coloring_tips.length > 0 && (
              <section className={styles.section}>
                <div className={styles.sectionHeader}>
                  <Palette size={14} />
                  <h3>Coloring Tips</h3>
                </div>
                <ul className={styles.list}>
                  {idea.coloring_tips.map((tip, i) => (
                    <li key={i}>{tip}</li>
                  ))}
                </ul>
              </section>
            )}

            {/* Therapeutic Benefits */}
            {idea.therapeutic_benefits && idea.therapeutic_benefits.length > 0 && (
              <section className={styles.section}>
                <div className={styles.sectionHeader}>
                  <Heart size={14} />
                  <h3>Therapeutic Benefits</h3>
                </div>
                <ul className={styles.list}>
                  {idea.therapeutic_benefits.map((benefit, i) => (
                    <li key={i}>{benefit}</li>
                  ))}
                </ul>
              </section>
            )}

            {/* Notes */}
            <section className={styles.section}>
              <div className={styles.sectionHeader}>
                <FileText size={14} />
                <h3>Notes</h3>
              </div>
              <textarea
                className={styles.notesTextarea}
                value={idea.notes || ''}
                onChange={async (e) => {
                  const newNotes = e.target.value;
                  await window.huepress.ideas.updateFields(idea.id, { notes: newNotes });
                  queryClient.invalidateQueries({ queryKey: ['idea', idea.id] });
                }}
                placeholder="Add notes about this idea..."
                rows={3}
              />
            </section>

            {/* QC Report */}
            {selectedAttempt?.qc_report && (() => {
              try {
                const qc = JSON.parse(selectedAttempt.qc_report);
                return (
                  <section className={styles.section}>
                    <div className={styles.sectionHeader}>
                      <AlertCircle size={14} />
                      <h3>QC Report</h3>
                    </div>
                    <div className={styles.qcReport}>
                      <div className={`${styles.qcStatus} ${qc.passed ? styles.qcPassed : styles.qcFailed}`}>
                        {qc.passed ? '✓ Passed' : '✗ Failed'}
                      </div>
                      {qc.error && (
                        <div className={styles.qcError}>{qc.error}</div>
                      )}
                      {qc.warnings && qc.warnings.length > 0 && (
                        <ul className={styles.qcWarnings}>
                          {qc.warnings.map((w: string, i: number) => (
                            <li key={i}>{w}</li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </section>
                );
              } catch {
                return null;
              }
            })()}

            {/* Metadata */}
            <section className={styles.section}>
              <div className={styles.sectionHeader}>
                <h3>Metadata</h3>
              </div>
              <div className={styles.metadata}>
                <div className={styles.metaItem}>
                  <span className={styles.metaLabel}>ID</span>
                  <code className={styles.metaValue}>{idea.id}</code>
                </div>
                <div className={styles.metaItem}>
                  <span className={styles.metaLabel}>Batch</span>
                  <code className={styles.metaValue}>{idea.batch_id}</code>
                </div>
                <div className={styles.metaItem}>
                  <span className={styles.metaLabel}>Created</span>
                  <span className={styles.metaValue}>
                    {new Date(idea.created_at).toLocaleString()}
                  </span>
                </div>
                <div className={styles.metaItem}>
                  <span className={styles.metaLabel}>Updated</span>
                  <span className={styles.metaValue}>
                    {new Date(idea.updated_at).toLocaleString()}
                  </span>
                </div>
              </div>
            </section>

          </div>
          </div>

          {/* Actions */}
          <footer className={styles.footer}>
            <button 
              className={styles.actionButton} 
              onClick={onGenerate}
              disabled={
                !onGenerate || 
                idea.status === 'Generating' || 
                idea.status === 'Queued' ||
                idea.status === 'Approved'
              }
              title={idea.status === 'Approved' ? 'Generation disabled for approved items' : ''}
            >
              <Palette size={14} />
              {idea.status === 'Generating' || idea.status === 'Queued' ? 'Generating...' : idea.status === 'Failed' ? 'Retry Generation' : 'Generate'}
            </button>
            <button
              className={`${styles.actionButton} ${styles.approveButton}`}
              onClick={() => handleStatusChange('Approved')}
              disabled={idea.status === 'Approved'}
            >
              <Check size={14} />
              Approve
            </button>
            {onDelete && (
              <button 
                className={styles.deleteButton} 
                onClick={onDelete}
                disabled={idea.status === 'Approved'}
                title={idea.status === 'Approved' ? 'Cannot delete approved items' : ''}
              >
                <Trash2 size={14} />
              </button>
            )}
            {/* Edit Button - Only show when image exists */}
            {idea.image_path && (
              <button 
                className={styles.actionButton} 
                onClick={() => setShowEditModal(true)}
                disabled={
                  idea.status === 'Generating' || 
                  idea.status === 'Queued' ||
                  idea.status === 'Approved'
                }
                title="Edit image with text instruction"
              >
                <Pencil size={14} />
                Edit
              </button>
            )}
          </footer>
        </div>
      </div>

      {/* Lightbox */}
      {showLightbox && idea.image_path && (
        <div 
           className={styles.lightbox} 
           onClick={() => setShowLightbox(false)}
           onWheel={handleWheel}
           onMouseDown={handleMouseDown}
           onMouseMove={handleMouseMove}
           onMouseUp={handleMouseUp}
           onMouseLeave={handleMouseUp}
        >
           <img 
             src={`asset://${idea.image_path}`} 
             alt={idea.title} 
             className={styles.lightboxImage} 
             onClick={(e) => e.stopPropagation()}
             style={{
               transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
               cursor: zoom > 1 ? (isDragging ? 'grabbing' : 'grab') : 'default'
             }}
             draggable={false}
           />
           
           {/* Floating Toolbar */}
           <div className={styles.lightboxToolbar} onClick={(e) => e.stopPropagation()}>
             <button className={styles.lightboxButton} onClick={() => handleZoom(-0.5)}>
               -
             </button>
             <span className={styles.zoomLevel}>
               {Math.round(zoom * 100)}%
             </span>
             <button className={styles.lightboxButton} onClick={() => handleZoom(0.5)}>
               +
             </button>
           </div>

           <button className={styles.lightboxClose} onClick={() => setShowLightbox(false)}>
             <X size={24} />
           </button>
        </div>
      )}

      {/* Edit Modal */}
      {showEditModal && (
        <div className={styles.overlay} onClick={() => setShowEditModal(false)}>
          <div className={styles.editModal} onClick={(e) => e.stopPropagation()}>
            <header className={styles.editModalHeader}>
              <h3>Edit Image</h3>
              <button className={styles.closeButton} onClick={() => setShowEditModal(false)}>
                <X size={18} />
              </button>
            </header>
            <div className={styles.editModalBody}>
              <p className={styles.editHint}>
                Describe what changes you want to make to the current image:
              </p>
              <textarea
                className={styles.editTextarea}
                value={editInstruction}
                onChange={(e) => setEditInstruction(e.target.value)}
                placeholder="e.g., Make the eyes bigger, remove the hat, add a bow on the tail..."
                rows={4}
                autoFocus
              />
            </div>
            <footer className={styles.editModalFooter}>
              <button 
                className={styles.actionButton}
                onClick={() => setShowEditModal(false)}
              >
                Cancel
              </button>
              <button 
                className={`${styles.actionButton} ${styles.approveButton}`}
                onClick={async () => {
                  if (!editInstruction.trim()) return;
                  setIsSubmittingEdit(true);
                  try {
                    await window.huepress.jobs.edit(idea.id, editInstruction.trim());
                    // Invalidate queries to refresh UI immediately
                    queryClient.invalidateQueries({ queryKey: ['ideas'] });
                    queryClient.invalidateQueries({ queryKey: ['idea', idea.id] });
                    setShowEditModal(false);
                    setEditInstruction('');
                  } catch (err) {
                    console.error('Edit failed:', err);
                  } finally {
                    setIsSubmittingEdit(false);
                  }
                }}
                disabled={!editInstruction.trim() || isSubmittingEdit}
              >
                {isSubmittingEdit ? 'Submitting...' : 'Apply Edit'}
              </button>
            </footer>
          </div>
        </div>
      )}
    </>
  );
}

