import React from 'react';
import { useParams } from 'react-router-dom';
import { SiteDashboard } from '../components/site/SiteDashboard';

export const SiteDashboardPage: React.FC = () => {
  const { siteId } = useParams<{ siteId: string }>();

  if (!siteId) {
    return (
      <div className="text-center py-12">
        <p className="text-red-400 text-lg">Site ID is required</p>
      </div>
    );
  }

  return <SiteDashboard siteId={siteId} />;
};
