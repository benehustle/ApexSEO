import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { siteService } from '../services/site.service';
import { useAuth } from './useAuth';
import { useAgencyContext } from '../contexts/AgencyContext';

export const useSites = () => {
  const { user } = useAuth();
  const { agencyId, loading: agencyLoading } = useAgencyContext();

  return useQuery({
    queryKey: ['sites', agencyId],
    queryFn: () => {
      if (!agencyId) {
        throw new Error('Agency ID is required to fetch sites');
      }
      console.log('[useSites] Querying sites for Agency:', agencyId);
      return siteService.getUserSites(user!.uid, agencyId);
    },
    enabled: !!user && !!agencyId && !agencyLoading,
    staleTime: 10 * 60 * 1000, // 10 minutes
  });
};

export const useSite = (siteId: string) => {
  return useQuery({
    queryKey: ['site', siteId],
    queryFn: () => siteService.getSite(siteId),
    enabled: !!siteId,
  });
};

export const useUpdateSite = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ siteId, updates }: any) => siteService.updateSite(siteId, updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sites'] });
    },
  });
};
