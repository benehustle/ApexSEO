import { useEffect, useRef } from 'react';
import { collection, query, where, orderBy, limit, getDocs, Timestamp } from 'firebase/firestore';
import { db } from '../config/firebase';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../config/firebase';
import { useToast } from '../components/Toast';

interface UseContentGapFillerProps {
  siteId: string | null;
  postingFrequency?: number;
  autoApprove?: boolean;
  enabled?: boolean;
}

export const useContentGapFiller = ({
  siteId,
  postingFrequency = 3,
  autoApprove = false,
  enabled = true,
}: UseContentGapFillerProps) => {
  const { showToast } = useToast();
  const hasCheckedRef = useRef<Set<string>>(new Set());
  const isCheckingRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!enabled || !siteId) return;

    // Prevent duplicate checks for the same site
    if (hasCheckedRef.current.has(siteId) || isCheckingRef.current.has(siteId)) {
      return;
    }

    const checkAndFillGaps = async () => {
      if (isCheckingRef.current.has(siteId)) return;
      isCheckingRef.current.add(siteId);

      try {
        // Step 1: Check the latest scheduled post
        const calendarRef = collection(db, 'sites', siteId, 'contentCalendar');
        const futurePostsQuery = query(
          calendarRef,
          where('scheduledDate', '>=', Timestamp.now()),
          orderBy('scheduledDate', 'asc'),
          limit(1)
        );

        const snapshot = await getDocs(futurePostsQuery);
        const now = new Date();
        const threeDaysFromNow = new Date(now);
        threeDaysFromNow.setDate(threeDaysFromNow.getDate() + 3);

        let needsContent = false;
        let lastPostDate: Date | null = null;

        if (snapshot.empty) {
          // No future posts at all
          needsContent = true;
          lastPostDate = now;
        } else {
          const latestPost = snapshot.docs[0];
          const postData = latestPost.data();
          const scheduledDate = postData.scheduledDate as Timestamp;
          lastPostDate = scheduledDate.toDate();

          // Calculate days until empty
          const daysUntilEmpty = Math.floor(
            (lastPostDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
          );

          if (daysUntilEmpty < 3) {
            needsContent = true;
          }
        }

        if (!needsContent) {
          hasCheckedRef.current.add(siteId);
          isCheckingRef.current.delete(siteId);
          return;
        }

        // Step 2: Check safeguard - lastAutoGenerateTime
        const { doc: docFn, getDoc: getDocFn } = await import('firebase/firestore');
        const siteRef = docFn(db, 'sites', siteId);
        const siteDoc = await getDocFn(siteRef);
        const siteData = siteDoc.data();

        if (siteData?.lastAutoGenerateTime) {
          const lastRun = (siteData.lastAutoGenerateTime as Timestamp).toDate();
          const minutesSinceLastRun = (now.getTime() - lastRun.getTime()) / (1000 * 60);

          if (minutesSinceLastRun < 60) {
            // Abort - ran too recently
            console.log(`[useContentGapFiller] Aborted: Last auto-generate was ${minutesSinceLastRun.toFixed(1)} minutes ago`);
            hasCheckedRef.current.add(siteId);
            isCheckingRef.current.delete(siteId);
            return;
          }
        }

        // Step 3: Call backend to auto-fill
        console.log(`[useContentGapFiller] Triggering auto-fill for site ${siteId}`);
        showToast('info', '⚠️ Auto-Pilot: Generating new content to fill gaps...');

        const autoFillCalendar = httpsCallable(functions, 'autoFillCalendarCallable');
        const result = await autoFillCalendar({ siteId });

        const data = result.data as { success: boolean; message?: string; error?: string };

        if (data.success) {
          showToast('success', data.message || '✅ Auto-generated content scheduled successfully');
        } else {
          showToast('error', data.error || 'Failed to auto-generate content');
        }

        hasCheckedRef.current.add(siteId);
      } catch (error: any) {
        console.error('[useContentGapFiller] Error:', error);
        // Don't show error toast - this is a background operation
      } finally {
        isCheckingRef.current.delete(siteId);
      }
    };

    // Small delay to ensure other data has loaded
    const timeoutId = setTimeout(() => {
      checkAndFillGaps();
    }, 2000);

    return () => {
      clearTimeout(timeoutId);
    };
  }, [siteId, postingFrequency, autoApprove, enabled, showToast]);
};
