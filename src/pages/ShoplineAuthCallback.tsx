import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../config/firebase';
import { useAuth } from '../hooks/useAuth';

type CallbackStatus = 'working' | 'success' | 'error' | 'login_required';

export const ShoplineAuthCallback: React.FC = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user, loading } = useAuth();
  const [status, setStatus] = useState<CallbackStatus>('working');
  const [message, setMessage] = useState('Processing Shopline authorization...');

  const paramsObj = useMemo(() => {
    const entries = Array.from(searchParams.entries());
    return entries.reduce((acc, [k, v]) => ({ ...acc, [k]: v }), {} as Record<string, string>);
  }, [searchParams]);

  useEffect(() => {
    if (loading) return;

    if (!user) {
      setStatus('login_required');
      setMessage('Please sign in first, then reopen this callback URL.');
      return;
    }

    const processCallback = async () => {
      const code = searchParams.get('code');
      const customField = searchParams.get('customField') || undefined;

      // Try to get handle from query params first; fall back to customField (stored during auth URL generation)
      let handle =
        searchParams.get('handle') ||
        searchParams.get('shop') ||
        searchParams.get('shopHandle') ||
        searchParams.get('merchantHandle') ||
        '';

      if (!handle && customField) {
        try {
          const parsed = JSON.parse(customField);
          handle = parsed.handle || '';
        } catch {
          // ignore parse errors
        }
      }

      if (!code) {
        setStatus('error');
        setMessage('Missing authorization code in callback URL.');
        return;
      }
      if (!handle) {
        setStatus('error');
        setMessage('Missing Shopline handle in callback URL.');
        return;
      }

      try {
        const exchangeCode = httpsCallable(functions, 'exchangeShoplineCodeCallable');
        const result = await exchangeCode({
          code,
          handle,
          customField,
          queryParams: paramsObj,
        });

        const data = result.data as {
          success: boolean;
          accessToken?: string;
          handle: string;
          siteId?: string | null;
          returnTo?: string;
        };

        if (!data.success) {
          throw new Error('Shopline token exchange failed.');
        }

        // For onboarding flow (site not created yet), pass token back via sessionStorage
        if (!data.siteId && data.accessToken) {
          sessionStorage.setItem('shopline_oauth_result', JSON.stringify({
            handle: data.handle,
            accessToken: data.accessToken,
          }));
        }

        setStatus('success');
        setMessage('Shopline connected successfully. Redirecting...');

        const destination = data.returnTo || '/onboarding';
        window.setTimeout(() => {
          navigate(destination);
        }, 800);
      } catch (error: any) {
        console.error('Shopline callback error:', error);
        setStatus('error');
        setMessage(error?.message || 'Failed to complete Shopline authorization.');
      }
    };

    processCallback();
  }, [loading, navigate, paramsObj, searchParams, user]);

  return (
    <div className="max-w-xl mx-auto py-12 px-4">
      <div className="card p-8">
        <h1 className="text-xl font-bold text-white mb-3">Shopline Callback</h1>
        <p className="text-slate-300 text-sm mb-6">{message}</p>

        {status === 'working' && <p className="text-slate-400 text-sm">Please wait...</p>}
        {status === 'success' && <p className="text-green-400 text-sm">Authorization complete.</p>}
        {status === 'login_required' && (
          <button onClick={() => navigate('/login')} className="btn-primary">
            Go to Login
          </button>
        )}
        {status === 'error' && (
          <button onClick={() => navigate('/onboarding')} className="btn-secondary">
            Back to Onboarding
          </button>
        )}
      </div>
    </div>
  );
};

export default ShoplineAuthCallback;

