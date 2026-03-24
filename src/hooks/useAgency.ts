import { useState, useEffect, useRef } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../config/firebase';
import { useAuth } from './useAuth';

interface AgencyData {
  id: string;
  name: string;
  ownerId: string;
  members: string[];
  billingType: 'stripe' | 'internal';
  subscriptionStatus?: 'active' | 'past_due' | 'canceled' | 'unpaid' | 'trial';
  trialEndsAt?: Date;
  country?: string;
  /** Firebase Storage URL for agency logo (reports & branding). */
  logoUrl?: string;
  /** Day of month (1-28) to send monthly reports. */
  monthlyReportDayOfMonth?: number;
  /** Whether a send-from email is set for reports. */
  googleAccountLinked?: boolean;
  /** Email used as From/Reply-To for monthly reports (MVP: manual entry). */
  googleSendFromEmail?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

interface UserData {
  agencyId: string | null;
  uid: string;
  email?: string;
  displayName?: string;
}

export const useAgency = () => {
  const { user } = useAuth();
  const [agencyId, setAgencyId] = useState<string | null>(null);
  const [agency, setAgency] = useState<AgencyData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const currentAgencyIdRef = useRef<string | null>(null);
  const hasLoadedRef = useRef(false);
  const lastUserIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!user) {
      setAgencyId(null);
      setAgency(null);
      setLoading(false);
      currentAgencyIdRef.current = null;
      hasLoadedRef.current = false;
      lastUserIdRef.current = null;
      return;
    }

    // Always set loading to true when user changes or on first load
    // This ensures we show loading state until data is ready
    const userChanged = lastUserIdRef.current !== user.uid;
    if (!hasLoadedRef.current || userChanged) {
      setLoading(true);
      lastUserIdRef.current = user.uid;
    }
    setError(null);

    let unsubscribeAgency: (() => void) | null = null;
    let isMounted = true;

    // Subscribe to user document to get agencyId
    const userRef = doc(db, 'users', user.uid);
    console.log('[useAgency] Subscribing to user document:', user.uid);
    
    const unsubscribeUser = onSnapshot(
      userRef,
      (snapshot) => {
        if (!isMounted) return;

        console.log('[useAgency] User document snapshot received:', snapshot.exists());

        if (snapshot.exists()) {
          const userData = snapshot.data() as UserData;
          const newAgencyId = userData.agencyId || null;
          
          console.log('[useAgency] User document has agencyId:', newAgencyId);
          
          // Always update agencyId state when we get new data from user document
          setAgencyId(newAgencyId);
          
          // Update ref if it changed
          if (newAgencyId !== currentAgencyIdRef.current) {
            currentAgencyIdRef.current = newAgencyId;
          }

          // Clean up previous agency subscription if it exists
          if (unsubscribeAgency) {
            unsubscribeAgency();
            unsubscribeAgency = null;
          }

          // If agencyId exists, subscribe to agency document
          if (newAgencyId) {
            console.log('[useAgency] Subscribing to agency document:', newAgencyId);
            const agencyRef = doc(db, 'agencies', newAgencyId);
            unsubscribeAgency = onSnapshot(
              agencyRef,
              (agencySnapshot) => {
                if (!isMounted) return;

                console.log('[useAgency] Agency document snapshot received:', agencySnapshot.exists());

                if (agencySnapshot.exists()) {
                  const agencyData = agencySnapshot.data();
                  setAgency({
                    id: agencySnapshot.id,
                    name: agencyData?.name || '',
                    ownerId: agencyData?.ownerId || '',
                    members: agencyData?.members || [],
                    billingType: agencyData?.billingType || 'stripe',
                    subscriptionStatus: agencyData?.subscriptionStatus,
                    trialEndsAt: agencyData?.trialEndsAt?.toDate(),
                    country: agencyData?.country,
                    logoUrl: agencyData?.logoUrl,
                    monthlyReportDayOfMonth: agencyData?.monthlyReportDayOfMonth,
                    googleAccountLinked: agencyData?.googleAccountLinked,
                    googleSendFromEmail: agencyData?.googleSendFromEmail,
                    createdAt: agencyData?.createdAt?.toDate(),
                    updatedAt: agencyData?.updatedAt?.toDate(),
                  });
                  console.log('[useAgency] Agency loaded:', agencyData?.name);
                } else {
                  console.log('[useAgency] Agency document does not exist');
                  setAgency(null);
                }
                hasLoadedRef.current = true;
                setLoading(false);
              },
              (err) => {
                if (!isMounted) return;
                console.error('[useAgency] Error fetching agency:', err);
                setError(err);
                hasLoadedRef.current = true;
                setLoading(false);
              }
            );
          } else {
            // User exists but has no agencyId - just mark as loaded
            // Note: ensureAgencyExistsCallable is now read-only and won't create agencies
            console.log('[useAgency] User has no agencyId');
            setAgency(null);
            hasLoadedRef.current = true;
            setLoading(false);
            currentAgencyIdRef.current = null;
          }
        } else {
          // User document doesn't exist - this might mean they need to initialize
          console.log('[useAgency] User document does not exist');
          setAgencyId(null);
          setAgency(null);
          hasLoadedRef.current = true;
          setLoading(false);
          currentAgencyIdRef.current = null;
        }
      },
      (err) => {
        if (!isMounted) return;
        console.error('[useAgency] Error fetching user:', err);
        setError(err);
        hasLoadedRef.current = true;
        setLoading(false);
      }
    );

    return () => {
      isMounted = false;
      unsubscribeUser();
      if (unsubscribeAgency) {
        unsubscribeAgency();
      }
    };
  }, [user]);

  return {
    agencyId,
    agency,
    loading,
    error,
  };
};
