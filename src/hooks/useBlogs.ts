import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { blogService } from '../services/blog.service';
import { Blog } from '../types/blog';

export const useBlogs = (siteId?: string, status?: string) => {
  return useQuery({
    queryKey: ['blogs', siteId, status],
    queryFn: () => blogService.getBlogs(siteId, { status }),
    staleTime: 5 * 60 * 1000,
  });
};

export const useBlog = (blogId: string) => {
  return useQuery({
    queryKey: ['blog', blogId],
    queryFn: () => blogService.getBlog(blogId),
    enabled: !!blogId,
  });
};

export const useUpdateBlog = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ blogId, updates }: { blogId: string; updates: Partial<Blog> }) => {
      if (updates.status) {
        return blogService.updateBlogStatus(blogId, updates.status);
      }
      return blogService.updateBlog(blogId, updates);
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['blogs'] });
      queryClient.invalidateQueries({ queryKey: ['blog', variables.blogId] });
    },
  });
};

export const useDeleteBlog = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (blogId: string) => blogService.deleteBlog(blogId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['blogs'] });
    },
  });
};
