import React, { createContext, useContext, ReactNode, useMemo } from 'react';
import { useAgency } from '../hooks/useAgency';

interface AgencyContextType {
  agencyId: string | null;
  agency: {
    id: string;
    name: string;
    ownerId: string;
    members: string[];
    billingType: 'stripe' | 'internal';
    subscriptionStatus?: 'active' | 'past_due' | 'canceled' | 'unpaid' | 'trial';
    trialEndsAt?: Date;
    country?: string;
    logoUrl?: string;
    monthlyReportDayOfMonth?: number;
    googleAccountLinked?: boolean;
    googleSendFromEmail?: string;
    createdAt?: Date;
    updatedAt?: Date;
  } | null;
  loading: boolean;
  error: Error | null;
}

const AgencyContext = createContext<AgencyContextType | undefined>(undefined);

export const AgencyProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const agencyData = useAgency();

  // Memoize the context value to prevent unnecessary re-renders
  const contextValue = useMemo(() => agencyData, [
    agencyData.agencyId,
    agencyData.agency?.id,
    agencyData.loading,
    agencyData.error?.message,
  ]);

  return (
    <AgencyContext.Provider value={contextValue}>
      {children}
    </AgencyContext.Provider>
  );
};

export const useAgencyContext = () => {
  const context = useContext(AgencyContext);
  if (context === undefined) {
    throw new Error('useAgencyContext must be used within an AgencyProvider');
  }
  return context;
};
