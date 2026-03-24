import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { authService } from '../services/auth.service';
import { LogIn, UserPlus } from 'lucide-react';

export const Login: React.FC = () => {
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const { user } = useAuth();
  const navigate = useNavigate();

  React.useEffect(() => {
    if (user) {
      navigate('/dashboard');
    }
  }, [user, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (isSignUp) {
        await authService.signUp(email, password);
      } else {
        await authService.signIn(email, password);
      }
      navigate('/dashboard');
    } catch (err: any) {
      let errorMessage = 'Authentication failed';
      
      if (err.code === 'auth/user-not-found') {
        errorMessage = 'User not found. Please sign up first or check your email.';
      } else if (err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') {
        errorMessage = 'Invalid email or password. If this is your first time, please click "Sign up" to create an account.';
      } else if (err.code === 'auth/invalid-email') {
        errorMessage = 'Invalid email address.';
      } else if (err.code === 'auth/weak-password') {
        errorMessage = 'Password should be at least 6 characters.';
      } else if (err.code === 'auth/email-already-in-use') {
        errorMessage = 'This email is already registered. Please sign in instead.';
      } else if (err.code === 'auth/network-request-failed') {
        errorMessage = 'Network error. Please check your connection.';
      } else if (err.message) {
        errorMessage = err.message;
      }
      
      setError(errorMessage);
      console.error('Auth error:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center px-4">
      <div className="max-w-md w-full">
        <div className="bg-slate-800 rounded-xl shadow-lg border border-slate-700 p-8">
          <div className="text-center mb-8">
            <img 
              src="/logo.svg" 
              alt="Apex SEO" 
              className="h-20 w-auto mx-auto mb-4"
            />
            <p className="text-slate-400">AI Blog Automation Platform</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="input-field"
                placeholder="you@example.com"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-2">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="input-field"
                placeholder="••••••••"
                required
                minLength={6}
              />
            </div>

            {error && (
              <div className="bg-red-500/20 border border-red-500/50 text-red-400 px-4 py-3 rounded-lg text-sm">
                <div className="font-medium mb-1">Error</div>
                <div>{error}</div>
                {error.includes('Invalid email or password') && (
                  <div className="mt-2 pt-2 border-t border-red-500/50">
                    <p className="text-xs">
                      <strong>First time?</strong> Click "Sign up" below to create an account, or visit{' '}
                      <a href="/dev" className="underline font-medium">/dev</a> to create one automatically.
                    </p>
                  </div>
                )}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full btn-primary flex items-center justify-center space-x-2 disabled:opacity-50"
            >
              {isSignUp ? (
                <>
                  <UserPlus className="w-5 h-5" />
                  <span>{loading ? 'Creating Account...' : 'Sign Up'}</span>
                </>
              ) : (
                <>
                  <LogIn className="w-5 h-5" />
                  <span>{loading ? 'Signing In...' : 'Sign In'}</span>
                </>
              )}
            </button>
          </form>

          <div className="mt-6 text-center">
            <button
              onClick={() => setIsSignUp(!isSignUp)}
              className="text-sm text-blue-400 hover:text-blue-300"
            >
              {isSignUp
                ? 'Already have an account? Sign in'
                : "Don't have an account? Sign up"}
            </button>
          </div>
        </div>

        <p className="text-center text-sm text-slate-400 mt-6">
          Demo: Use any email and password (6+ characters) to create an account
        </p>
      </div>
    </div>
  );
};
