export interface BlogGenerationJob {
  id: string;
  userId: string;
  siteId: string;
  totalBlogs: number;
  completedBlogs: number;
  failedBlogs: number;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  errors: string[];
  createdAt: Date;
  updatedAt: Date;
}
