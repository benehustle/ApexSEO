import { describe, it, expect, vi, beforeEach } from 'vitest';
import { blogService } from '../blog.service';
import { collection, query, where, getDocs, doc, updateDoc, deleteDoc } from 'firebase/firestore';

// Mock Firestore
vi.mock('../../config/firebase', () => ({
  db: {},
}));

vi.mock('firebase/firestore', () => ({
  collection: vi.fn(),
  query: vi.fn(),
  where: vi.fn(),
  orderBy: vi.fn(),
  getDocs: vi.fn(),
  doc: vi.fn(),
  getDoc: vi.fn(),
  updateDoc: vi.fn(),
  deleteDoc: vi.fn(),
  Timestamp: {
    now: vi.fn(() => ({ toDate: () => new Date() })),
    fromDate: vi.fn((date) => ({ toDate: () => date })),
  },
}));

describe('BlogService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getBlogs', () => {
    it('should fetch blogs for a site', async () => {
      const mockBlogs = [
        {
          id: 'blog-1',
          data: () => ({
            siteId: 'site-123',
            title: 'Test Blog',
            scheduledDate: { toDate: () => new Date() },
            createdAt: { toDate: () => new Date() },
            updatedAt: { toDate: () => new Date() },
          }),
        },
      ];

      vi.mocked(getDocs).mockResolvedValue({
        docs: mockBlogs,
      } as any);

      vi.mocked(collection).mockReturnValue({} as any);
      vi.mocked(query).mockReturnValue({} as any);
      vi.mocked(where).mockReturnValue({} as any);

      const result = await blogService.getBlogs('site-123');

      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
    });

    it('should filter blogs by status', async () => {
      vi.mocked(getDocs).mockResolvedValue({
        docs: [],
      } as any);

      vi.mocked(collection).mockReturnValue({} as any);
      vi.mocked(query).mockReturnValue({} as any);
      vi.mocked(where).mockReturnValue({} as any);

      const result = await blogService.getBlogs('site-123', { status: 'pending' });

      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
    });
  });

  describe('getBlog', () => {
    it('should fetch a single blog', async () => {
      const { getDoc } = await import('firebase/firestore');
      
      vi.mocked(getDoc).mockResolvedValue({
        exists: () => true,
        id: 'blog-123',
        data: () => ({
          title: 'Test Blog',
          scheduledDate: { toDate: () => new Date() },
          createdAt: { toDate: () => new Date() },
          updatedAt: { toDate: () => new Date() },
        }),
      } as any);

      vi.mocked(doc).mockReturnValue({} as any);

      const result = await blogService.getBlog('blog-123');

      expect(result).toBeDefined();
      expect(result?.id).toBe('blog-123');
    });

    it('should return null if blog does not exist', async () => {
      const { getDoc } = await import('firebase/firestore');
      
      vi.mocked(getDoc).mockResolvedValue({
        exists: () => false,
      } as any);

      vi.mocked(doc).mockReturnValue({} as any);

      const result = await blogService.getBlog('non-existent');

      expect(result).toBeNull();
    });
  });

  describe('updateBlog', () => {
    it('should update blog', async () => {
      vi.mocked(doc).mockReturnValue({} as any);
      vi.mocked(updateDoc).mockResolvedValue(undefined);

      await expect(
        blogService.updateBlog('blog-123', { status: 'approved' })
      ).resolves.not.toThrow();

      expect(updateDoc).toHaveBeenCalled();
    });
  });

  describe('deleteBlog', () => {
    it('should delete a blog', async () => {
      vi.mocked(doc).mockReturnValue({} as any);
      vi.mocked(deleteDoc).mockResolvedValue(undefined);

      await expect(
        blogService.deleteBlog('blog-123')
      ).resolves.not.toThrow();

      expect(deleteDoc).toHaveBeenCalled();
    });
  });
});
