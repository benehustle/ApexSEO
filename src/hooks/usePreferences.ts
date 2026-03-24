import { useState, useEffect } from 'react';
import { preferencesService } from '../services/preferences.service';
import { UserPreferences } from '../types/preferences';
import { useAuth } from './useAuth';

export const usePreferences = () => {
  const [preferences, setPreferences] = useState<UserPreferences | null>(null);
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();

  useEffect(() => {
    loadPreferences();
  }, [user]);

  useEffect(() => {
    if (preferences) {
      applyTheme(preferences.theme);
    }
  }, [preferences?.theme]);

  const loadPreferences = async () => {
    if (!user) {
      setLoading(false);
      return;
    }
    
    setLoading(true);
    try {
      const prefs = await preferencesService.getPreferences(user.uid);
      setPreferences(prefs);
    } catch (error) {
      console.error('Failed to load preferences:', error);
    } finally {
      setLoading(false);
    }
  };

  const updatePreferences = async (updates: Partial<UserPreferences>) => {
    if (!user) return;
    
    try {
      await preferencesService.updatePreferences(user.uid, updates);
      setPreferences(prev => prev ? { ...prev, ...updates } : null);
    } catch (error) {
      console.error('Failed to update preferences:', error);
      throw error;
    }
  };

  const resetPreferences = async () => {
    if (!user) return;
    
    try {
      await preferencesService.resetPreferences(user.uid);
      await loadPreferences();
    } catch (error) {
      console.error('Failed to reset preferences:', error);
      throw error;
    }
  };

  return {
    preferences,
    loading,
    updatePreferences,
    resetPreferences,
    reloadPreferences: loadPreferences
  };
};

function applyTheme(theme: 'light' | 'dark' | 'auto') {
  const root = document.documentElement;
  
  if (theme === 'auto') {
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    if (prefersDark) {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    
    // Listen for system theme changes
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = (e: MediaQueryListEvent) => {
      if (e.matches) {
        root.classList.add('dark');
      } else {
        root.classList.remove('dark');
      }
    };
    
    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  } else if (theme === 'dark') {
    root.classList.add('dark');
  } else {
    root.classList.remove('dark');
  }
}
