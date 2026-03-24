import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { driver } from 'driver.js';
import 'driver.js/dist/driver.css';
import { useAgencyContext } from '../contexts/AgencyContext';
import { doc, updateDoc, getDoc } from 'firebase/firestore';
import { db } from '../config/firebase';

export const useDashboardTour = () => {
  const { agency, agencyId, loading: agencyLoading } = useAgencyContext();
  const location = useLocation();
  const driverInstanceRef = useRef<ReturnType<typeof driver> | null>(null);
  const hasStartedRef = useRef(false);

  useEffect(() => {
    // Don't run tour if:
    // 1. Agency is still loading
    // 2. No agency ID
    // 3. Tour already started in this session
    if (agencyLoading || !agencyId || !agency || hasStartedRef.current) {
      return;
    }

    // Check if tour has been seen
    const checkAndStartTour = async () => {
      try {
        const agencyRef = doc(db, 'agencies', agencyId);
        const agencyDoc = await getDoc(agencyRef);

        if (!agencyDoc.exists()) {
          return;
        }

        const agencyData = agencyDoc.data();
        const hasSeenTour = agencyData?.hasSeenTour === true;

        if (hasSeenTour) {
          return; // Tour already completed
        }

        // Wait a bit for the page to fully render
        const timer = setTimeout(() => {
          startTour(agencyId);
          hasStartedRef.current = true;
        }, 1500);

        return () => clearTimeout(timer);
      } catch (error) {
        console.error('[useDashboardTour] Error checking tour status:', error);
      }
    };

    checkAndStartTour();
  }, [agencyId, agency, agencyLoading, location.pathname]);

  const startTour = (agencyIdToUpdate: string) => {
    // Clean up any existing driver instance
    if (driverInstanceRef.current) {
      driverInstanceRef.current.destroy();
    }

    // Build steps array - only include steps for elements that exist
    const steps: Array<{
      element: string;
      popover: {
        title: string;
        description: string;
        side: 'top' | 'bottom' | 'left' | 'right';
        align: 'start' | 'center' | 'end';
      };
    }> = [];

    // Step 1: Calendar view (only if on site details page with calendar tab)
    const calendarView = document.querySelector('[data-tour="calendar-view"]');
    if (calendarView) {
      steps.push({
        element: '[data-tour="calendar-view"]',
        popover: {
          title: 'Your Content Engine',
          description: "This is your Content Engine. We've already scheduled your first 12 topics.",
          side: 'bottom',
          align: 'start',
        },
      });

      // Step 2: First post (only if calendar view exists)
      const firstPost = document.querySelector('[data-tour="first-post"]');
      if (firstPost) {
        steps.push({
          element: '[data-tour="first-post"]',
          popover: {
            title: 'Your Next Post',
            description: "Here is your next post. Click 'Generate' to write it, or let the auto-pilot do it.",
            side: 'bottom',
            align: 'start',
          },
        });
      }
    }

    // Step 3: Settings nav (always available)
    steps.push({
      element: '[data-tour="settings-nav"]',
      popover: {
        title: 'Settings',
        description: 'Change your keywords, schedule, or posting frequency here.',
        side: 'right',
        align: 'start',
      },
    });

    // Step 4: Help FAB (always available)
    steps.push({
      element: '[data-tour="help-fab"]',
      popover: {
        title: 'Need Help?',
        description: 'Stuck? Chat with our support team here.',
        side: 'left',
        align: 'start',
      },
    });

    // Don't start tour if no valid steps
    if (steps.length === 0) {
      return;
    }

    const driverInstance = driver({
      showProgress: true,
      steps,
      onDestroyStarted: () => {
        // User clicked "Skip" or closed the tour
        markTourAsSeen(agencyIdToUpdate);
      },
      onDestroyed: () => {
        // Tour was destroyed
        driverInstanceRef.current = null;
      },
      onNextClick: (_element, _step, opts) => {
        // If this is the last step, mark as seen
        if (opts.state.activeIndex === steps.length - 1) {
          markTourAsSeen(agencyIdToUpdate);
        }
      },
    });

    driverInstanceRef.current = driverInstance;

    // Start the tour
    driverInstance.drive();
  };

  const markTourAsSeen = async (agencyIdToUpdate: string) => {
    try {
      const agencyRef = doc(db, 'agencies', agencyIdToUpdate);
      await updateDoc(agencyRef, {
        hasSeenTour: true,
      });
      console.log('[useDashboardTour] Tour marked as seen');
    } catch (error) {
      console.error('[useDashboardTour] Error marking tour as seen:', error);
    }
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (driverInstanceRef.current) {
        driverInstanceRef.current.destroy();
        driverInstanceRef.current = null;
      }
    };
  }, []);
};
