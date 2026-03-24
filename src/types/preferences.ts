export interface UserPreferences {
  // Notifications
  emailNotifications: {
    blogPublished: boolean;
    blogApprovalNeeded: boolean;
    dailyDigest: boolean;
    weeklyReport: boolean;
    errorAlerts: boolean;
  };
  
  // UI Preferences
  theme: 'light' | 'dark' | 'auto';
  dateFormat: 'MM/DD/YYYY' | 'DD/MM/YYYY' | 'YYYY-MM-DD';
  timeFormat: '12h' | '24h';
  defaultView: 'calendar' | 'list' | 'grid';
  blogsPerPage: 10 | 25 | 50 | 100;
  
  // Content Defaults
  defaultWordCount: number;
  defaultBlogsPerWeek: number;
  autoApprove: boolean;
  requireImageReview: boolean;
  
  // AI Settings
  contentTemperature: number; // 0-1 for creativity
  imageStyle: 'photorealistic' | 'illustration' | 'abstract' | 'minimal';
  tonePreference: 'professional' | 'casual' | 'friendly' | 'authoritative';
  
  // Advanced
  enableBetaFeatures: boolean;
  showAnalyticsTips: boolean;
  compactMode: boolean;
}

export const DEFAULT_PREFERENCES: UserPreferences = {
  emailNotifications: {
    blogPublished: true,
    blogApprovalNeeded: true,
    dailyDigest: false,
    weeklyReport: true,
    errorAlerts: true
  },
  theme: 'light',
  dateFormat: 'MM/DD/YYYY',
  timeFormat: '12h',
  defaultView: 'calendar',
  blogsPerPage: 25,
  defaultWordCount: 2000,
  defaultBlogsPerWeek: 3,
  autoApprove: false,
  requireImageReview: true,
  contentTemperature: 0.7,
  imageStyle: 'photorealistic',
  tonePreference: 'professional',
  enableBetaFeatures: false,
  showAnalyticsTips: true,
  compactMode: false
};
