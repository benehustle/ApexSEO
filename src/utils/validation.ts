import { z } from 'zod';

export const siteValidation = z.object({
  name: z.string().min(1, 'Site name is required').max(100),
  url: z.string().url('Invalid URL'),
  wordpressApiUrl: z.string().url('Invalid WordPress API URL'),
  wordpressUsername: z.string().min(1, 'Username is required'),
  wordpressAppPassword: z.string().min(1, 'App password is required'),
  industry: z.string().min(1, 'Industry is required'),
  targetAudience: z.string().min(10, 'Please provide more detail'),
  brandVoice: z.string().min(10, 'Please provide more detail'),
  blogsPerWeek: z.number().min(1).max(7),
});

export const blogValidation = z.object({
  title: z.string().min(10).max(100),
  content: z.string().min(100),
  excerpt: z.string().min(50).max(300),
  keyword: z.string().min(2).max(50),
});

export const keywordValidation = z.object({
  keyword: z.string().min(2).max(100),
});
