import React from 'react';
import { useContentGapFiller } from '../../hooks/useContentGapFiller';
import { Site } from '../../types/site';

interface AutoFillGapFillerProps {
  site: Site;
  enabled: boolean;
}

/**
 * Component wrapper for useContentGapFiller hook
 * This allows us to use the hook for multiple sites without violating React hooks rules
 */
export const AutoFillGapFiller: React.FC<AutoFillGapFillerProps> = ({ site, enabled }) => {
  useContentGapFiller({
    siteId: site.id,
    postingFrequency: (site as any).postingFrequency || 3,
    autoApprove: (site as any).autoApprove || false,
    enabled: enabled && site.isActive !== false,
  });

  // This component doesn't render anything
  return null;
};
