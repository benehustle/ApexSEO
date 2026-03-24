import { useCallback } from 'react';
import { useToast } from '../components/Toast';
import { loggerService } from '../services/logger.service';
import { useAuth } from './useAuth';

export const useErrorHandler = () => {
  const { showToast } = useToast();
  const { user } = useAuth();

  const handleError = useCallback((error: Error | any, showNotification: boolean = true, context?: any) => {
    // Ensure we have a proper Error object
    const errorObj = error instanceof Error 
      ? error 
      : new Error(String(error || 'Unknown error'));
    
    // Log to console in development
    if (import.meta.env.DEV) {
      console.error('Error:', errorObj);
    }

    // Log to Firestore
    loggerService.logError(errorObj, context || {}, user?.uid).catch(console.error);

    // Show user-friendly message
    if (showNotification) {
      const message = getUserFriendlyMessage(errorObj);
      showToast('error', message);
    }
  }, [user, showToast]);

  return { handleError };
};

function getUserFriendlyMessage(error: Error | any): string {
  // Safely extract error message
  const errorMessage = error instanceof Error 
    ? error.message 
    : String(error || 'Unknown error');
  
  const errorName = error instanceof Error 
    ? error.name 
    : 'Error';

  const errorMessages: Record<string, string> = {
    'auth/user-not-found': 'No account found with this email',
    'auth/wrong-password': 'Incorrect password',
    'auth/invalid-credential': 'Invalid email or password',
    'auth/email-already-in-use': 'An account with this email already exists',
    'auth/weak-password': 'Password should be at least 6 characters',
    'permission-denied': 'You don\'t have permission to perform this action',
    'not-found': 'The requested resource was not found',
    'network-request-failed': 'Network error. Please check your connection',
    'WordPressConnectionError': 'Failed to connect to WordPress. Please check your credentials.',
    'AIGenerationError': 'Failed to generate content. Please try again.',
    'FirebaseError': 'Database error. Please try again.',
    'RateLimitError': 'Too many requests. Please wait a moment.',
    'ValidationError': 'Invalid input. Please check your data.',
  };

  for (const [key, message] of Object.entries(errorMessages)) {
    if (errorMessage.includes(key) || errorName.includes(key)) {
      return message;
    }
  }

  return 'Something went wrong. Please try again.';
}
