import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  Search,
  Plus,
  RefreshCw,
  AlertCircle,
  Grid,
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
        <Link to="/import" className={styles.btnPrimary}>
          <Plus size={14} />
          Import
        </Link>
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
          <div className={styles.grid}>
            {ideas.map((idea) => (
              <IdeaCard
                key={idea.id}
                idea={idea}
                onClick={() => setSelectedIdea(idea)}
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
        />
      )}
    </div>
  );
}

function IdeaCard({ idea, onClick }: { idea: Idea; onClick: () => void }) {
  return (
    <div className={styles.card} onClick={onClick}>
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
