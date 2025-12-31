import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import type { Idea, IdeaStatus } from '../../shared/schemas';
import { IdeaDetail } from '../components/IdeaDetail';
import styles from './Library.module.css';

const STATUS_COLORS: Record<IdeaStatus, string> = {
  Imported: 'info',
  Queued: 'warning',
  Generating: 'warning',
  Generated: 'success',
  NeedsAttention: 'error',
  Approved: 'accent',
  Exported: 'muted',
};

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
      <header className={styles.header}>
        <div>
          <h1 className={styles.title}>Library</h1>
          <p className={styles.subtitle}>
            {total} ideas in your collection
          </p>
        </div>
        <Link to="/import" className={styles.importButton}>
          + Import Ideas
        </Link>
      </header>

      {/* Filters */}
      <div className={styles.filters}>
        <div className={styles.searchWrapper}>
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
          {filters.status.length > 0 && (
            <button
              onClick={() => setFilters((prev) => ({ ...prev, status: [] }))}
              className={styles.clearFilters}
            >
              Clear filters
            </button>
          )}
        </div>
      </div>

      {/* Content */}
      {isLoading && (
        <div className={styles.loading}>
          <div className={styles.spinner} />
          <span>Loading ideas...</span>
        </div>
      )}

      {isError && (
        <div className={styles.error}>
          <p>Failed to load ideas: {(error as Error)?.message || 'Unknown error'}</p>
          <button
            onClick={() => queryClient.invalidateQueries({ queryKey: ['ideas'] })}
            className={styles.retryButton}
          >
            Retry
          </button>
        </div>
      )}

      {!isLoading && !isError && ideas.length === 0 && (
        <div className={styles.empty}>
          <div className={styles.emptyIcon}>📚</div>
          <h3>No ideas yet</h3>
          <p>Import your first JSON array to get started</p>
          <Link to="/import" className={styles.emptyButton}>
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
  const statusColor = STATUS_COLORS[idea.status];

  return (
    <div className={styles.card} onClick={onClick}>
      <div className={styles.cardHeader}>
        <span
          className={`${styles.statusBadge} ${styles[`status${statusColor}`]}`}
        >
          {idea.status}
        </span>
        <span className={styles.skillBadge}>{idea.skill}</span>
      </div>
      <h3 className={styles.cardTitle}>{idea.title}</h3>
      <p className={styles.cardDescription}>{idea.description}</p>
      <div className={styles.cardMeta}>
        <span className={styles.category}>{idea.category}</span>
        {idea.tags && idea.tags.length > 0 && (
          <div className={styles.tags}>
            {idea.tags.slice(0, 3).map((tag) => (
              <span key={tag} className={styles.tag}>
                {tag}
              </span>
            ))}
            {idea.tags.length > 3 && (
              <span className={styles.tagMore}>+{idea.tags.length - 3}</span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
