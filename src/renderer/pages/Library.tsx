import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  Search,
  Plus,
  RefreshCw,
  AlertCircle,
  Grid,
  Trash2,
  CheckSquare,
  Square,
  X,
  LayoutGrid,
  List,
  ChevronDown,
} from 'lucide-react';
import type { Idea, IdeaStatus } from '../../shared/schemas';
import { IdeaDetail } from '../components/IdeaDetail';
import styles from './Library.module.css';

const STATUS_OPTIONS: IdeaStatus[] = [
  'Imported',
  'Queued',
  'Generated',
  'NeedsAttention',
  'Approved',
  'Exported',
];

export function Library() {
  const queryClient = useQueryClient();
  const [filters, setFilters] = useState<{
    status: IdeaStatus[];
    search: string;
  }>({
    status: [],
    search: '',
  });
  const [selectedIdea, setSelectedIdea] = useState<Idea | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isSelecting, setIsSelecting] = useState(false);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [showStatusMenu, setShowStatusMenu] = useState(false);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['ideas', filters],
    queryFn: async () => {
      const result = await window.huepress.ideas.list({
        status: filters.status.length > 0 ? filters.status : undefined,
        search: filters.search || undefined,
        limit: 100,
        offset: 0,
      });
      if (!result.success) {
        throw new Error(result.error);
      }
      return result.data;
    },
  });

  const updateStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: IdeaStatus }) => {
      const result = await window.huepress.ideas.updateFields(id, { status });
      if (!result.success) {
        throw new Error(result.error);
      }
      return result.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ideas'] });
      queryClient.invalidateQueries({ queryKey: ['project-info'] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const result = await window.huepress.ideas.delete(id);
      if (!result.success) {
        throw new Error(result.error);
      }
      return result.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ideas'] });
      queryClient.invalidateQueries({ queryKey: ['project-info'] });
      setSelectedIdea(null);
    },
  });

  const batchDeleteMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      for (const id of ids) {
        const result = await window.huepress.ideas.delete(id);
        if (!result.success) {
          throw new Error(result.error);
        }
      }
      return { deleted: ids.length };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ideas'] });
      queryClient.invalidateQueries({ queryKey: ['project-info'] });
      setSelectedIds(new Set());
      setIsSelecting(false);
    },
  });

  const batchStatusMutation = useMutation({
    mutationFn: async ({ ids, status }: { ids: string[]; status: IdeaStatus }) => {
      for (const id of ids) {
        const result = await window.huepress.ideas.updateFields(id, { status });
        if (!result.success) {
          throw new Error(result.error);
        }
      }
      return { updated: ids.length };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ideas'] });
      queryClient.invalidateQueries({ queryKey: ['project-info'] });
      setSelectedIds(new Set());
      setIsSelecting(false);
      setShowStatusMenu(false);
    },
  });

  const toggleStatusFilter = (status: IdeaStatus) => {
    setFilters((prev) => ({
      ...prev,
      status: prev.status.includes(status)
        ? prev.status.filter((s) => s !== status)
        : [...prev.status, status],
    }));
  };

  const handleStatusChange = (newStatus: IdeaStatus) => {
    if (selectedIdea) {
      updateStatusMutation.mutate({ id: selectedIdea.id, status: newStatus });
      setSelectedIdea({ ...selectedIdea, status: newStatus });
    }
  };

  const handleDelete = (id: string) => {
    if (confirm('Delete this idea? This cannot be undone.')) {
      deleteMutation.mutate(id);
    }
  };

  const handleBatchDelete = () => {
    if (selectedIds.size === 0) return;
    if (confirm(`Delete ${selectedIds.size} selected ideas? This cannot be undone.`)) {
      batchDeleteMutation.mutate(Array.from(selectedIds));
    }
  };

  const handleBatchStatusChange = (status: IdeaStatus) => {
    if (selectedIds.size === 0) return;
    batchStatusMutation.mutate({ ids: Array.from(selectedIds), status });
  };

  const toggleSelection = (id: string) => {
    const newSet = new Set(selectedIds);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    setSelectedIds(newSet);
  };

  const selectAll = () => {
    if (ideas.length === selectedIds.size) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(ideas.map((i: Idea) => i.id)));
    }
  };

  const cancelSelection = () => {
    setSelectedIds(new Set());
    setIsSelecting(false);
    setShowStatusMenu(false);
  };

  const ideas = data?.ideas || [];
  const total = data?.total || 0;

  return (
    <div className={styles.library}>
      {/* Header */}
      <header className={styles.header}>
        <div>
          <h1 className={styles.title}>Library</h1>
          <p className={styles.subtitle}>{total} ideas in collection</p>
        </div>
        <div className={styles.headerActions}>
          {!isSelecting ? (
            <>
              <div className={styles.viewToggle}>
                <button
                  onClick={() => setViewMode('grid')}
                  className={`${styles.viewBtn} ${viewMode === 'grid' ? styles.viewBtnActive : ''}`}
                  title="Grid view"
                >
                  <LayoutGrid size={16} />
                </button>
                <button
                  onClick={() => setViewMode('list')}
                  className={`${styles.viewBtn} ${viewMode === 'list' ? styles.viewBtnActive : ''}`}
                  title="List view"
                >
                  <List size={16} />
                </button>
              </div>
              <button
                onClick={() => setIsSelecting(true)}
                className={styles.btnSecondary}
                disabled={ideas.length === 0}
              >
                <CheckSquare size={14} />
                Select
              </button>
              <Link to="/import" className={styles.btnPrimary}>
                <Plus size={14} />
                Import
              </Link>
            </>
          ) : (
            <>
              <span className={styles.selectionCount}>
                {selectedIds.size} selected
              </span>
              <button onClick={selectAll} className={styles.btnSecondary}>
                {selectedIds.size === ideas.length ? 'Deselect All' : 'Select All'}
              </button>
              
              {/* Status dropdown */}
              <div className={styles.dropdown}>
                <button
                  onClick={() => setShowStatusMenu(!showStatusMenu)}
                  className={styles.btnSecondary}
                  disabled={selectedIds.size === 0 || batchStatusMutation.isPending}
                >
                  Set Status
                  <ChevronDown size={14} />
                </button>
                {showStatusMenu && (
                  <div className={styles.dropdownMenu}>
                    {STATUS_OPTIONS.map((status) => (
                      <button
                        key={status}
                        onClick={() => handleBatchStatusChange(status)}
                        className={styles.dropdownItem}
                      >
                        {status}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <button
                onClick={handleBatchDelete}
                className={styles.btnDanger}
                disabled={selectedIds.size === 0 || batchDeleteMutation.isPending}
              >
                <Trash2 size={14} />
                {batchDeleteMutation.isPending ? 'Deleting...' : 'Delete'}
              </button>
              <button onClick={cancelSelection} className={styles.btnGhost}>
                <X size={14} />
              </button>
            </>
          )}
        </div>
      </header>

      {/* Toolbar */}
      <div className={styles.toolbar}>
        <div className={styles.searchWrapper}>
          <Search size={14} className={styles.searchIcon} />
          <input
            type="text"
            placeholder="Search ideas..."
            value={filters.search}
            onChange={(e) =>
              setFilters((prev) => ({ ...prev, search: e.target.value }))
            }
            className={styles.searchInput}
          />
        </div>
        <div className={styles.toolbarDivider} />
        <div className={styles.statusFilters}>
          {STATUS_OPTIONS.map((status) => (
            <button
              key={status}
              onClick={() => toggleStatusFilter(status)}
              className={`${styles.filterChip} ${
                filters.status.includes(status) ? styles.filterChipActive : ''
              }`}
            >
              {status}
            </button>
          ))}
        </div>
        {filters.status.length > 0 && (
          <button
            onClick={() => setFilters((prev) => ({ ...prev, status: [] }))}
            className={styles.clearBtn}
          >
            Clear
          </button>
        )}
      </div>

      {/* Content */}
      <div className={styles.content}>
        {isLoading && (
          <div className={styles.loading}>
            <RefreshCw size={20} className={styles.spinner} />
            <span>Loading ideas...</span>
          </div>
        )}

        {isError && (
          <div className={styles.error}>
            <AlertCircle size={20} />
            <p>Failed to load ideas: {(error as Error)?.message || 'Unknown error'}</p>
            <button
              onClick={() => queryClient.invalidateQueries({ queryKey: ['ideas'] })}
              className={styles.retryBtn}
            >
              Retry
            </button>
          </div>
        )}

        {!isLoading && !isError && ideas.length === 0 && (
          <div className={styles.empty}>
            <Grid size={32} className={styles.emptyIcon} />
            <h3>No ideas found</h3>
            <p>Import your first JSON array to get started</p>
            <Link to="/import" className={styles.emptyBtn}>
              Import Ideas
            </Link>
          </div>
        )}

        {!isLoading && !isError && ideas.length > 0 && (
          <div className={viewMode === 'grid' ? styles.grid : styles.listView}>
            {ideas.map((idea: Idea) => (
              <IdeaCard
                key={idea.id}
                idea={idea}
                isSelecting={isSelecting}
                isSelected={selectedIds.has(idea.id)}
                onToggleSelect={() => toggleSelection(idea.id)}
                onClick={() => !isSelecting && setSelectedIdea(idea)}
                viewMode={viewMode}
              />
            ))}
          </div>
        )}
      </div>

      {/* Detail Panel */}
      {selectedIdea && (
        <IdeaDetail
          idea={selectedIdea}
          onClose={() => setSelectedIdea(null)}
          onStatusChange={handleStatusChange}
          onDelete={() => handleDelete(selectedIdea.id)}
        />
      )}
    </div>
  );
}

interface IdeaCardProps {
  idea: Idea;
  isSelecting: boolean;
  isSelected: boolean;
  onToggleSelect: () => void;
  onClick: () => void;
  viewMode: 'grid' | 'list';
}

function IdeaCard({ idea, isSelecting, isSelected, onToggleSelect, onClick, viewMode }: IdeaCardProps) {
  const handleClick = () => {
    if (isSelecting) {
      onToggleSelect();
    } else {
      onClick();
    }
  };

  if (viewMode === 'list') {
    return (
      <div
        className={`${styles.listItem} ${isSelected ? styles.listItemSelected : ''}`}
        onClick={handleClick}
      >
        {isSelecting && (
          <div className={styles.listCheckbox}>
            {isSelected ? (
              <CheckSquare size={16} className={styles.checkboxChecked} />
            ) : (
              <Square size={16} />
            )}
          </div>
        )}
        <span className={`${styles.listStatus} ${styles[`status${idea.status}`]}`}>
          {idea.status}
        </span>
        <span className={styles.listTitle}>{idea.title}</span>
        <span className={styles.listCategory}>{idea.category}</span>
        <span className={styles.listSkill}>{idea.skill}</span>
      </div>
    );
  }

  return (
    <div
      className={`${styles.card} ${isSelected ? styles.cardSelected : ''}`}
      onClick={handleClick}
    >
      {isSelecting && (
        <div className={styles.checkbox}>
          {isSelected ? (
            <CheckSquare size={18} className={styles.checkboxChecked} />
          ) : (
            <Square size={18} />
          )}
        </div>
      )}
      <div className={styles.cardHeader}>
        <span className={`${styles.statusBadge} ${styles[`status${idea.status}`]}`}>
          {idea.status}
        </span>
        <span className={styles.skillBadge}>{idea.skill}</span>
      </div>
      <h3 className={styles.cardTitle}>{idea.title}</h3>
      <p className={styles.cardDescription}>{idea.description}</p>
      <div className={styles.cardMeta}>
        <span className={styles.category}>{idea.category}</span>
      </div>
    </div>
  );
}
