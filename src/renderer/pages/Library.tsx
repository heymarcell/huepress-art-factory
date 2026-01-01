import { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';
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
  ArrowUp,
  ArrowDown,
  Filter,
  Copy,
  Ban,
  Check,
} from 'lucide-react';
import type { Idea, IdeaStatus } from '../../shared/schemas';
import { IdeaDetail } from '../components/IdeaDetail';
import styles from './Library.module.css';

const STATUS_OPTIONS: IdeaStatus[] = [
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

const SKILL_OPTIONS = ['Easy', 'Medium', 'Detailed'];

type SortField = 'title' | 'category' | 'skill' | 'created_at' | 'status';
type SortOrder = 'asc' | 'desc';

export function Library() {
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  
  // Initialize filters from URL params
  const initialStatus = searchParams.get('status');
  const [filters, setFilters] = useState<{
    status: IdeaStatus[];
    category: string | null;
    skill: string | null;
    search: string;
  }>({
    status: initialStatus && STATUS_OPTIONS.includes(initialStatus as IdeaStatus) 
      ? [initialStatus as IdeaStatus] 
      : [],
    category: null,
    skill: null,
    search: '',
  });
  const [sortField, setSortField] = useState<SortField>('created_at');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');
  const [selectedIdea, setSelectedIdea] = useState<Idea | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isSelecting, setIsSelecting] = useState(false);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [showStatusMenu, setShowStatusMenu] = useState(false);
  const [showSortMenu, setShowSortMenu] = useState(false);
  const [showFilterMenu, setShowFilterMenu] = useState(false);
  
  // Duplicate checking
  const [checkingDuplicates, setCheckingDuplicates] = useState(false);
  const [duplicates, setDuplicates] = useState<{ id: string; title: string; status: string; created_at: string; image_path?: string }[][]>([]);
  const [showDuplicatesModal, setShowDuplicatesModal] = useState(false);
  const [lightboxImage, setLightboxImage] = useState<string | null>(null);
  
  const sortMenuRef = useRef<HTMLDivElement>(null);
  const filterMenuRef = useRef<HTMLDivElement>(null);

  // Close menus when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (sortMenuRef.current && !sortMenuRef.current.contains(e.target as Node)) {
        setShowSortMenu(false);
      }
      if (filterMenuRef.current && !filterMenuRef.current.contains(e.target as Node)) {
        setShowFilterMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Listen for background job progress to auto-refresh list
  useEffect(() => {
    if (!window.huepress?.jobs?.onProgress) return;

    const unsubscribe = window.huepress.jobs.onProgress((progressData) => {
      // Invalidate queries when we see progress updates
      // This ensures the list reflects state changes (Queued -> Generating -> Generated/Failed)
      queryClient.invalidateQueries({ queryKey: ['ideas'] });
      // Also invalidate the specific idea query if it matches the current selection
      if (progressData?.ideaId) {
        queryClient.invalidateQueries({ queryKey: ['idea', progressData.ideaId] });
      }
    });

    return () => {
      unsubscribe();
    };
  }, [queryClient]);

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
    // Keep polling as backup for active states
    refetchInterval: (query) => {
      const state = query.state.data as { ideas: Idea[] } | undefined;
      // If any visible ideas are in transient states, poll frequently
      if (state?.ideas?.some((i: Idea) => i.status === 'Queued' || i.status === 'Generating')) {
        return 1000;
      }
      return false;
    },
  });

  // Dedicated query for the selected idea - fetches fresh data regardless of filters
  // This prevents stale data when the idea's status changes and it's filtered out of the main list
  const { data: selectedIdeaFresh } = useQuery({
    queryKey: ['idea', selectedIdea?.id],
    queryFn: async () => {
      if (!selectedIdea?.id) return null;
      const result = await window.huepress.ideas.getById(selectedIdea.id);
      if (!result.success) return null;
      return result.data;
    },
    enabled: !!selectedIdea?.id,
    staleTime: 0, // Always consider data stale to ensure fresh fetch
    refetchOnMount: 'always', // Always refetch when query becomes enabled
    refetchInterval: (query) => {
      const idea = query.state.data as Idea | null;
      // Poll while generating or queued
      if (idea?.status === 'Generating' || idea?.status === 'Queued') {
        return 1000;
      }
      return false;
    },
  });

  // Get unique categories from data
  const categories: string[] = [...new Set((data?.ideas || []).map((i: Idea) => i.category))].sort() as string[];

  // Client-side filtering and sorting
  const filteredAndSortedIdeas = (() => {
    let ideas = data?.ideas || [];
    
    // Apply category filter
    if (filters.category) {
      ideas = ideas.filter((i: Idea) => i.category === filters.category);
    }
    
    // Apply skill filter
    if (filters.skill) {
      ideas = ideas.filter((i: Idea) => i.skill === filters.skill);
    }
    
    // Sort
    ideas = [...ideas].sort((a: Idea, b: Idea) => {
      let aVal = a[sortField];
      let bVal = b[sortField];
      
      // Handle null values
      if (aVal === null) aVal = '';
      if (bVal === null) bVal = '';
      
      // String comparison
      if (typeof aVal === 'string' && typeof bVal === 'string') {
        const cmp = aVal.localeCompare(bVal);
        return sortOrder === 'asc' ? cmp : -cmp;
      }
      
      return 0;
    });
    
    return ideas;
  })();

  const updateStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: IdeaStatus }) => {
      const result = await window.huepress.ideas.updateFields(id, { status });
      if (!result.success) {
        throw new Error(result.error);
      }
      return result.data;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['ideas'] });
      queryClient.invalidateQueries({ queryKey: ['idea', variables.id] });
      queryClient.invalidateQueries({ queryKey: ['project-info'] });
    },
  });

  const updateFieldsMutation = useMutation({
    mutationFn: async ({ id, fields }: { id: string; fields: any }) => {
      const result = await window.huepress.ideas.updateFields(id, fields);
      if (!result.success) throw new Error(result.error);
      return result.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ideas'] });
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

  const checkForDuplicates = async () => {
    setCheckingDuplicates(true);
    try {
      const result = await window.huepress.ideas.findDuplicates();
      if (result.success && result.data.length > 0) {
        setDuplicates(result.data);
        setShowDuplicatesModal(true);
      } else {
        alert('No duplicates found!');
      }
    } catch (error) {
      console.error('Error checking duplicates:', error);
      alert('Failed to check duplicates');
    } finally {
      setCheckingDuplicates(false);
    }
  };

  const generateMutation = useMutation({
    mutationFn: async (id: string) => {
      const result = await window.huepress.jobs.enqueue([id]);
      if (!result.success) {
        throw new Error(result.error);
      }
      return result.data;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['ideas'] });
      queryClient.invalidateQueries({ queryKey: ['idea', variables] });
      queryClient.invalidateQueries({ queryKey: ['project-info'] });
    },
  });

  const batchGenerateMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      const result = await window.huepress.jobs.enqueue(ids);
      if (!result.success) {
        throw new Error(result.error);
      }
      return result.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ideas'] });
      queryClient.invalidateQueries({ queryKey: ['project-info'] });
      setSelectedIds(new Set());
      setIsSelecting(false);
    },
  });

  const setVersionMutation = useMutation({
    mutationFn: async ({ ideaId, attemptId }: { ideaId: string; attemptId: string }) => {
      const result = await window.huepress.ideas.setVersion(ideaId, attemptId);
      if (!result.success) {
        throw new Error(result.error);
      }
      return result.data;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['ideas'] });
      queryClient.invalidateQueries({ queryKey: ['idea', variables.ideaId] });
    },
  });

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('asc');
    }
    setShowSortMenu(false);
  };

  const handleStatusChange = (newStatus: IdeaStatus) => {
    if (selectedIdea) {
      updateStatusMutation.mutate({ id: selectedIdea.id, status: newStatus });
      
      // Optimistically update selectedIdea with the new status
      // Use selectedIdeaFresh (from dedicated query) which has correct data regardless of filters
      const freshIdea = selectedIdeaFresh || data?.ideas?.find((i: Idea) => i.id === selectedIdea.id);
      if (freshIdea) {
        setSelectedIdea({ ...freshIdea, status: newStatus, updated_at: new Date().toISOString() });
      } else {
        // Last fallback: just update status on selectedIdea
        setSelectedIdea({ ...selectedIdea, status: newStatus, updated_at: new Date().toISOString() });
      }
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

  const handleGenerate = (id: string) => {
    generateMutation.mutate(id);
    if (selectedIdea && selectedIdea.id === id) {
      setSelectedIdea({ ...selectedIdea, status: 'Queued', updated_at: new Date().toISOString() });
    }
  };

  const handleBatchGenerate = () => {
    if (selectedIds.size === 0) return;
    batchGenerateMutation.mutate(Array.from(selectedIds));
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
    if (filteredAndSortedIdeas.length === selectedIds.size) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredAndSortedIdeas.map((i: Idea) => i.id)));
    }
  };

  const cancelSelection = () => {
    setSelectedIds(new Set());
    setIsSelecting(false);
    setShowStatusMenu(false);
  };

  const clearFilters = () => {
    setFilters({ status: [], category: null, skill: null, search: '' });
    setShowFilterMenu(false);
  };

  const hasActiveFilters = filters.status.length > 0 || filters.category || filters.skill;
  const total = data?.total || 0;

  /* New state for stable navigation */
  const [navigationSnapshot, setNavigationSnapshot] = useState<Idea[] | null>(null);

  /* ... (existing state) ... */

  /* Helper to open detail and freeze list order */
  const openDetail = (idea: Idea) => {
    setNavigationSnapshot(filteredAndSortedIdeas);
    setSelectedIdea(idea);
  };

  /* Helper to close detail */
  const closeDetail = () => {
    setSelectedIdea(null);
    setNavigationSnapshot(null);
  };

  /* ... (existing effects) ... */

  // Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if typing in an input (except if modifier keys are used, but we keep it simple)
      const tagName = (e.target as HTMLElement).tagName;
      if (tagName === 'INPUT' || tagName === 'TEXTAREA') {
        return;
      }

      const activeList = navigationSnapshot || filteredAndSortedIdeas;

      if (selectedIdea) {
        if (e.key === 'g' || e.key === 'G') {
           if (selectedIdea.status !== 'Approved') {
              handleGenerate(selectedIdea.id);
           }
        }
        if (e.key === 'a' || e.key === 'A') {
           handleStatusChange('Approved');
        }
        if (e.key === 'ArrowDown') {
           e.preventDefault();
           const currentIndex = activeList.findIndex(i => i.id === selectedIdea.id);
           if (currentIndex !== -1 && currentIndex < activeList.length - 1) {
              setSelectedIdea(activeList[currentIndex + 1]);
           }
        }
        if (e.key === 'ArrowUp') {
           e.preventDefault();
           const currentIndex = activeList.findIndex(i => i.id === selectedIdea.id);
           if (currentIndex > 0) {
              setSelectedIdea(activeList[currentIndex - 1]);
           }
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedIdea, filteredAndSortedIdeas, navigationSnapshot, handleGenerate, handleStatusChange]);

  return (
    <div className={styles.library}>
      {/* Header */}
      <header className={styles.header}>
        <div>
          <h1 className={styles.title}>Library</h1>
          <p className={styles.subtitle}>
            {filteredAndSortedIdeas.length === total 
              ? `${total} ideas` 
              : `${filteredAndSortedIdeas.length} of ${total} ideas`}
          </p>
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
                disabled={filteredAndSortedIdeas.length === 0}
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
                {selectedIds.size === filteredAndSortedIdeas.length ? 'Deselect All' : 'Select All'}
              </button>

              <button
                onClick={handleBatchGenerate}
                className={styles.btnPrimary}
                disabled={selectedIds.size === 0 || batchGenerateMutation.isPending}
                style={{ marginRight: '8px' }}
              >
                <RefreshCw size={14} className={batchGenerateMutation.isPending ? styles.spinner : ''} />
                {batchGenerateMutation.isPending ? 'Queuing...' : 'Generate'}
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
        
        {/* Sort dropdown */}
        <div className={styles.dropdown} ref={sortMenuRef}>
          <button
            onClick={() => setShowSortMenu(!showSortMenu)}
            className={styles.toolbarBtn}
          >
            {sortOrder === 'asc' ? <ArrowUp size={14} /> : <ArrowDown size={14} />}
            {sortField === 'title' && 'Name'}
            {sortField === 'category' && 'Category'}
            {sortField === 'skill' && 'Skill'}
            {sortField === 'created_at' && 'Date'}
            {sortField === 'status' && 'Status'}
            <ChevronDown size={12} />
          </button>
          {showSortMenu && (
            <div className={styles.dropdownMenu}>
              <div className={styles.dropdownHeader}>Sort by</div>
              {[
                { field: 'title' as SortField, label: 'Name' },
                { field: 'category' as SortField, label: 'Category' },
                { field: 'skill' as SortField, label: 'Skill' },
                { field: 'created_at' as SortField, label: 'Date Added' },
                { field: 'status' as SortField, label: 'Status' },
              ].map(({ field, label }) => (
                <button
                  key={field}
                  onClick={() => handleSort(field)}
                  className={`${styles.dropdownItem} ${sortField === field ? styles.dropdownItemActive : ''}`}
                >
                  {label}
                  {sortField === field && (
                    sortOrder === 'asc' ? <ArrowUp size={12} /> : <ArrowDown size={12} />
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Duplicates Button */}
        <button
          className={styles.toolbarBtn}
          onClick={checkForDuplicates}
          disabled={checkingDuplicates}
          title="Find semantic duplicates (vector search)"
          style={{ width: 'auto', paddingRight: '8px' }}
        >
          {checkingDuplicates ? <RefreshCw size={14} className={styles.spin} /> : <Copy size={14} />}
          {checkingDuplicates ? 'Checking...' : 'Duplicates'}
        </button>

        {/* Filter dropdown */}
        <div className={styles.dropdown} ref={filterMenuRef}>
          <button
            onClick={() => setShowFilterMenu(!showFilterMenu)}
            className={`${styles.toolbarBtn} ${hasActiveFilters ? styles.toolbarBtnActive : ''}`}
          >
            <Filter size={14} />
            Filters
            {hasActiveFilters && <span className={styles.filterBadge}>{
              (filters.status.length > 0 ? 1 : 0) + (filters.category ? 1 : 0) + (filters.skill ? 1 : 0)
            }</span>}
            <ChevronDown size={12} />
          </button>
          {showFilterMenu && (
            <div className={`${styles.dropdownMenu} ${styles.filterMenu}`}>
              <div className={styles.filterSection}>
                <div className={styles.dropdownHeader}>Status</div>
                <div className={styles.filterChips}>
                  {STATUS_OPTIONS.map((status) => (
                    <button
                      key={status}
                      onClick={() => setFilters(prev => ({
                        ...prev,
                        status: prev.status.includes(status)
                          ? prev.status.filter(s => s !== status)
                          : [...prev.status, status]
                      }))}
                      className={`${styles.filterChip} ${filters.status.includes(status) ? styles.filterChipActive : ''}`}
                    >
                      {status}
                    </button>
                  ))}
                </div>
              </div>
              
              <div className={styles.filterSection}>
                <div className={styles.dropdownHeader}>Category</div>
                <select
                  value={filters.category || ''}
                  onChange={(e) => setFilters(prev => ({ ...prev, category: e.target.value || null }))}
                  className={styles.filterSelect}
                >
                  <option value="">All categories</option>
                  {categories.map((cat) => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
              </div>
              
              <div className={styles.filterSection}>
                <div className={styles.dropdownHeader}>Skill Level</div>
                <select
                  value={filters.skill || ''}
                  onChange={(e) => setFilters(prev => ({ ...prev, skill: e.target.value || null }))}
                  className={styles.filterSelect}
                >
                  <option value="">All skills</option>
                  {SKILL_OPTIONS.map((skill) => (
                    <option key={skill} value={skill}>{skill}</option>
                  ))}
                </select>
              </div>
              
              {hasActiveFilters && (
                <button onClick={clearFilters} className={styles.clearFiltersBtn}>
                  Clear all filters
                </button>
              )}
            </div>
          )}
        </div>

        {hasActiveFilters && (
          <button onClick={clearFilters} className={styles.clearBtn}>
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

        {!isLoading && !isError && filteredAndSortedIdeas.length === 0 && (
          <div className={styles.empty}>
            <Grid size={32} className={styles.emptyIcon} />
            {hasActiveFilters ? (
              <>
                <h3>No matching ideas</h3>
                <p>Try adjusting your filters</p>
                <button onClick={clearFilters} className={styles.emptyBtn}>
                  Clear Filters
                </button>
              </>
            ) : (
              <>
                <h3>No ideas found</h3>
                <p>Import your first JSON array to get started</p>
                <Link to="/import" className={styles.emptyBtn}>
                  Import Ideas
                </Link>
              </>
            )}
          </div>
        )}

        {!isLoading && !isError && filteredAndSortedIdeas.length > 0 && (
          <div className={viewMode === 'grid' ? styles.grid : styles.listView}>
            {filteredAndSortedIdeas.map((idea: Idea) => (
              <IdeaCard
                key={idea.id}
                idea={idea}
                isSelecting={isSelecting}
                isSelected={selectedIds.has(idea.id)}
                onToggleSelect={() => toggleSelection(idea.id)}
                onClick={() => !isSelecting && openDetail(idea)}
                viewMode={viewMode}
              />
            ))}
          </div>
        )}
      </div>

      {/* Detail Panel */}
      {selectedIdea && (
        <IdeaDetail
          idea={selectedIdeaFresh || data?.ideas?.find((i: Idea) => i.id === selectedIdea.id) || selectedIdea}
          onClose={closeDetail}
          onStatusChange={handleStatusChange}
          onDelete={() => handleDelete(selectedIdea.id)}
          onGenerate={() => handleGenerate(selectedIdea.id)}
          onVersionChange={(attemptId) => setVersionMutation.mutate({ ideaId: selectedIdea.id, attemptId })}
        />
      )}
      {/* Duplicates Modal */}
      {showDuplicatesModal && (
        <div className={styles.modalOverlay}>
          <div className={styles.modalContent}>
            <div className={styles.modalHeader}>
              <h3>Potential Duplicates Found ({duplicates.length} groups)</h3>
              <button onClick={() => setShowDuplicatesModal(false)} className={styles.closeBtn}>
                <X size={20} />
              </button>
            </div>
            <div className={styles.modalBody}>
              <p className={styles.modalDesc}>
                These items have very similar semantic meaning. Review and merge/delete duplicates.
              </p>
              <div className={styles.duplicatesList}>
                {duplicates.map((group, i) => (
                  <div key={i} className={styles.duplicateGroup}>
                    <div className={styles.groupHeader}>Group {i + 1} ({group.length} items)</div>
                    {group.map((item) => (
                      <div key={item.id} className={styles.duplicateItem}>
                        {item.image_path ? (
                          <img 
                            src={`file://${item.image_path}`} 
                            className={styles.duplicateImage} 
                            alt="" 
                            onClick={() => setLightboxImage(`file://${item.image_path}`)}
                            style={{ cursor: 'zoom-in' }}
                          />
                        ) : (
                          <div className={styles.duplicateImage} />
                        )}
                        <div className={styles.duplicateInfo}>
                          <strong>{item.title}</strong>
                          <span>{item.status} • {new Date(item.created_at).toLocaleDateString()}</span>
                        </div>
                        <div className={styles.duplicateActions}>
                          <button
                            className={styles.ignoreBtn}
                            onClick={() => {
                               updateFieldsMutation.mutate({ id: item.id, fields: { ignore_duplicates: true } });
                               // Optimistically remove from list
                               setDuplicates(prev => prev.map(g => g.filter(i => i.id !== item.id)).filter(g => g.length > 1));
                            }}
                            title="Keep (Ignore duplicate warning)"
                          >
                            <Check size={16} />
                          </button>
                          <button
                            className={styles.omitBtn}
                            onClick={() => {
                               batchStatusMutation.mutate({ ids: [item.id], status: 'Omitted' });
                               // Optimistically remove from list
                               setDuplicates(prev => prev.map(g => g.filter(i => i.id !== item.id)).filter(g => g.length > 1));
                            }}
                            title="Omit this item (mark as Omitted)"
                          >
                            <Ban size={16} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Lightbox */}
      {lightboxImage && (
        <div className={styles.lightbox} onClick={() => setLightboxImage(null)}>
          <img src={lightboxImage} onClick={(e) => e.stopPropagation()} alt="Preview" />
          <button className={styles.closeLightbox} onClick={() => setLightboxImage(null)}>
            <X size={24} />
          </button>
        </div>
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
