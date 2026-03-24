import React, { useState } from 'react';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../../config/firebase';
import { useToast } from '../Toast';
import { CheckCircle2, AlertCircle, Loader2, ChevronDown, ChevronUp, HelpCircle } from 'lucide-react';

interface WordPressConnectStepProps {
  siteId?: string;
  onSuccess?: (data: { url: string; username: string; applicationPassword: string }) => void;
  initialData?: {
    url?: string;
    username?: string;
    applicationPassword?: string;
  };
}

export const WordPressConnectStep: React.FC<WordPressConnectStepProps> = ({
  siteId,
  onSuccess,
  initialData,
}) => {
  const [url, setUrl] = useState(initialData?.url || '');
  const [username, setUsername] = useState(initialData?.username || '');
  const [applicationPassword, setApplicationPassword] = useState(initialData?.applicationPassword || '');
  const [testing, setTesting] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');
  const [blogName, setBlogName] = useState('');
  const [showHowTo, setShowHowTo] = useState(false);
  const { showToast } = useToast();

  const handleTestConnection = async () => {
    // Validate inputs
    if (!url.trim()) {
      showToast('error', 'Please enter your WordPress URL');
      return;
    }

    if (!username.trim()) {
      showToast('error', 'Please enter your WordPress username');
      return;
    }

    if (!applicationPassword.trim()) {
      showToast('error', 'Please enter your Application Password');
      return;
    }

    setTesting(true);
    setConnectionStatus('idle');
    setErrorMessage('');

    try {
      const verifyConnection = httpsCallable(functions, 'verifyWordpressConnectionCallable');
      const result = await verifyConnection({
        url: url.trim(),
        username: username.trim(),
        applicationPassword: applicationPassword.trim(),
        siteId: siteId || null,
        save: !!siteId, // Auto-save if siteId is provided
      });

      const data = result.data as {
        success: boolean;
        blogName?: string;
        code?: string;
        message?: string;
        saved?: boolean;
      };

      if (data.success) {
        setConnectionStatus('success');
        setBlogName(data.blogName || 'WordPress Site');
        
        // Auto-save to parent form state
        if (onSuccess) {
          onSuccess({
            url: url.trim(),
            username: username.trim(),
            applicationPassword: applicationPassword.trim(),
          });
        }

        if (data.saved) {
          showToast('success', `✅ Connected to ${data.blogName || 'WordPress'}! Credentials saved.`);
        } else {
          showToast('success', `✅ Connected to ${data.blogName || 'WordPress'}!`);
        }
      } else {
        setConnectionStatus('error');
        setErrorMessage(data.message || 'Connection failed. Please check your credentials.');
        showToast('error', data.message || 'Connection failed');
      }
    } catch (error: any) {
      console.error('Error testing WordPress connection:', error);
      setConnectionStatus('error');
      
      // Extract error message from Firebase error
      let message = 'Failed to connect to WordPress';
      if (error.message) {
        message = error.message;
      } else if (error.code) {
        message = `Error: ${error.code}`;
      }

      setErrorMessage(message);
      showToast('error', message);
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-white mb-2">Connect Your WordPress Site</h2>
        <p className="text-slate-400 text-sm">
          We'll need your WordPress credentials to automatically publish your blog posts.
        </p>
      </div>

      {/* Input Fields */}
      <div className="space-y-4">
        <div>
          <label htmlFor="wp-url" className="block text-sm font-medium text-slate-300 mb-2">
            Website URL
          </label>
          <input
            id="wp-url"
            type="text"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://mybusiness.com"
            className="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            disabled={testing || connectionStatus === 'success'}
          />
          <p className="mt-1 text-xs text-slate-500">
            Your WordPress site URL (must use HTTPS)
          </p>
        </div>

        <div>
          <label htmlFor="wp-username" className="block text-sm font-medium text-slate-300 mb-2">
            WordPress Username
          </label>
          <input
            id="wp-username"
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="your-username"
            className="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            disabled={testing || connectionStatus === 'success'}
          />
          <p className="mt-1 text-xs text-slate-500">
            The username you use to log into WordPress
          </p>
        </div>

        <div>
          <label htmlFor="wp-app-password" className="block text-sm font-medium text-slate-300 mb-2">
            Application Password
          </label>
          <input
            id="wp-app-password"
            type="password"
            value={applicationPassword}
            onChange={(e) => setApplicationPassword(e.target.value)}
            placeholder="abcd efgh ijkl mnop"
            className="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            disabled={testing || connectionStatus === 'success'}
          />
          <p className="mt-1 text-xs text-slate-500">
            Not your login password! This is a special Application Password.
          </p>
        </div>
      </div>

      {/* How-To Helper Section */}
      <div className="bg-slate-800/50 border border-slate-700 rounded-lg overflow-hidden">
        <button
          onClick={() => setShowHowTo(!showHowTo)}
          className="w-full px-4 py-3 flex items-center justify-between text-left hover:bg-slate-800/70 transition-colors"
          disabled={testing || connectionStatus === 'success'}
        >
          <div className="flex items-center space-x-2">
            <HelpCircle className="w-5 h-5 text-blue-400" />
            <span className="text-sm font-medium text-slate-300">
              Where do I find my Application Password?
            </span>
          </div>
          {showHowTo ? (
            <ChevronUp className="w-5 h-5 text-slate-400" />
          ) : (
            <ChevronDown className="w-5 h-5 text-slate-400" />
          )}
        </button>

        {showHowTo && (
          <div className="px-4 pb-4 pt-2 border-t border-slate-700">
            <ol className="space-y-3 text-sm text-slate-300">
              <li className="flex items-start space-x-3">
                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-500/20 text-blue-400 flex items-center justify-center text-xs font-semibold">
                  1
                </span>
                <span>
                  Go to your WordPress Admin dashboard, then navigate to <strong className="text-white">Users</strong> → <strong className="text-white">Profile</strong>
                </span>
              </li>
              <li className="flex items-start space-x-3">
                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-500/20 text-blue-400 flex items-center justify-center text-xs font-semibold">
                  2
                </span>
                <span>
                  Scroll down to the <strong className="text-white">"Application Passwords"</strong> section at the bottom of the page
                </span>
              </li>
              <li className="flex items-start space-x-3">
                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-500/20 text-blue-400 flex items-center justify-center text-xs font-semibold">
                  3
                </span>
                <span>
                  Type <strong className="text-white">"Apex"</strong> in the Application Name field and click <strong className="text-white">"Add New Application Password"</strong>
                </span>
              </li>
              <li className="flex items-start space-x-3">
                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-500/20 text-blue-400 flex items-center justify-center text-xs font-semibold">
                  4
                </span>
                <span>
                  Copy the generated password (it will look like: <code className="bg-slate-900 px-1.5 py-0.5 rounded text-xs">abcd efgh ijkl mnop</code>) and paste it in the field above
                </span>
              </li>
            </ol>
            <div className="mt-4 p-3 bg-blue-500/10 border border-blue-500/20 rounded-lg">
              <p className="text-xs text-blue-300">
                <strong>Note:</strong> This is different from your regular WordPress login password. Application Passwords are more secure and can be revoked at any time.
              </p>
            </div>
            {/* Placeholder for GIF - you can add an image here later */}
            {/* <div className="mt-4 rounded-lg overflow-hidden border border-slate-700">
              <img src="/path/to/wordpress-app-password-tutorial.gif" alt="WordPress Application Password Tutorial" className="w-full" />
            </div> */}
          </div>
        )}
      </div>

      {/* Test Connection Button */}
      {connectionStatus !== 'success' && (
        <button
          onClick={handleTestConnection}
          disabled={testing || !url.trim() || !username.trim() || !applicationPassword.trim()}
          className="w-full btn-primary flex items-center justify-center space-x-2 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {testing ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" />
              <span>Verifying...</span>
            </>
          ) : (
            <span>Test Connection</span>
          )}
        </button>
      )}

      {/* Success State */}
      {connectionStatus === 'success' && (
        <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-4">
          <div className="flex items-start space-x-3">
            <CheckCircle2 className="w-6 h-6 text-green-400 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <h3 className="text-green-400 font-semibold mb-1">
                Connected to {blogName}!
              </h3>
              <p className="text-sm text-slate-300">
                Your WordPress connection has been verified and saved. You can proceed to the next step.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Error State */}
      {connectionStatus === 'error' && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4">
          <div className="flex items-start space-x-3">
            <AlertCircle className="w-6 h-6 text-red-400 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <h3 className="text-red-400 font-semibold mb-1">
                Connection Failed
              </h3>
              <p className="text-sm text-slate-300 mb-3">
                {errorMessage}
              </p>
              <button
                onClick={() => {
                  setConnectionStatus('idle');
                  setErrorMessage('');
                }}
                className="text-sm text-red-400 hover:text-red-300 underline"
              >
                Try Again
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
