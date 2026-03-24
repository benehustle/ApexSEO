import React, { useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import { seedUser } from '../utils/seedUser';
import { authService } from '../services/auth.service';
import { blogService } from '../services/blog.service';
import { CheckCircle, XCircle, AlertCircle, Trash2 } from 'lucide-react';

export const DevUtils: React.FC = () => {
  const { user } = useAuth();
  const [seeding, setSeeding] = useState(false);
  const [testing, setTesting] = useState(false);
  const [deletingBlogs, setDeletingBlogs] = useState(false);
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null);
  const isDev = import.meta.env.DEV;

  const handleSeedUser = async () => {
    if (!user) {
      setResult({ success: false, message: 'Please log in first' });
      return;
    }

    setSeeding(true);
    setResult(null);

    try {
      await seedUser(user.uid, user.email || '');
      setResult({ success: true, message: 'User document created successfully in Firestore!' });
    } catch (error: any) {
      setResult({ success: false, message: error.message || 'Failed to seed user' });
    } finally {
      setSeeding(false);
    }
  };

  const handleSeedSpecificUser = async () => {
    setSeeding(true);
    setResult(null);

    try {
      await seedUser('XkMHFUavXVgGV6YfapK9wBYPrbK2', 'ben@spotonwebsites.com.au');
      setResult({ success: true, message: 'User document created successfully in Firestore!' });
    } catch (error: any) {
      setResult({ success: false, message: error.message || 'Failed to seed user' });
    } finally {
      setSeeding(false);
    }
  };

  const handleTestLogin = async () => {
    setTesting(true);
    setResult(null);

    try {
      // Try to sign in with the specific email
      await authService.signIn('ben@spotonwebsites.com.au', 'test123456');
      setResult({ success: true, message: 'Login successful! Auth user exists.' });
    } catch (error: any) {
      if (error.code === 'auth/user-not-found') {
        setResult({ 
          success: false, 
          message: 'Auth user does not exist. You need to create an account first. Click "Create Auth Account" below.' 
        });
      } else if (error.code === 'auth/wrong-password') {
        setResult({ 
          success: true, 
          message: 'Auth user exists! (Wrong password, but user is registered)' 
        });
      } else {
        setResult({ success: false, message: error.message || 'Failed to test login' });
      }
    } finally {
      setTesting(false);
    }
  };

  const handleCreateAuthAccount = async () => {
    setTesting(true);
    setResult(null);

    try {
      await authService.signUp('ben@spotonwebsites.com.au', 'test123456');
      setResult({ 
        success: true, 
        message: 'Auth account created! Email: ben@spotonwebsites.com.au, Password: test123456. You can now sign in.' 
      });
    } catch (error: any) {
      if (error.code === 'auth/email-already-in-use') {
        setResult({ 
          success: true, 
          message: 'Auth account already exists! You can sign in with your password.' 
        });
      } else {
        setResult({ success: false, message: error.message || 'Failed to create auth account' });
      }
    } finally {
      setTesting(false);
    }
  };

  const handleDeleteAllBlogs = async () => {
    if (!isDev) {
      setResult({ success: false, message: 'This action is only available in development mode' });
      return;
    }

    const confirmed = confirm(
      '⚠️ DANGER ZONE ⚠️\n\n' +
      'Are you absolutely sure you want to delete ALL blogs from Firestore?\n\n' +
      'This action cannot be undone!\n\n' +
      'Type "DELETE ALL" in the next prompt to confirm.'
    );

    if (!confirmed) return;

    const doubleConfirm = prompt('Type "DELETE ALL" to confirm deletion of all blogs:');
    if (doubleConfirm !== 'DELETE ALL') {
      setResult({ success: false, message: 'Deletion cancelled. You must type "DELETE ALL" exactly.' });
      return;
    }

    setDeletingBlogs(true);
    setResult(null);

    try {
      const count = await blogService.deleteAllBlogs();
      setResult({ 
        success: true, 
        message: `Successfully deleted ${count} blog(s) from Firestore.` 
      });
    } catch (error: any) {
      setResult({ success: false, message: error.message || 'Failed to delete all blogs' });
    } finally {
      setDeletingBlogs(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-3xl font-bold text-gray-900 mb-6">Development Utilities</h1>

        <div className="bg-white rounded-lg shadow p-6 space-y-6">
          {/* Info Alert */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <div className="flex items-start space-x-3">
              <AlertCircle className="w-5 h-5 text-blue-600 mt-0.5" />
              <div className="flex-1">
                <h3 className="font-semibold text-blue-900 mb-1">Important: Two Separate Systems</h3>
                <p className="text-sm text-blue-800 mb-2">
                  Firebase has two separate systems:
                </p>
                <ul className="text-sm text-blue-800 list-disc list-inside space-y-1">
                  <li><strong>Authentication</strong> - For login (email/password)</li>
                  <li><strong>Firestore</strong> - For storing user data documents</li>
                </ul>
                <p className="text-sm text-blue-800 mt-2">
                  You need BOTH to work. The Firestore document you created is separate from the auth account.
                </p>
              </div>
            </div>
          </div>

          {/* Auth Account Section */}
          <div className="border-t pt-6">
            <h2 className="text-xl font-semibold mb-4">Firebase Authentication</h2>
            <p className="text-gray-600 mb-4">
              Create or test the authentication account for ben@spotonwebsites.com.au
            </p>

            <div className="space-y-3">
              <button
                onClick={handleTestLogin}
                disabled={testing}
                className="btn-secondary w-full disabled:opacity-50"
              >
                {testing ? 'Testing...' : 'Test if Auth Account Exists'}
              </button>

              <button
                onClick={handleCreateAuthAccount}
                disabled={testing}
                className="btn-primary w-full disabled:opacity-50"
              >
                {testing ? 'Creating...' : 'Create Auth Account (ben@spotonwebsites.com.au)'}
              </button>
            </div>

            <p className="text-xs text-gray-500 mt-3">
              Default password: test123456 (you can change it after logging in)
            </p>
          </div>

          {/* Firestore User Document Section */}
          <div className="border-t pt-6">
            <h2 className="text-xl font-semibold mb-4">Firestore User Document</h2>
            <p className="text-gray-600 mb-4">
              Create the user document in Firestore (you may have already done this manually)
            </p>

            <div className="space-y-3">
              {user && (
                <button
                  onClick={handleSeedUser}
                  disabled={seeding}
                  className="btn-secondary w-full disabled:opacity-50"
                >
                  {seeding ? 'Seeding...' : `Seed Current User (${user.email})`}
                </button>
              )}

              <button
                onClick={handleSeedSpecificUser}
                disabled={seeding}
                className="btn-secondary w-full disabled:opacity-50"
              >
                {seeding ? 'Seeding...' : 'Seed Specific User (ben@spotonwebsites.com.au)'}
              </button>
            </div>
          </div>

          {/* Results */}
          {result && (
            <div
              className={`p-4 rounded-lg flex items-start space-x-2 ${
                result.success
                  ? 'bg-green-50 text-green-800'
                  : 'bg-red-50 text-red-800'
              }`}
            >
              {result.success ? (
                <CheckCircle className="w-5 h-5 mt-0.5" />
              ) : (
                <XCircle className="w-5 h-5 mt-0.5" />
              )}
              <span className="flex-1">{result.message}</span>
            </div>
          )}

          {/* Current User Info */}
          <div className="border-t pt-6">
            <h3 className="font-semibold mb-2">Current User Info</h3>
            {user ? (
              <div className="text-sm space-y-1 bg-gray-50 p-3 rounded">
                <p><strong>UID:</strong> {user.uid}</p>
                <p><strong>Email:</strong> {user.email}</p>
                <p className="text-xs text-gray-500 mt-2">
                  {user.uid === 'XkMHFUavXVgGV6YfapK9wBYPrbK2' 
                    ? '✅ This matches your expected UID' 
                    : '⚠️ This UID does not match XkMHFUavXVgGV6YfapK9wBYPrbK2'}
                </p>
              </div>
            ) : (
              <p className="text-gray-500">Not logged in</p>
            )}
          </div>

          {/* Instructions */}
          <div className="border-t pt-6">
            <h3 className="font-semibold mb-2">Quick Start Instructions</h3>
            <ol className="text-sm text-gray-600 space-y-2 list-decimal list-inside">
              <li>Click "Create Auth Account" above to create the Firebase Authentication user</li>
              <li>Go to the login page and sign in with: ben@spotonwebsites.com.au / test123456</li>
              <li>After logging in, come back here and click "Seed Specific User" to create the Firestore document</li>
              <li>You're all set! The app should now work properly.</li>
            </ol>
          </div>

          {/* Dev Only: Delete All Blogs */}
          {isDev && (
            <div className="border-t pt-6">
              <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
                <div className="flex items-start space-x-3">
                  <AlertCircle className="w-5 h-5 text-red-600 mt-0.5" />
                  <div className="flex-1">
                    <h3 className="font-semibold text-red-900 mb-1">⚠️ Development Only: Danger Zone</h3>
                    <p className="text-sm text-red-800">
                      This section is only visible in development mode. Use with extreme caution!
                    </p>
                  </div>
                </div>
              </div>

              <h2 className="text-xl font-semibold mb-4 text-red-900">Delete All Blogs</h2>
              <p className="text-gray-600 mb-4">
                Permanently delete all blog posts from Firestore. This action cannot be undone!
              </p>

              <button
                onClick={handleDeleteAllBlogs}
                disabled={deletingBlogs}
                className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg flex items-center space-x-2 disabled:opacity-50 disabled:cursor-not-allowed w-full"
              >
                <Trash2 className="w-5 h-5" />
                <span>{deletingBlogs ? 'Deleting...' : 'Delete All Blogs'}</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
