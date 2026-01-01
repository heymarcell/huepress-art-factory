import { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Folder,
  Download,
  CheckSquare,
  Square,
  Check,
  AlertCircle,
  Loader2,
} from 'lucide-react';
import type { Idea } from '../../shared/schemas';
import styles from './Export.module.css';

export function Export() {
  const queryClient = useQueryClient();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [destination, setDestination] = useState<string>('');
  const [format, setFormat] = useState<'png' | 'tiff'>('png');
  const [includeSidecar, setIncludeSidecar] = useState(true);
  const [exportResult, setExportResult] = useState<{
    success: boolean;
    exported?: number;
    errors?: string[];
  } | null>(null);

  // Fetch approved/generated ideas
  const { data, isLoading } = useQuery({
    queryKey: ['ideas', 'exportable'],
    queryFn: async () => {
      const result = await window.huepress.ideas.list({
        status: ['Approved', 'Generated'],
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

  const selectFolder = async () => {
    const result = await window.huepress.export.selectFolder();
    if (result.success && result.data.selected && result.data.path) {
      setDestination(result.data.path);
    }
  };

  // Export Mutation
  const exportMutation = useMutation({
    mutationFn: async () => {
      if (!destination) throw new Error('No destination selected');
      if (selectedIds.size === 0) throw new Error('No ideas selected');
      
      const result = await window.huepress.export.run({
        ideaIds: Array.from(selectedIds),
        destination,
        format,
        includeSidecar,
      });
      
      if (!result.success) throw new Error(result.error);
      return result.data;
    },
    onSuccess: (data) => {
      setExportResult({
        success: true,
        exported: data.exported,
        errors: data.errors,
      });
      // Refetch to show updated 'Exported' status
      queryClient.invalidateQueries({ queryKey: ['ideas'] });
    },
    onError: (error) => {
      setExportResult({
        success: false,
        exported: 0,
        errors: [error instanceof Error ? error.message : 'Unknown error'],
      });
    },
  });

  const canExport = selectedIds.size > 0 && destination && !exportMutation.isPending;

  return (
    <div className={styles.container}>
      <div className={styles.library}>
        <header className={styles.header}>
          <div>
            <h1 className={styles.title}>Export Images</h1>
            <p className={styles.subtitle}>{selectedIds.size} images selected</p>
          </div>
          
          <div className={styles.headerActions}>
             <button
              onClick={() => exportMutation.mutate()}
              disabled={!canExport}
              className={styles.btnPrimary}
            >
              {exportMutation.isPending ? (
                <>
                  <Loader2 size={16} className={styles.spin} />
                  Exporting...
                </>
              ) : (
                <>
                  <Download size={16} />
                  Export Selected
                </>
              )}
            </button>
          </div>
        </header>

        {/* Export Result */}
        {exportResult && (
          <div className={`${styles.resultCard} ${exportResult.success ? styles.success : styles.error}`}>
            {exportResult.success ? (
              <div className={styles.resultContent}>
                <Check size={16} />
                <span>Successfully exported {exportResult.exported} images to {destination}</span>
                <button className={styles.closeResult} onClick={() => setExportResult(null)}>Dismiss</button>
              </div>
            ) : (
              <div className={styles.resultContent}>
                <AlertCircle size={16} />
                <span>Failed: {exportResult.errors?.[0]}</span>
                 <button className={styles.closeResult} onClick={() => setExportResult(null)}>Dismiss</button>
              </div>
            )}
          </div>
        )}

        {/* Toolbar / Options */}
        <div className={styles.toolbar}>
          <div className={styles.toolbarGroup}>
            <div className={styles.folderPicker}>
              <button onClick={selectFolder} className={styles.btnSecondary}>
                <Folder size={14} />
                {destination ? 'Change Destination' : 'Select Destination'}
              </button>
              {destination && (
                 <span className={styles.folderPath} title={destination}>{destination}</span>
              )}
            </div>
          </div>

          <div className={styles.toolbarGroup}>
            <div className={styles.formatToggle}>
              <button
                className={`${styles.toggleBtn} ${format === 'png' ? styles.active : ''}`}
                onClick={() => setFormat('png')}
              >
                PNG
              </button>
              <button
                className={`${styles.toggleBtn} ${format === 'tiff' ? styles.active : ''}`}
                onClick={() => setFormat('tiff')}
              >
                TIFF
              </button>
            </div>
            
            {/* JSON Metadata Checkbox - Custom styled */}
            <button
              onClick={() => setIncludeSidecar(!includeSidecar)}
              className={`${styles.checkboxBtn} ${includeSidecar ? styles.checkboxBtnActive : ''}`}
            >
              {includeSidecar && <Check size={14} />}
              JSON Metadata
            </button>
          </div>
          
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
              <p>Loading your masterpieces...</p>
            </div>
          ) : ideasWithImages.length === 0 ? (
            <div className={styles.empty}>
              <p>No approved images to export.</p>
            </div>
          ) : (
            <>
              {console.log('Rendering grid with', ideasWithImages.length, 'ideas')}
              <div className={styles.grid}>
              {ideasWithImages.map((idea) => {
                const isSelected = selectedIds.has(idea.id);
                return (
                  <div
                    key={idea.id}
                    className={`${styles.card} ${isSelected ? styles.selected : ''}`}
                    onClick={() => toggleSelection(idea.id)}
                  >
                    <div className={styles.checkbox}>
                      {isSelected ? (
                        <CheckSquare size={20} />
                      ) : (
                        <Square size={20} />
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
                        <span className={styles.statusBadge}>{idea.status}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
