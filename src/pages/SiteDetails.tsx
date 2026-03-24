import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { siteService } from '../services/site.service';
import { blogService } from '../services/blog.service';
import { useAuth } from '../hooks/useAuth';
import { Site } from '../types/site';
import { Blog } from '../types/blog';
import { Settings, Calendar, Plus, ExternalLink, Sparkles, CheckCircle, ArrowRight, FileText, RotateCcw, TrendingUp, BarChart3, Trash2, MessageSquare } from 'lucide-react';
import { FeedbackForm } from '../components/feedback/FeedbackForm';
import { Timestamp } from 'firebase/firestore';
import { BlogEditor } from '../components/blog/BlogEditor';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, isSameMonth, addMonths, subMonths } from 'date-fns';

export const SiteDetails: React.FC = () => {
  const { siteId } = useParams<{ siteId: string }>();
  const navigate = useNavigate();
  const { } = useAuth();
  const [site, setSite] = useState<Site | null>(null);
  const [blogs, setBlogs] = useState<Blog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeStep, setActiveStep] = useState<'keywords' | 'content-plan' | 'calendar'>('keywords');
  const [newKeyword, setNewKeyword] = useState('');
  const [generatingKeywords, setGeneratingKeywords] = useState(false);
  const [generatingContentPlan, setGeneratingContentPlan] = useState(false);
  const [keywordProgress, setKeywordProgress] = useState<{ found: number; target: number } | null>(null);
  const [editingBlog, setEditingBlog] = useState<Blog | null>(null);
  const [calendarMonth, setCalendarMonth] = useState(new Date());
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [generatingBlogContent, setGeneratingBlogContent] = useState<Set<string>>(new Set());
  const [keywordFeedback, setKeywordFeedback] = useState<{ [key: string]: boolean }>({});

  // Helper to safely convert Firestore Timestamp to Date
  const toDate = (value: Date | Timestamp | undefined): Date | undefined => {
    if (!value) return undefined;
    if (value instanceof Date) return value;
    if (value instanceof Timestamp) return value.toDate();
    return undefined;
  };

  useEffect(() => {
    loadData();
  }, [siteId]);

  useEffect(() => {
    // Determine if we should show onboarding or overview
    if (site) {
      const isComplete = site.workflowState === 'content_plan_complete';
      setShowOnboarding(!isComplete);
      
      // Auto-reset if stuck in content_planning state for more than 10 minutes
      // Check if there are no blogs with status 'planned' (meaning generation likely failed)
      if (site.workflowState === 'content_planning') {
        const plannedBlogs = blogs.filter(b => b.status === 'planned');
        if (plannedBlogs.length === 0) {
          // If we're stuck in content_planning but have no planned blogs, likely a failed generation
          // Check updatedAt timestamp - if it's been more than 10 minutes, auto-reset
          const updatedAt = site.updatedAt;
          if (updatedAt) {
            let updatedDate: Date;
            if (updatedAt instanceof Date) {
              updatedDate = updatedAt;
            } else if (updatedAt && typeof updatedAt === 'object' && 'toDate' in updatedAt) {
              updatedDate = (updatedAt as any).toDate();
            } else {
              updatedDate = new Date(updatedAt);
            }
            const minutesSinceUpdate = (Date.now() - updatedDate.getTime()) / (1000 * 60);
            if (minutesSinceUpdate > 10) {
              console.log('Auto-resetting stuck content_planning state');
              siteService.updateSite(site.id, { workflowState: 'keywords_complete' }).catch(console.error);
            }
          }
        }
      }
    }
  }, [site?.workflowState, site?.updatedAt, blogs]);

  const loadData = async () => {
    if (!siteId) return;
    
    setLoading(true);
    setError(null);
    try {
      const siteData = await siteService.getSite(siteId);
      if (!siteData) {
        setError('Site not found in database');
        return;
      }
      const blogsData = await blogService.getBlogs(siteId);
      
      // Debug: Log keyword data
      console.log('Site data loaded:', {
        primaryKeywords: siteData.primaryKeywords?.length,
        primaryKeywordsWithData: siteData.primaryKeywordsWithData?.length,
        hasData: !!siteData.primaryKeywordsWithData
      });
      
      setSite(siteData);
      setBlogs(blogsData);
    } catch (err: any) {
      console.error('Failed to load site data:', err);
      setError(err.message || 'Failed to load site');
    } finally {
      setLoading(false);
    }
  };

  const handleAddKeyword = async () => {
    if (!site || !newKeyword.trim()) return;
    
    try {
      const keywordText = newKeyword.trim();
      const updatedKeywords = [...site.primaryKeywords, keywordText];
      // When manually adding, we don't have volume data, so just add to string array
      await siteService.updateSite(site.id, { primaryKeywords: updatedKeywords });
      setSite({ ...site, primaryKeywords: updatedKeywords });
      setNewKeyword('');
    } catch (error) {
      console.error('Failed to add keyword:', error);
      alert('Failed to add keyword');
    }
  };

  const handleRemoveKeyword = async (keyword: string) => {
    if (!site) return;
    
    try {
      const updatedKeywords = site.primaryKeywords.filter(k => k !== keyword);
      const updatedKeywordsWithData = site.primaryKeywordsWithData?.filter(k => k.keyword !== keyword) || [];
      await siteService.updateSite(site.id, { 
        primaryKeywords: updatedKeywords,
        primaryKeywordsWithData: updatedKeywordsWithData
      });
      setSite({ ...site, primaryKeywords: updatedKeywords, primaryKeywordsWithData: updatedKeywordsWithData });
      await loadData(); // Reload to ensure consistency
    } catch (error) {
      console.error('Failed to remove keyword:', error);
      alert('Failed to remove keyword');
    }
  };

  const handleGenerateKeywords = async () => {
    if (!site || !siteId) return;
    
    setGeneratingKeywords(true);
    setKeywordProgress({ found: 0, target: 10 });
    
    try {
      const { keywordService } = await import('../services/keyword.service');
      
      const seed = site.primaryKeywords[0] || site.industry || 'SEO';
      const keywords = await keywordService.generateKeywordsWithVolumeCheck({
        seedKeyword: seed,
        industry: site.industry || 'General',
        country: site.country,
        postcode: site.postcode,
        minVolume: 200,
        maxDifficulty: 50,
        targetCount: 10,
      });
      
      if (keywords.length > 0) {
        const keywordStrings = keywords.map((k) => k.keyword);
        console.log('Saving keywords with data:', keywords);
        await siteService.updateSite(site.id, { 
          primaryKeywords: keywordStrings,
          primaryKeywordsWithData: keywords // Store full keyword data
        });
        setSite({ ...site, primaryKeywords: keywordStrings, primaryKeywordsWithData: keywords });
        alert(`✅ Successfully generated ${keywords.length} keywords with good search volume and low difficulty!`);
        if (showOnboarding) {
          setActiveStep('content-plan');
        }
      } else {
        alert('⚠️ Could not find enough keywords meeting the criteria. Try a different seed keyword.');
      }
    } catch (error: any) {
      console.error('Failed to generate keywords:', error);
      const errorMessage = error.message || error.code || 'Unknown error';
      alert(`❌ Failed to generate keywords: ${errorMessage}\n\nPlease check:\n1. VITE_ANTHROPIC_API_KEY is set in .env\n2. VITE_DATAFORSEO_LOGIN and VITE_DATAFORSEO_PASSWORD are set`);
    } finally {
      setGeneratingKeywords(false);
      setKeywordProgress(null);
      await loadData();
    }
  };

  const handleGenerateContentPlan = async () => {
    if (!site || !siteId) return;

    setGeneratingContentPlan(true);
    try {
      const { contentPlanService } = await import('../services/content-plan.service');

      const result = await contentPlanService.generateContentPlan(siteId, 1);

      if (result.success) {
        alert(`✅ Successfully generated ${result.blogsCreated} content plans! They're now in your calendar.`);
        await loadData();
        if (showOnboarding) {
          setActiveStep('calendar');
        }
      } else {
        throw new Error('Content plan generation failed');
      }
    } catch (error: any) {
      console.error('Failed to generate content plan:', error);
      const errorMessage = error.message || 'Unknown error';
      const isTimeout = errorMessage.includes('timeout') || errorMessage.includes('timed out');
      
      if (isTimeout) {
        alert(`⏱️ Content plan generation timed out. This can happen if:\n\n1. The API is slow or unresponsive\n2. You're generating many keywords\n\nTry generating fewer keywords or check your internet connection.`);
      } else {
        alert(`❌ Failed to generate content plan: ${errorMessage}\n\nPlease check:\n1. VITE_GEMINI_API_KEY is set in .env\n2. Your internet connection is stable`);
      }
    } finally {
      setGeneratingContentPlan(false);
    }
  };

  const handleRestartOnboarding = async () => {
    if (!site || !confirm('Restart onboarding? This will reset your workflow state but keep your keywords and blogs.')) {
      return;
    }

    try {
      await siteService.updateSite(site.id, { workflowState: 'idle' });
      setShowOnboarding(true);
      setActiveStep('keywords');
      await loadData();
    } catch (error) {
      console.error('Failed to restart onboarding:', error);
      alert('Failed to restart onboarding');
    }
  };

  const handleResetContentPlanning = async () => {
    if (!site || !siteId) return;
    
    if (!confirm('Reset content planning? This will allow you to try generating content plans again. Your existing blogs will not be affected.')) {
      return;
    }

    try {
      await siteService.updateSite(siteId, { workflowState: 'keywords_complete' });
      await loadData();
      alert('✅ Content planning state reset. You can now try generating content plans again.');
    } catch (error) {
      console.error('Failed to reset content planning:', error);
      alert('Failed to reset content planning');
    }
  };

  const handleEditBlog = async (blogId: string) => {
    const blog = await blogService.getBlog(blogId);
    if (blog) {
      setEditingBlog(blog);
    }
  };

  const handleGenerateBlogContent = async (blog: Blog) => {
    if (!site || !siteId) return;

    setGeneratingBlogContent(prev => new Set(prev).add(blog.id));

    try {
      // Get internal links from sitemap
      let internalLinks: string[] = [];
      try {
        const { httpsCallable } = await import('firebase/functions');
        const { functions } = await import('../config/firebase');
        const fetchSitemapFn = httpsCallable(functions, 'fetchSitemap');
        const sitemapResult = await fetchSitemapFn({ 
          siteUrl: site.url,
          customSitemapUrl: site.sitemapUrl 
        });
        const data = sitemapResult.data as any;
        internalLinks = data.urls || [];
      } catch (error) {
        console.warn('Failed to fetch sitemap:', error);
      }

      // Get YouTube videos
      let youtubeVideos: Array<{ url: string; title: string }> = [];
      try {
        const { keywordService } = await import('../services/keyword.service');
        youtubeVideos = await keywordService.findRelevantVideos(blog.keyword, 3);
      } catch (error) {
        console.warn('Failed to fetch YouTube videos:', error);
      }

      // Queue blog generation
      const { httpsCallable } = await import('firebase/functions');
      const { functions } = await import('../config/firebase');
      const queueBlogGenerationFn = httpsCallable(functions, 'queueBlogGeneration');

      const result = await queueBlogGenerationFn({
        keyword: blog.keyword,
        siteId,
        siteContext: site,
        internalLinks,
        youtubeLinks: youtubeVideos,
        wordCount: blog.wordCount || 3000,
        scheduledDate: toDate(blog.scheduledDate)?.toISOString(),
        userId: site.userId,
      });

      const data = result.data as any;
      const jobId = data.jobId;

      // Update blog with generationJobId so processBlogGeneration can find it
      await blogService.updateBlog(blog.id, {
        generationJobId: jobId,
      });

      alert(`✅ Blog content generation started! This may take a few minutes. The blog will update automatically when ready.`);
      await loadData();
    } catch (error: any) {
      console.error('Failed to generate blog content:', error);
      alert(`❌ Failed to generate blog content: ${error.message || 'Unknown error'}`);
    } finally {
      setGeneratingBlogContent(prev => {
        const next = new Set(prev);
        next.delete(blog.id);
        return next;
      });
    }
  };

  const handleDeleteBlog = async (blogId: string) => {
    if (!confirm('Are you sure you want to delete this blog post? This action cannot be undone.')) {
      return;
    }

    try {
      await blogService.deleteBlog(blogId);
      await loadData();
      alert('✅ Blog post deleted successfully');
    } catch (error: any) {
      console.error('Failed to delete blog:', error);
      alert(`❌ Failed to delete blog: ${error.message || 'Unknown error'}`);
    }
  };

  const handleDeleteAllBlogs = async () => {
    if (!site || !siteId) return;
    
    const blogCount = blogs.length;
    if (blogCount === 0) {
      alert('No blogs to delete');
      return;
    }

    if (!confirm(`Are you sure you want to delete ALL ${blogCount} blog posts for this site? This action cannot be undone.`)) {
      return;
    }

    // Double confirmation for safety
    const confirmation = prompt('This will permanently delete all blog posts. Type "DELETE ALL" to confirm.');
    if (confirmation !== 'DELETE ALL') {
      return;
    }

    try {
      const deletedCount = await blogService.deleteAllBlogsForSite(siteId);
      await loadData();
      alert(`✅ Successfully deleted ${deletedCount} blog post(s)`);
    } catch (error: any) {
      console.error('Failed to delete all blogs:', error);
      alert(`❌ Failed to delete all blogs: ${error.message || 'Unknown error'}`);
    }
  };

  // Calendar helpers
  const calendarStart = startOfMonth(calendarMonth);
  const calendarEnd = endOfMonth(calendarMonth);
  const calendarDays = eachDayOfInterval({ start: calendarStart, end: calendarEnd });
  const firstDayOfWeek = calendarStart.getDay();

  const getBlogsForDate = (date: Date) => {
    return blogs.filter(blog => {
      const scheduledDate = toDate(blog.scheduledDate);
      return scheduledDate && isSameDay(scheduledDate, date);
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  if (error || !site) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <h2 className="text-xl font-bold text-white mb-2">Site not found</h2>
          {error && <p className="text-red-400 mb-4">{error}</p>}
          <button onClick={() => navigate('/dashboard')} className="btn-primary">Back to Dashboard</button>
        </div>
      </div>
    );
  }

  const publishedBlogs = blogs.filter(b => b.status === 'published');
  const plannedBlogs = blogs.filter(b => b.status === 'planned');
  const pendingBlogs = blogs.filter(b => b.status === 'pending');
  const approvedBlogs = blogs.filter(b => b.status === 'approved' || b.status === 'scheduled');
  const isWorkflowComplete = site.workflowState === 'content_plan_complete';

  // ONBOARDING MODE (when workflow is not complete)
  if (showOnboarding && !isWorkflowComplete) {
    return (
      <div className="min-h-screen bg-slate-900 p-6">
        <div className="max-w-7xl mx-auto space-y-6">
          
          {/* Header */}
          <div className="bg-slate-800 rounded-xl border border-slate-700 shadow p-6">
            <div className="flex items-center justify-between">
              <div>
                <div className="flex items-center space-x-3 mb-2">
                  <h1 className="text-3xl font-bold text-white">{site.name}</h1>
                  <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold uppercase tracking-wide ${
                    site.status === 'connected' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-red-500/20 text-red-400 border border-red-500/30'
                  }`}>
                    {site.status}
                  </span>
                </div>
                <a href={site.url} target="_blank" rel="noopener noreferrer" className="text-slate-400 hover:text-blue-400 flex items-center space-x-1">
                  <span>{site.url}</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>
              <button
                onClick={() => navigate(`/sites/${site.id}/settings`)}
                className="btn-secondary flex items-center space-x-2"
              >
                <Settings className="w-4 h-4" />
                <span>Settings</span>
              </button>
            </div>
          </div>

          {/* Step Progress Indicator */}
          <div className="bg-slate-800 rounded-xl border border-slate-700 shadow p-6">
            <div className="flex items-center justify-between">
              {/* Step 1: Keywords */}
              <div 
                className="flex items-center flex-1 cursor-pointer hover:opacity-80 transition-opacity"
                onClick={() => setActiveStep('keywords')}
              >
                <div className={`flex items-center justify-center w-12 h-12 rounded-full border-2 ${
                  activeStep === 'keywords' || site.workflowState === 'keywords_complete' || site.workflowState === 'content_planning' || site.workflowState === 'content_plan_complete'
                    ? 'bg-primary-600 border-primary-600 text-white'
                    : 'bg-gray-100 border-gray-300 text-gray-400'
                }`}>
                  {site.workflowState === 'keywords_complete' || site.workflowState === 'content_planning' || site.workflowState === 'content_plan_complete' ? (
                    <CheckCircle className="w-6 h-6" />
                  ) : (
                    <span className="font-bold">1</span>
                  )}
                </div>
                <div className="ml-4">
                  <p className="font-semibold text-white">Generate Keywords</p>
                  <p className="text-sm text-slate-400">Find high-value keywords</p>
                </div>
              </div>

              <ArrowRight className="w-6 h-6 text-slate-600 mx-4" />

              {/* Step 2: Content Plan */}
              <div 
                className="flex items-center flex-1 cursor-pointer hover:opacity-80 transition-opacity"
                onClick={() => {
                  if (site.workflowState === 'keywords_complete' || site.workflowState === 'content_planning' || site.workflowState === 'content_plan_complete') {
                    setActiveStep('content-plan');
                  }
                }}
              >
                <div className={`flex items-center justify-center w-12 h-12 rounded-full border-2 ${
                  activeStep === 'content-plan' || site.workflowState === 'content_planning' || site.workflowState === 'content_plan_complete'
                    ? 'bg-blue-600 border-blue-600 text-white'
                    : site.workflowState === 'keywords_complete'
                    ? 'bg-blue-500/20 border-blue-500/30 text-blue-400'
                    : 'bg-slate-700 border-slate-600 text-slate-400'
                }`}>
                  {site.workflowState === 'content_plan_complete' ? (
                    <CheckCircle className="w-6 h-6" />
                  ) : (
                    <span className="font-bold">2</span>
                  )}
                </div>
                <div className="ml-4">
                  <p className="font-semibold text-white">Content Plan</p>
                  <p className="text-sm text-slate-400">Plan your blog posts</p>
                </div>
              </div>

              <ArrowRight className="w-6 h-6 text-gray-300 mx-4" />

              {/* Step 3: Calendar */}
              <div className="flex items-center flex-1">
                <div className={`flex items-center justify-center w-12 h-12 rounded-full border-2 ${
                  activeStep === 'calendar'
                    ? 'bg-primary-600 border-primary-600 text-white'
                    : site.workflowState === 'content_plan_complete'
                    ? 'bg-blue-500/20 border-blue-500/30 text-blue-400'
                    : 'bg-slate-700 border-slate-600 text-slate-400'
                }`}>
                  <span className="font-bold">3</span>
                </div>
                <div className="ml-4">
                  <p className="font-semibold text-white">Content Calendar</p>
                  <p className="text-sm text-slate-400">View & manage posts</p>
                </div>
              </div>
            </div>
          </div>

          {/* Step 1: Generate Keywords */}
          {activeStep === 'keywords' && (
            <div className="bg-slate-800 rounded-xl border border-slate-700 shadow p-8">
              <div className="max-w-3xl mx-auto">
                <h2 className="text-2xl font-bold text-white mb-2">Step 1: Generate Keywords</h2>
                <p className="text-slate-300 mb-6">
                  Generate 10 high-quality keywords with search volume ≥ 200 and difficulty &lt; 50. 
                  These keywords will be used to create your content plan.
                </p>

                {keywordProgress && (
                  <div className="mb-6">
                    <div className="flex items-center justify-between text-sm text-gray-700 mb-2">
                      <span>Progress</span>
                      <span className="font-semibold">{keywordProgress.found} / {keywordProgress.target} keywords found</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-3">
                      <div 
                        className="bg-primary-600 h-3 rounded-full transition-all duration-300" 
                        style={{ width: `${(keywordProgress.found / keywordProgress.target) * 100}%` }}
                      ></div>
                    </div>
                  </div>
                )}

                {site.workflowState === 'keywords_generating' && (
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
                    <p className="text-sm text-blue-800">⏳ Generating keywords... This may take a few minutes.</p>
                  </div>
                )}

                {site.workflowState === 'keywords_complete' && (
                  <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-6">
                    <p className="text-sm text-green-800">✅ Keywords generated successfully! You can proceed to Step 2.</p>
                  </div>
                )}

                <div className="flex items-center space-x-4 mb-6">
                  <input
                    type="text"
                    value={newKeyword}
                    onChange={(e) => setNewKeyword(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && handleAddKeyword()}
                    placeholder="Or add a keyword manually..."
                    className="input-field flex-1"
                  />
                  <button onClick={handleAddKeyword} className="btn-secondary flex items-center space-x-2">
                    <Plus className="w-4 h-4" />
                    <span>Add</span>
                  </button>
                </div>

                <button
                  onClick={handleGenerateKeywords}
                  disabled={generatingKeywords || site.workflowState === 'keywords_generating'}
                  className="btn-primary w-full flex items-center justify-center space-x-2 py-4 text-lg"
                >
                  {generatingKeywords || site.workflowState === 'keywords_generating' ? (
                    <>
                      <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                      <span>Generating Keywords...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-5 h-5" />
                      <span>Generate 10 Keywords</span>
                    </>
                  )}
                </button>

                {site.primaryKeywords.length > 0 && site.workflowState !== 'keywords_complete' && site.workflowState !== 'keywords_generating' && (
                  <div className="mt-6 flex justify-end">
                    <button
                      onClick={async () => {
                        if (!site || !siteId) return;
                        try {
                          await siteService.updateSite(siteId, { workflowState: 'keywords_complete' });
                          await loadData();
                          setActiveStep('content-plan');
                        } catch (error) {
                          console.error('Failed to skip to step 2:', error);
                          alert('Failed to proceed to step 2');
                        }
                      }}
                      className="btn-secondary flex items-center space-x-2"
                    >
                      <ArrowRight className="w-4 h-4" />
                      <span>Skip to Step 2</span>
                    </button>
                  </div>
                )}

                {site.primaryKeywords.length > 0 && (
                  <div className="mt-8">
                    <h3 className="text-lg font-semibold text-white mb-4">Current Keywords ({site.primaryKeywords.length})</h3>
                    {site.primaryKeywordsWithData && site.primaryKeywordsWithData.length > 0 ? (
                      <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-slate-700 border border-slate-700 rounded-lg">
                          <thead className="bg-slate-900/50">
                            <tr>
                              <th scope="col" className="px-4 py-2 text-left text-xs font-medium text-slate-400 uppercase">Keyword</th>
                              <th scope="col" className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Volume</th>
                              <th scope="col" className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Difficulty</th>
                              <th scope="col" className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Score</th>
                              <th scope="col" className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                            </tr>
                          </thead>
                          <tbody className="bg-slate-800 divide-y divide-slate-700">
                            {site.primaryKeywordsWithData
                              .sort((a, b) => b.opportunityScore - a.opportunityScore)
                              .map((kw, idx) => (
                                <tr key={idx} className="hover:bg-slate-900/50">
                                  <td className="px-4 py-2 text-sm font-medium text-white">{kw.keyword}</td>
                                  <td className="px-4 py-2 text-sm text-white">{kw.searchVolume.toLocaleString()}</td>
                                  <td className="px-4 py-2">
                                    <span className={`text-sm font-semibold ${
                                      kw.difficulty < 30 ? 'text-green-600' :
                                      kw.difficulty < 50 ? 'text-yellow-600' :
                                      'text-red-600'
                                    }`}>
                                      {kw.difficulty}
                                    </span>
                                  </td>
                                  <td className="px-4 py-2 text-sm font-bold text-primary-600">{kw.opportunityScore}</td>
                                  <td className="px-4 py-2">
                                    <div className="flex items-center space-x-2">
                                      <button
                                        onClick={() => setKeywordFeedback(prev => ({ ...prev, [kw.keyword]: !prev[kw.keyword] }))}
                                        className="text-blue-600 hover:text-blue-900 text-sm flex items-center space-x-1"
                                        title="Provide Feedback"
                                      >
                                        <MessageSquare className="w-4 h-4" />
                                        <span>Feedback</span>
                                      </button>
                                      <button
                                        onClick={() => handleRemoveKeyword(kw.keyword)}
                                        className="text-red-600 hover:text-red-900 text-sm"
                                      >
                                        Remove
                                      </button>
                                    </div>
                                    {keywordFeedback[kw.keyword] && (
                                      <div className="mt-2 pt-2 border-t border-gray-200">
                                        <FeedbackForm
                                          keyword={kw.keyword}
                                          siteId={siteId || ''}
                                          promptType="keyword"
                                          onSubmitted={() => setKeywordFeedback(prev => ({ ...prev, [kw.keyword]: false }))}
                                          onCancel={() => setKeywordFeedback(prev => ({ ...prev, [kw.keyword]: false }))}
                                        />
                                      </div>
                                    )}
                                  </td>
                                </tr>
                              ))}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        {site.primaryKeywords.map((keyword, idx) => (
                          <div key={idx} className="bg-blue-50 text-blue-700 px-3 py-1.5 rounded-full text-sm font-medium border border-blue-100 flex items-center group relative">
                            {keyword}
                            <button
                              onClick={() => setKeywordFeedback(prev => ({ ...prev, [keyword]: !prev[keyword] }))}
                              className="ml-2 text-blue-400 hover:text-blue-600 opacity-0 group-hover:opacity-100 transition-opacity"
                              title="Provide Feedback"
                            >
                              <MessageSquare className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => handleRemoveKeyword(keyword)}
                              className="ml-2 text-blue-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                              title="Remove keyword"
                            >
                              ×
                            </button>
                            {keywordFeedback[keyword] && (
                              <div className="absolute top-full left-0 mt-2 z-10 w-80 bg-slate-800 rounded-lg shadow-lg border border-slate-700 p-4">
                                <FeedbackForm
                                  keyword={keyword}
                                  siteId={siteId || ''}
                                  promptType="keyword"
                                  onSubmitted={() => setKeywordFeedback(prev => ({ ...prev, [keyword]: false }))}
                                  onCancel={() => setKeywordFeedback(prev => ({ ...prev, [keyword]: false }))}
                                />
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {site.workflowState === 'keywords_complete' && (
                  <div className="mt-6 flex justify-end">
                    <button
                      onClick={() => setActiveStep('content-plan')}
                      className="btn-primary flex items-center space-x-2"
                    >
                      <span>Continue to Step 2</span>
                      <ArrowRight className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Step 2: Generate Content Plan */}
          {activeStep === 'content-plan' && (
            <div className="bg-slate-800 rounded-xl border border-slate-700 shadow p-8">
              <div className="max-w-3xl mx-auto">
                <div className="flex items-center justify-between mb-6">
                  <div>
                    <h2 className="text-2xl font-bold text-white mb-2">Step 2: Generate Content Plan</h2>
                    <p className="text-slate-300">
                      Generate a month's worth of content plans (titles, descriptions, image prompts) for your keywords. 
                      These will be automatically converted to full blog posts 5 days before their scheduled date.
                    </p>
                  </div>
                  <button
                    onClick={() => setActiveStep('keywords')}
                    className="btn-secondary flex items-center space-x-2 whitespace-nowrap ml-4"
                  >
                    <ArrowRight className="w-4 h-4 rotate-180" />
                    <span>Back to Step 1</span>
                  </button>
                </div>

                {site.workflowState === 'content_planning' && (
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
                    <div className="flex items-center justify-between">
                      <p className="text-sm text-blue-800">⏳ Generating content plans... This may take a few minutes.</p>
                      <button
                        onClick={handleResetContentPlanning}
                        className="text-sm text-blue-600 hover:text-blue-800 underline ml-4"
                      >
                        Stuck? Reset
                      </button>
                    </div>
                  </div>
                )}

                {site.workflowState === 'content_plan_complete' && (
                  <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-6">
                    <p className="text-sm text-green-800">✅ Content plan generated successfully! View your calendar in Step 3.</p>
                  </div>
                )}

                {site.primaryKeywords.length < 10 && (
                  <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6">
                    <p className="text-sm text-yellow-800">
                      ⚠️ You need at least 10 keywords to generate a content plan. Please go back to Step 1 to generate keywords.
                    </p>
                  </div>
                )}

                <button
                  onClick={handleGenerateContentPlan}
                  disabled={generatingContentPlan || site.workflowState === 'content_planning' || site.workflowState === 'content_plan_complete' || site.primaryKeywords.length < 10}
                  className="btn-primary w-full flex items-center justify-center space-x-2 py-4 text-lg disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {generatingContentPlan || site.workflowState === 'content_planning' ? (
                    <>
                      <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                      <span>Generating Content Plan...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-5 h-5" />
                      <span>Generate Content Plan ({Math.ceil((site.blogsPerWeek || 2) * 4)} posts)</span>
                    </>
                  )}
                </button>

                {site.workflowState === 'content_plan_complete' && (
                  <div className="mt-6 flex justify-end">
                    <button
                      onClick={() => setActiveStep('calendar')}
                      className="btn-primary flex items-center space-x-2"
                    >
                      <span>Continue to Step 3</span>
                      <ArrowRight className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Step 3: Content Calendar (Onboarding) */}
          {activeStep === 'calendar' && (
            <div className="bg-slate-800 rounded-xl border border-slate-700 shadow p-8">
              <div className="mb-6">
                <h2 className="text-2xl font-bold text-white">Step 3: Content Calendar</h2>
                <p className="text-slate-300 mt-2">Your content plan is complete! View your calendar below.</p>
              </div>
              {/* Calendar will be shown in overview mode after completion */}
            </div>
          )}
        </div>
      </div>
    );
  }

  // OVERVIEW MODE (when workflow is complete)
  return (
    <div className="min-h-screen bg-slate-900 p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        
        {/* Header */}
        <div className="bg-slate-800 rounded-xl border border-slate-700 shadow p-6">
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center space-x-3 mb-2">
                <h1 className="text-3xl font-bold text-white">{site.name}</h1>
                <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold uppercase tracking-wide ${
                  site.status === 'connected' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-red-500/20 text-red-400 border border-red-500/30'
                }`}>
                  {site.status}
                </span>
              </div>
              <a href={site.url} target="_blank" rel="noopener noreferrer" className="text-gray-500 hover:text-primary-600 flex items-center space-x-1">
                <span>{site.url}</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>
            <div className="flex items-center space-x-3">
              <button
                onClick={handleRestartOnboarding}
                className="btn-secondary flex items-center space-x-2"
              >
                <RotateCcw className="w-4 h-4" />
                <span>Restart Onboarding</span>
              </button>
              <button
                onClick={() => navigate(`/sites/${site.id}/settings`)}
                className="btn-secondary flex items-center space-x-2"
              >
                <Settings className="w-4 h-4" />
                <span>Settings</span>
              </button>
            </div>
          </div>
        </div>

        {/* Stats Overview */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-slate-800 rounded-xl border border-slate-700 shadow p-6">
            <p className="text-sm text-slate-400 mb-1">Total Keywords</p>
            <p className="text-3xl font-bold text-white">{site.primaryKeywords.length}</p>
          </div>
          <div className="bg-slate-800 rounded-xl border border-slate-700 shadow p-6">
            <p className="text-sm text-slate-400 mb-1">Planned Posts</p>
            <p className="text-3xl font-bold text-white">{plannedBlogs.length}</p>
          </div>
          <div className="bg-slate-800 rounded-xl border border-slate-700 shadow p-6">
            <p className="text-sm text-slate-400 mb-1">Published</p>
            <p className="text-3xl font-bold text-white">{publishedBlogs.length}</p>
          </div>
          <div className="bg-slate-800 rounded-xl border border-slate-700 shadow p-6">
            <p className="text-sm text-slate-400 mb-1">Total Views</p>
            <p className="text-3xl font-bold text-white">{publishedBlogs.reduce((acc, b) => acc + (b.totalViews || 0), 0).toLocaleString()}</p>
          </div>
        </div>

        {/* Keywords Section */}
        <div className="bg-slate-800 rounded-xl border border-slate-700 shadow p-6">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-2xl font-bold text-white">Keywords</h2>
              <p className="text-slate-300 mt-1">Manage your targeting keywords</p>
            </div>
            <button
              onClick={handleGenerateKeywords}
              disabled={generatingKeywords || site.workflowState === 'keywords_generating'}
              className="btn-primary flex items-center space-x-2"
            >
              {generatingKeywords || site.workflowState === 'keywords_generating' ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                  <span>Generating...</span>
                </>
              ) : (
                <>
                  <TrendingUp className="w-4 h-4" />
                  <span>Regenerate Keywords</span>
                </>
              )}
            </button>
          </div>

          <div className="flex items-center space-x-4 mb-6">
            <input
              type="text"
              value={newKeyword}
              onChange={(e) => setNewKeyword(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleAddKeyword()}
              placeholder="Add a new keyword..."
              className="input-field flex-1"
            />
            <button onClick={handleAddKeyword} className="btn-secondary flex items-center space-x-2">
              <Plus className="w-4 h-4" />
              <span>Add</span>
            </button>
          </div>

          {site.primaryKeywords.length > 0 ? (
            <div className="space-y-4">
              {/* Table View */}
              {site.primaryKeywordsWithData && site.primaryKeywordsWithData.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-slate-700 border border-slate-700 rounded-lg">
                    <thead className="bg-slate-900/50">
                      <tr>
                        <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">
                          Keyword
                        </th>
                        <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Search Volume
                        </th>
                        <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Difficulty
                        </th>
                        <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Opportunity Score
                        </th>
                        <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Actions
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-slate-800 divide-y divide-slate-700">
                      {site.primaryKeywordsWithData
                        .sort((a, b) => b.opportunityScore - a.opportunityScore)
                        .map((kw, idx) => (
                          <tr key={idx} className="hover:bg-slate-900/50">
                            <td className="px-6 py-4 whitespace-nowrap">
                              <div className="text-sm font-medium text-white">{kw.keyword}</div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <div className="text-sm text-white font-semibold">
                                {kw.searchVolume.toLocaleString()}
                              </div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <div className="flex items-center">
                                <span className={`text-sm font-semibold ${
                                  kw.difficulty < 30 ? 'text-green-400' :
                                  kw.difficulty < 50 ? 'text-yellow-400' :
                                  'text-red-400'
                                }`}>
                                  {kw.difficulty}
                                </span>
                                <div className="ml-2 w-24 bg-slate-700 rounded-full h-2">
                                  <div
                                    className={`h-2 rounded-full ${
                                      kw.difficulty < 30 ? 'bg-green-500' :
                                      kw.difficulty < 50 ? 'bg-yellow-500' :
                                      'bg-red-500'
                                    }`}
                                    style={{ width: `${kw.difficulty}%` }}
                                  ></div>
                                </div>
                              </div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <div className="flex items-center">
                                <BarChart3 className="w-4 h-4 text-primary-600 mr-1" />
                                <span className="text-sm font-bold text-primary-600">
                                  {kw.opportunityScore}
                                </span>
                              </div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleRemoveKeyword(kw.keyword);
                                }}
                                className="text-red-600 hover:text-red-900 flex items-center space-x-1"
                                title="Remove keyword"
                              >
                                <Trash2 className="w-4 h-4" />
                                <span>Remove</span>
                              </button>
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                // Fallback to tag view if no detailed data
                <div className="flex flex-wrap gap-2">
                  {site.primaryKeywords.map((keyword, idx) => (
                    <span key={idx} className="bg-blue-50 text-blue-700 px-3 py-1.5 rounded-full text-sm font-medium border border-blue-100 flex items-center group">
                      {keyword}
                      <button
                        onClick={() => handleRemoveKeyword(keyword)}
                        className="ml-2 text-blue-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                        title="Remove keyword"
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <p className="text-gray-500 italic">No keywords added yet.</p>
          )}
        </div>

        {/* Content Calendar */}
        <div className="bg-slate-800 rounded-xl border border-slate-700 shadow p-8">
          <div className="mb-6 flex items-center justify-between">
            <h2 className="text-2xl font-bold text-white">Content Calendar</h2>
            <div className="flex items-center space-x-2">
              <button
                onClick={() => setCalendarMonth(subMonths(calendarMonth, 1))}
                className="p-2 hover:bg-slate-700 rounded-lg text-slate-400 hover:text-white"
              >
                <ArrowRight className="w-4 h-4 rotate-180" />
              </button>
              <span className="font-semibold text-white min-w-[200px] text-center">
                {format(calendarMonth, 'MMMM yyyy')}
              </span>
              <button
                onClick={() => setCalendarMonth(addMonths(calendarMonth, 1))}
                className="p-2 hover:bg-slate-700 rounded-lg text-slate-400 hover:text-white"
              >
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Calendar Grid */}
          <div className="grid grid-cols-7 gap-2 mb-4">
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
              <div key={day} className="text-center text-sm font-semibold text-slate-400 py-2">
                {day}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-2">
            {/* Empty cells for days before month starts */}
            {Array.from({ length: firstDayOfWeek }).map((_, i) => (
              <div key={`empty-${i}`} className="aspect-square"></div>
            ))}

            {/* Calendar days */}
            {calendarDays.map(day => {
              const dayBlogs = getBlogsForDate(day);
              const isToday = isSameDay(day, new Date());
              
              return (
                <div
                  key={day.toISOString()}
                  className={`aspect-square border rounded-lg p-2 ${
                    isToday ? 'border-blue-500 bg-blue-500/20' : 'border-slate-700'
                  } ${!isSameMonth(day, calendarMonth) ? 'opacity-30' : ''}`}
                >
                  <div className={`text-sm font-semibold mb-1 ${isToday ? 'text-blue-400' : 'text-white'}`}>
                    {format(day, 'd')}
                  </div>
                  <div className="space-y-1 overflow-y-auto max-h-[calc(100%-24px)]">
                    {dayBlogs.slice(0, 3).map(blog => (
                      <div
                        key={blog.id}
                        onClick={() => handleEditBlog(blog.id)}
                        className={`text-xs p-1 rounded cursor-pointer truncate ${
                          blog.status === 'published' ? 'bg-purple-500/20 text-purple-400 border border-purple-500/30' :
                          blog.status === 'approved' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' :
                          blog.status === 'planned' ? 'bg-slate-700 text-slate-300 border border-slate-600' :
                          'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30'
                        }`}
                        title={blog.title}
                      >
                        {blog.title || blog.keyword}
                      </div>
                    ))}
                    {dayBlogs.length > 3 && (
                      <div className="text-xs text-slate-400">+{dayBlogs.length - 3} more</div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Legend */}
          <div className="mt-6 flex items-center space-x-6 text-sm text-slate-300">
            <div className="flex items-center space-x-2">
              <div className="w-4 h-4 bg-slate-700 rounded border border-slate-600"></div>
              <span>Planned</span>
            </div>
            <div className="flex items-center space-x-2">
              <div className="w-4 h-4 bg-yellow-500/20 rounded border border-yellow-500/30"></div>
              <span>Pending</span>
            </div>
            <div className="flex items-center space-x-2">
              <div className="w-4 h-4 bg-emerald-500/20 rounded border border-emerald-500/30"></div>
              <span>Approved</span>
            </div>
            <div className="flex items-center space-x-2">
              <div className="w-4 h-4 bg-purple-500/20 rounded border border-purple-500/30"></div>
              <span>Published</span>
            </div>
          </div>

          {/* Blog List */}
          <div className="mt-8">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-white">All Blog Posts</h3>
              <div className="flex items-center space-x-3">
                {blogs.length > 0 && (
                  <button
                    onClick={handleDeleteAllBlogs}
                    className="btn-secondary flex items-center space-x-2 text-red-600 hover:bg-red-50 border-red-200"
                  >
                    <Trash2 className="w-4 h-4" />
                    <span>Delete All</span>
                  </button>
                )}
                <button
                  onClick={handleGenerateContentPlan}
                  disabled={generatingContentPlan || site.workflowState === 'content_planning' || site.primaryKeywords.length < 10}
                  className="btn-secondary flex items-center space-x-2"
                >
                  <Sparkles className="w-4 h-4" />
                  <span>Generate More Blog Topics</span>
                </button>
              </div>
            </div>
            <div className="space-y-3">
              {[...plannedBlogs, ...pendingBlogs, ...approvedBlogs, ...publishedBlogs]
                .sort((a, b) => {
                  const dateA = toDate(a.scheduledDate);
                  const dateB = toDate(b.scheduledDate);
                  return (dateA?.getTime() || 0) - (dateB?.getTime() || 0);
                })
                .map(blog => (
                  <div
                    key={blog.id}
                    className="border border-slate-700 rounded-lg p-4 hover:bg-slate-900/50 transition-colors bg-slate-800"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1 cursor-pointer" onClick={() => handleEditBlog(blog.id)}>
                        <div className="flex items-center space-x-2 mb-2">
                          <span className={`px-2 py-1 rounded-full text-xs font-semibold uppercase ${
                            blog.status === 'published' ? 'bg-purple-500/20 text-purple-400 border border-purple-500/30' :
                            blog.status === 'approved' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' :
                            blog.status === 'planned' ? 'bg-slate-700 text-slate-300 border border-slate-600' :
                            'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30'
                          }`}>
                            {blog.status}
                          </span>
                          {blog.isPillarPost && (
                            <span className="px-2 py-1 bg-purple-500/20 text-purple-400 border border-purple-500/30 text-xs rounded-full">Pillar</span>
                          )}
                          {blog.manuallyEdited && (
                            <span className="px-2 py-1 bg-orange-500/20 text-orange-400 border border-orange-500/30 text-xs rounded-full">Edited</span>
                          )}
                        </div>
                        <h4 className="font-semibold text-white mb-1">{blog.title || `Planned: ${blog.keyword}`}</h4>
                        <p className="text-sm text-slate-300 mb-2">{blog.keyword}</p>
                        <div className="flex items-center space-x-4 text-xs text-slate-400">
                          <span>{toDate(blog.scheduledDate)?.toLocaleDateString()}</span>
                          {blog.wordCount > 0 && <span>{blog.wordCount} words</span>}
                          {blog.status === 'published' && blog.totalViews > 0 && (
                            <span>{blog.totalViews} views</span>
                          )}
                          {blog.status === 'pending' && !blog.content && (
                            <span className="text-orange-600 font-medium">No content yet</span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center space-x-2 ml-4">
                        {blog.status === 'pending' && (!blog.content || blog.content.trim().length === 0) && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleGenerateBlogContent(blog);
                            }}
                            disabled={generatingBlogContent.has(blog.id)}
                            className="btn-primary flex items-center space-x-2 text-sm py-2 px-3"
                          >
                            {generatingBlogContent.has(blog.id) ? (
                              <>
                                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                                <span>Generating...</span>
                              </>
                            ) : (
                              <>
                                <Sparkles className="w-4 h-4" />
                                <span>Generate Content</span>
                              </>
                            )}
                          </button>
                        )}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleEditBlog(blog.id);
                          }}
                          className="p-2 text-gray-400 hover:text-primary-600 rounded-lg transition-colors"
                          title="Edit blog post"
                        >
                          <FileText className="w-5 h-5" />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteBlog(blog.id);
                          }}
                          className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                          title="Delete blog post"
                        >
                          <Trash2 className="w-5 h-5" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              {blogs.length === 0 && (
                <div className="text-center py-8 text-gray-500">
                  <Calendar className="w-12 h-12 mx-auto mb-2 text-gray-300" />
                  <p>No blog posts yet. Generate a content plan to get started.</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Blog Editor Modal */}
        {editingBlog && (
          <BlogEditor
            blog={editingBlog}
            onClose={() => setEditingBlog(null)}
            onSave={() => {
              loadData();
              setEditingBlog(null);
            }}
            onDelete={async () => {
              await handleDeleteBlog(editingBlog.id);
              setEditingBlog(null);
            }}
            onGenerateContent={async () => {
              if (editingBlog) {
                await handleGenerateBlogContent(editingBlog);
                // Reload the blog to get updated content
                const updatedBlog = await blogService.getBlog(editingBlog.id);
                if (updatedBlog) {
                  setEditingBlog(updatedBlog);
                }
              }
            }}
          />
        )}
      </div>
    </div>
  );
};
