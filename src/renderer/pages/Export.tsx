import { useState, useEffect } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { 
  Folder, 
  Download, 
  CheckSquare, 
  Square, 
  ArrowLeft,
  Check,
  AlertCircle,
  Loader2,
} from 'lucide-react';
import type { Idea } from '../../shared/schemas';
import styles from './Export.module.css';

export function Export() {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [destination, setDestination] = useState<string | null>(null);
  const [format, setFormat] = useState<'png' | 'tiff'>('png');
  const [includeSidecar, setIncludeSidecar] = useState(true);
  const [exportResult, setExportResult] = useState<{
    success: boolean;
    exported: number;
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

  const ideas = data || [];
  const ideasWithImages = ideas.filter((idea: Idea) => idea.image_path);

  // Auto-select all exportable ideas on load
  useEffect(() => {
    if (ideasWithImages.length > 0 && selectedIds.size === 0) {
      setSelectedIds(new Set(ideasWithImages.map((i: Idea) => i.id)));
    }
  }, [ideasWithImages]);

  const toggleSelection = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
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
      <header className={styles.header}>
        <Link to="/library" className={styles.backLink}>
          <ArrowLeft size={16} />
          Back to Library
        </Link>
        <h1>Export Images</h1>
        <p className={styles.subtitle}>
          Export your coloring pages as image files
        </p>
      </header>

      {/* Export Result */}
      {exportResult && (
        <div className={`${styles.resultCard} ${exportResult.success ? styles.success : styles.error}`}>
          {exportResult.success ? (
            <>
              <Check size={24} />
              <div>
                <strong>Export Complete!</strong>
                <p>Successfully exported {exportResult.exported} images to:</p>
                <code>{destination}</code>
                {exportResult.errors && exportResult.errors.length > 0 && (
                  <div className={styles.warnings}>
                    <strong>Warnings:</strong>
                    <ul>
                      {exportResult.errors.map((err, i) => (
                        <li key={i}>{err}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </>
          ) : (
            <>
              <AlertCircle size={24} />
              <div>
                <strong>Export Failed</strong>
                <p>{exportResult.errors?.[0]}</p>
              </div>
            </>
          )}
        </div>
      )}

      {/* Options Panel */}
      <div className={styles.optionsPanel}>
        <div className={styles.optionGroup}>
          <label>Destination Folder</label>
          <div className={styles.folderPicker}>
            <button onClick={selectFolder} className={styles.folderBtn}>
              <Folder size={16} />
              {destination ? 'Change Folder' : 'Select Folder'}
            </button>
            {destination && (
              <span className={styles.folderPath}>{destination}</span>
            )}
          </div>
        </div>

        <div className={styles.optionGroup}>
          <label>Format</label>
          <div className={styles.formatToggle}>
            <button
              className={`${styles.formatBtn} ${format === 'png' ? styles.active : ''}`}
              onClick={() => setFormat('png')}
            >
              PNG
            </button>
            <button
              className={`${styles.formatBtn} ${format === 'tiff' ? styles.active : ''}`}
              onClick={() => setFormat('tiff')}
            >
              TIFF
            </button>
          </div>
        </div>

        <div className={styles.optionGroup}>
          <label className={styles.checkboxLabel}>
            <input
              type="checkbox"
              checked={includeSidecar}
              onChange={(e) => setIncludeSidecar(e.target.checked)}
            />
            Include metadata JSON files
          </label>
          <span className={styles.optionHint}>
            Creates a .json file with title, description, tags, etc.
          </span>
        </div>
      </div>

      {/* Selection */}
      <div className={styles.selectionHeader}>
        <button onClick={selectAll} className={styles.selectAllBtn}>
          {selectedIds.size === ideasWithImages.length ? (
            <CheckSquare size={16} />
          ) : (
            <Square size={16} />
          )}
          {selectedIds.size === ideasWithImages.length ? 'Deselect All' : 'Select All'}
        </button>
        <span className={styles.selectionCount}>
          {selectedIds.size} of {ideasWithImages.length} selected
        </span>
      </div>

      {/* Ideas Grid */}
      {isLoading ? (
        <div className={styles.loading}>Loading exportable items...</div>
      ) : ideasWithImages.length === 0 ? (
        <div className={styles.empty}>
          <p>No approved or generated images to export.</p>
          <p>Generate some images first, then come back here!</p>
        </div>
      ) : (
        <div className={styles.grid}>
          {ideasWithImages.map((idea: Idea) => (
            <div
              key={idea.id}
              className={`${styles.card} ${selectedIds.has(idea.id) ? styles.selected : ''}`}
              onClick={() => toggleSelection(idea.id)}
            >
              <div className={styles.checkbox}>
                {selectedIds.has(idea.id) ? (
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
                />
              )}
              <div className={styles.cardTitle}>{idea.title}</div>
              <div className={styles.cardMeta}>
                <span className={styles.statusBadge}>{idea.status}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Export Button */}
      <div className={styles.footer}>
        <button
          onClick={() => exportMutation.mutate()}
          disabled={!canExport}
          className={styles.exportBtn}
        >
          {exportMutation.isPending ? (
            <>
              <Loader2 size={18} className={styles.spin} />
              Exporting...
            </>
          ) : (
            <>
              <Download size={18} />
              Export {selectedIds.size} Images
            </>
          )}
        </button>
      </div>
    </div>
  );
}
