import { useState, useCallback, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';

export type PublishStatus = 'idle' | 'pending' | 'success' | 'error';

export interface BatchStatus {
  [id: string]: {
    status: PublishStatus;
    error?: string;
  };
}

export function useBatchPublish() {
  const queryClient = useQueryClient();
  const [batchStatus, setBatchStatus] = useState<BatchStatus>({});
  const [isPublishing, setIsPublishing] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const isPublishingRef = useRef(false);

  const publish = useCallback(async (ids: string[]) => {
    if (ids.length === 0) return;
    if (isPublishingRef.current) return; // Prevent double-submit

    isPublishingRef.current = true;
    setIsPublishing(true);
    abortControllerRef.current = new AbortController();

    // Reset status for these IDs to pending
    setBatchStatus(prev => {
      const next = { ...prev };
      ids.forEach(id => {
        next[id] = { status: 'pending' };
      });
      return next;
    });

    // Concurrency Limit: 3
    const CONCURRENCY = 3;
    const queue = [...ids];
    const activePromises: Promise<void>[] = [];

    const processNext = async (): Promise<void> => {
      if (queue.length === 0) return;
      if (abortControllerRef.current?.signal.aborted) return;

      const id = queue.shift();
      if (!id) return;

      try {
        // Perform Sync
        const result = await window.huepress.web.sync(id);

        if (result.success) {
          setBatchStatus(prev => ({
            ...prev,
            [id]: { status: 'success' }
          }));
          // Invalidate to update status in UI ("Draft" -> "Published")
          queryClient.invalidateQueries({ queryKey: ['ideas'] }); 
        } else {
          setBatchStatus(prev => ({
            ...prev,
            [id]: { status: 'error', error: result.error }
          }));
        }
      } catch (err: any) {
        setBatchStatus(prev => ({
          ...prev,
          [id]: { status: 'error', error: err.message || 'Unknown error' }
        }));
      }

      // Process next in queue
      return processNext();
    };

    // Start initial batch
    for (let i = 0; i < CONCURRENCY && i < ids.length; i++) {
      activePromises.push(processNext());
    }

    try {
      await Promise.all(activePromises);
    } finally {
      isPublishingRef.current = false;
      setIsPublishing(false);

      // Auto-dismiss after 4 seconds
      setTimeout(() => {
        if (abortControllerRef.current?.signal.aborted) return;
        setBatchStatus({});
      }, 4000);
    }
  }, [queryClient]); // Added queryClient dependency

  const cancel = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      setIsPublishing(false);
    }
  }, []);

  const reset = useCallback(() => {
    setBatchStatus({});
  }, []);

  return {
    publish,
    cancel,
    reset,
    batchStatus,
    isPublishing
  };
}
