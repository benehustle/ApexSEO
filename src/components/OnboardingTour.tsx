import React, { useState, useEffect } from 'react';
import Joyride, { CallBackProps, STATUS, Step } from 'react-joyride';
import { useAuth } from '../hooks/useAuth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../config/firebase';

const TOUR_STEPS: Step[] = [
  {
    target: 'body',
    content: 'Welcome to AI Blog Automation! Let\'s take a quick tour to get you started.',
    placement: 'center',
    disableBeacon: true,
  },
  {
    target: '[data-tour="add-site"]',
    content: 'Start by adding your first WordPress site here. You\'ll need your WordPress API credentials.',
    placement: 'bottom',
  },
  {
    target: '[data-tour="dashboard-stats"]',
    content: 'Track your key metrics here - total sites, blogs, and publishing activity.',
    placement: 'bottom',
  },
  {
    target: '[data-tour="site-card"]',
    content: 'Each site card shows generation progress, connection status, and quick actions.',
    placement: 'top',
  },
  {
    target: '[data-tour="generate-blogs"]',
    content: 'Generate 30 blogs at once with AI. They\'ll be scheduled based on your publishing frequency.',
    placement: 'left',
  },
  {
    target: '[data-tour="calendar-nav"]',
    content: 'View your content calendar to approve, edit, or schedule blog posts.',
    placement: 'bottom',
  },
  {
    target: '[data-tour="keywords-nav"]',
    content: 'Research keywords to find high-opportunity topics for your content.',
    placement: 'bottom',
  },
];

export const OnboardingTour: React.FC = () => {
  const [run, setRun] = useState(false);
  const { user } = useAuth();

  useEffect(() => {
    checkTourStatus();
  }, [user]);

  const checkTourStatus = async () => {
    if (!user) return;

    // Don't run tour on embedded signup page
    if (window.location.pathname.includes('/embed/signup')) {
      return;
    }

    try {
      const tourRef = doc(db, 'userSettings', user.uid);
      const tourDoc = await getDoc(tourRef);

      if (!tourDoc.exists() || !tourDoc.data()?.tourCompleted) {
        // Small delay to ensure DOM elements are loaded
        setTimeout(() => setRun(true), 1000);
      }
    } catch (error) {
      console.error('Failed to check tour status:', error);
    }
  };

  const handleJoyrideCallback = async (data: CallBackProps) => {
    const { status } = data;

    if ([STATUS.FINISHED, STATUS.SKIPPED].includes(status as any)) {
      setRun(false);
      
      if (user) {
        try {
          const tourRef = doc(db, 'userSettings', user.uid);
          await setDoc(tourRef, { tourCompleted: true }, { merge: true });
        } catch (error) {
          console.error('Failed to save tour status:', error);
        }
      }
    }
  };

  return (
    <Joyride
      steps={TOUR_STEPS}
      run={run}
      continuous
      showProgress
      showSkipButton
      callback={handleJoyrideCallback}
      styles={{
        options: {
          primaryColor: '#3b82f6',
          zIndex: 10000,
        },
      }}
      locale={{
        back: 'Back',
        close: 'Close',
        last: 'Finish',
        next: 'Next',
        skip: 'Skip Tour',
      }}
    />
  );
};
