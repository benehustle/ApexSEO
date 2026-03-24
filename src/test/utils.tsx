import { render, RenderOptions } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactElement } from 'react';
import { ToastProvider } from '../components/Toast';

const createTestQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: 0, // Previously cacheTime
      },
    },
  });

interface CustomRenderOptions extends Omit<RenderOptions, 'wrapper'> {
  route?: string;
}

export function renderWithProviders(
  ui: ReactElement,
  {
    route = '/',
    ...renderOptions
  }: CustomRenderOptions = {}
) {
  window.history.pushState({}, 'Test page', route);

  const testQueryClient = createTestQueryClient();

  function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={testQueryClient}>
        <ToastProvider>
          <BrowserRouter>
            {children}
          </BrowserRouter>
        </ToastProvider>
      </QueryClientProvider>
    );
  }

  return render(ui, { wrapper: Wrapper, ...renderOptions });
}

export const mockUser = {
  uid: 'test-user-id',
  email: 'test@example.com',
  displayName: 'Test User',
  emailVerified: true,
};

export const mockSite = {
  id: 'site-123',
  userId: 'test-user-id',
  name: 'Test Blog',
  url: 'https://testblog.com',
  wordpressApiUrl: 'https://testblog.com/wp-json',
  wordpressUsername: 'testuser',
  wordpressAppPassword: 'test-password',
  industry: 'Technology',
  targetAudience: 'Developers',
  brandVoice: 'Professional',
  tonePreferences: ['professional'],
  contentGoals: 'Drive traffic',
  competitors: [],
  primaryKeywords: ['testing', 'development'],
  contentRestrictions: '',
  blogsPerWeek: 3,
  blogsGenerated: 0,
  status: 'connected' as const,
  createdAt: new Date(),
  updatedAt: new Date(),
};

export const mockBlog = {
  id: 'blog-123',
  siteId: 'site-123',
  userId: 'test-user-id',
  title: 'Test Blog Post',
  metaDescription: 'A test blog post',
  content: '<p>Test content</p>',
  excerpt: 'Test excerpt',
  keyword: 'testing',
  relatedKeywords: ['test', 'qa'],
  featuredImageUrl: 'https://example.com/image.jpg',
  internalLinks: [],
  externalLinks: [],
  wordCount: 1000,
  status: 'pending' as const,
  scheduledDate: new Date(),
  publishedDate: undefined,
  trackingScriptId: 'track-123',
  trackingScript: '<script>/* tracking */</script>',
  totalViews: 0,
  uniqueVisitors: 0,
  avgTimeOnPage: 0,
  avgScrollDepth: 0,
  bounceRate: 0,
  lastViewedAt: undefined,
  createdAt: new Date(),
  updatedAt: new Date(),
};
