import React, { useState, useEffect } from 'react';
import {
  collection,
  query,
  onSnapshot,
  orderBy,
  Timestamp,
  deleteDoc,
  doc,
  updateDoc,
} from 'firebase/firestore';
import { db } from '../../config/firebase';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../../config/firebase';
import { useToast } from '../Toast';
import { ExternalLink, RotateCw, Loader2, Calendar as CalendarIcon, Eye, Sparkles, Trash2, Edit2, Undo2, Rocket } from 'lucide-react';
import { format } from 'date-fns';
import { PostPreviewModal } from './PostPreviewModal';

interface ContentCalendarEntry {
  id: string;
  blogTopic: string;
  keyword: string;
  status: string;
  scheduledDate: Date | null;
  wordpressPostUrl?: string;
  errorMessage?: string;
  generatedContent?: string;
  featuredImageUrl?: string;
  blogDescription?: string;
}

interface SiteCalendarListProps {
  siteId: string;
  overrideAgencyId?: string; // Optional: for admin impersonation mode (not currently used but available for future)
}

export const SiteCalendarList: React.FC<SiteCalendarListProps> = ({ siteId }) => {
  const [calendarEntries, setCalendarEntries] = useState<ContentCalendarEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [retryingIds, setRetryingIds] = useState<Set<string>>(new Set());
  const [previewPost, setPreviewPost] = useState<ContentCalendarEntry | null>(null);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [approvingIds, setApprovingIds] = useState<Set<string>>(new Set());
  const [generatingIds, setGeneratingIds] = useState<Set<string>>(new Set());
  const [deletingIds, setDeletingIds] = useState<Set<string>>(new Set());
  const [revertingIds, setRevertingIds] = useState<Set<string>>(new Set());
  const [postingIds, setPostingIds] = useState<Set<string>>(new Set());
  const [regeneratingImageId, setRegeneratingImageId] = useState<string | null>(null);
  const [editingEntry, setEditingEntry] = useState<ContentCalendarEntry | null>(null);
  const [editTopic, setEditTopic] = useState('');
  const [editDate, setEditDate] = useState('');
  const [generatingContentIds, setGeneratingContentIds] = useState<Set<string>>(new Set());
  const [checkingPosts, setCheckingPosts] = useState(false);
  const { showToast } = useToast();

  // Subscribe to contentCalendar collection
  useEffect(() => {
    if (!siteId) return;

    const calendarRef = collection(db, 'sites', siteId, 'contentCalendar');
    const q = query(calendarRef, orderBy('scheduledDate', 'desc'));

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const entries: ContentCalendarEntry[] = snapshot.docs.map((doc) => {
          const data = doc.data();
          return {
            id: doc.id,
            blogTopic: data.blogTopic || '',
            keyword: data.keyword || '',
            status: data.status || 'draft',
            scheduledDate: data.scheduledDate
              ? (data.scheduledDate as Timestamp).toDate()
              : null,
            wordpressPostUrl: data.wordpressPostUrl,
            errorMessage: data.errorMessage,
            generatedContent: data.generatedContent,
            featuredImageUrl: data.featuredImageUrl,
            blogDescription: data.blogDescription,
          };
        });

        setCalendarEntries(entries);
        setLoading(false);
      },
      (err) => {
        console.error('Error fetching calendar entries:', err);
        showToast('error', 'Failed to load calendar entries');
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [siteId, showToast]);

  // Function to ensure 12 unpublished posts
  const ensure12UnpublishedPosts = async () => {
    if (!siteId || checkingPosts) return;

    setCheckingPosts(true);
    try {
      const ensurePosts = httpsCallable(functions, 'ensure12UnpublishedPostsCallable');
      const result = await ensurePosts({ siteId });
      const data = result.data as { success: boolean; created?: number; currentCount?: number };
      
      if (data.success && data.created && data.created > 0) {
        showToast('success', `Created ${data.created} new posts to maintain 12 unpublished posts`);
      }
    } catch (error: any) {
      console.error('[SiteCalendarList] Error ensuring 12 unpublished posts:', error);
      // Don't show error toast - this is a background process
    } finally {
      setCheckingPosts(false);
    }
  };

  // Check and ensure 12 unpublished posts on mount and when entries change
  useEffect(() => {
    if (!siteId || loading || calendarEntries.length === 0 || checkingPosts) return;

    const unpublishedCount = calendarEntries.filter(e => e.status !== 'published').length;
    if (unpublishedCount < 12) {
      console.log(`[SiteCalendarList] Only ${unpublishedCount} unpublished posts, ensuring 12...`);
      // Debounce: wait 2 seconds after entries load before checking
      const timer = setTimeout(() => {
        ensure12UnpublishedPosts();
      }, 2000);
      
      return () => clearTimeout(timer);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [siteId, calendarEntries.length, loading, checkingPosts]);

  const handleRetry = async (calendarId: string) => {
    setRetryingIds(prev => new Set(prev).add(calendarId));

    try {
      // Find the entry to check if it has generated content
      const entry = calendarEntries.find(e => e.id === calendarId);
      
      // Determine mode: if no content exists, retry draft generation; otherwise retry publishing
      const mode = (entry && !entry.generatedContent) ? 'draft' : 'publish';
      
      const processCalendarEntry = httpsCallable(functions, 'processCalendarEntryCallable');
      const result = await processCalendarEntry({
        siteId,
        calendarId,
        mode,
      });

      const data = result.data as { success: boolean; postId?: number; postUrl?: string; error?: string };

      if (data.success) {
        if (mode === 'draft') {
          showToast('success', '✅ Content generation retried! Status updated to pending approval.');
        } else {
          showToast('success', `✅ Published successfully! Post ID: ${data.postId}`);
        }
      } else {
        showToast('error', `❌ Failed: ${data.error || 'Unknown error'}`);
      }
    } catch (error: any) {
      console.error('Error processing calendar entry:', error);
      showToast('error', `Failed to process: ${error.message || 'Unknown error'}`);
    } finally {
      setRetryingIds(prev => {
        const newSet = new Set(prev);
        newSet.delete(calendarId);
        return newSet;
      });
    }
  };

  const handlePreview = (entry: ContentCalendarEntry) => {
    setPreviewPost(entry);
    setIsPreviewOpen(true);
  };

  const handleApprove = async () => {
    if (!previewPost) return;

    setApprovingIds(prev => new Set(prev).add(previewPost.id));

    try {
      const approvePostFn = httpsCallable(functions, 'approvePostCallable');
      const result = await approvePostFn({
        siteId,
        calendarId: previewPost.id,
      });

      const data = result.data as { success: boolean; action: string; postId?: number; postUrl?: string };

      if (data.success) {
        if (data.action === 'published_immediately') {
          showToast('success', `✅ Post published immediately! ${data.postUrl ? `View: ${data.postUrl}` : ''}`);
        } else {
          showToast('success', '✅ Post approved and scheduled for publishing');
        }
        setIsPreviewOpen(false);
        setPreviewPost(null);
      } else {
        showToast('error', 'Failed to approve post');
      }
    } catch (error: any) {
      console.error('Error approving post:', error);
      showToast('error', error.message || 'Failed to approve post');
    } finally {
      setApprovingIds(prev => {
        const newSet = new Set(prev);
        newSet.delete(previewPost.id);
        return newSet;
      });
    }
  };

  const handleRegenerate = async () => {
    if (!previewPost) return;

    setRegeneratingImageId(previewPost.id);

    try {
      const regenerateImage = httpsCallable(functions, 'regenerateBlogImageCallable');
      const result = await regenerateImage({
        siteId,
        calendarId: previewPost.id,
      });

      if (result.data && (result.data as any).success) {
        showToast('success', 'Image regenerated successfully');
        // The Firestore listener will automatically update the UI with the new image URL
      } else {
        throw new Error('Regeneration failed');
      }
    } catch (error: any) {
      console.error('Error regenerating image:', error);
      showToast('error', `Failed to regenerate image: ${error.message || 'Unknown error'}`);
    } finally {
      setRegeneratingImageId(null);
    }
  };

  const handleManualGenerate = async (calendarId: string) => {
    setGeneratingIds(prev => new Set(prev).add(calendarId));

    try {
      const processCalendarEntry = httpsCallable(functions, 'processCalendarEntryCallable');
      const result = await processCalendarEntry({
        siteId,
        calendarId,
        mode: 'draft',
      });

      const data = result.data as { success: boolean; error?: string };

      if (data.success) {
        showToast('success', '✅ Content generated! Status updated to pending approval.');
      } else {
        showToast('error', `❌ Failed: ${data.error || 'Unknown error'}`);
      }
    } catch (error: any) {
      console.error('Error generating draft:', error);
      showToast('error', `Failed to generate: ${error.message || 'Unknown error'}`);
    } finally {
      setGeneratingIds(prev => {
        const newSet = new Set(prev);
        newSet.delete(calendarId);
        return newSet;
      });
    }
  };

  const handleDelete = async (calendarId: string, _blogTopic: string) => {
    if (!window.confirm(`Are you sure you want to delete this post?`)) {
      return;
    }

    setDeletingIds(prev => new Set(prev).add(calendarId));

    try {
      const calendarRef = doc(db, 'sites', siteId, 'contentCalendar', calendarId);
      await deleteDoc(calendarRef);
      showToast('success', 'Post deleted successfully');
    } catch (error: any) {
      console.error('Error deleting calendar entry:', error);
      showToast('error', `Failed to delete: ${error.message || 'Unknown error'}`);
    } finally {
      setDeletingIds(prev => {
        const newSet = new Set(prev);
        newSet.delete(calendarId);
        return newSet;
      });
    }
  };

  const handleEdit = (entry: ContentCalendarEntry) => {
    setEditingEntry(entry);
    setEditTopic(entry.blogTopic);
    setEditDate(entry.scheduledDate ? format(entry.scheduledDate, 'yyyy-MM-dd\'T\'HH:mm') : '');
  };

  const handleSaveEdit = async () => {
    if (!editingEntry) return;

    try {
      const calendarRef = doc(db, 'sites', siteId, 'contentCalendar', editingEntry.id);
      const updates: any = {
        blogTopic: editTopic,
        updatedAt: Timestamp.now(),
      };

      if (editDate) {
        updates.scheduledDate = Timestamp.fromDate(new Date(editDate));
      }

      await updateDoc(calendarRef, updates);
      showToast('success', 'Post updated successfully');
      setEditingEntry(null);
      setEditTopic('');
      setEditDate('');
    } catch (error: any) {
      console.error('Error updating calendar entry:', error);
      showToast('error', `Failed to update: ${error.message || 'Unknown error'}`);
    }
  };

  const handleRevertToDraft = async (calendarId: string) => {
    setRevertingIds(prev => new Set(prev).add(calendarId));

    try {
      const calendarRef = doc(db, 'sites', siteId, 'contentCalendar', calendarId);
      await updateDoc(calendarRef, {
        status: 'scheduled',
        updatedAt: Timestamp.now(),
      });
      showToast('success', 'Post reverted to scheduled status');
    } catch (error: any) {
      console.error('Error reverting to draft:', error);
      showToast('error', `Failed to revert: ${error.message || 'Unknown error'}`);
    } finally {
      setRevertingIds(prev => {
        const newSet = new Set(prev);
        newSet.delete(calendarId);
        return newSet;
      });
    }
  };

  const handlePostNow = async (calendarId: string) => {
    if (!window.confirm('Are you sure you want to publish this immediately? It will go live on WordPress.')) {
      return;
    }

    setPostingIds(prev => new Set(prev).add(calendarId));

    try {
      const processCalendarEntry = httpsCallable(functions, 'processCalendarEntryCallable');
      const result = await processCalendarEntry({
        siteId,
        calendarId,
        mode: 'publish',
      });

      const data = result.data as { success: boolean; postId?: number; postUrl?: string; error?: string };

      if (data.success) {
        showToast('success', `✅ Published successfully! ${data.postUrl ? `View: ${data.postUrl}` : ''}`);
      } else {
        showToast('error', `❌ Failed to publish: ${data.error || 'Unknown error'}`);
      }
    } catch (error: any) {
      console.error('Error publishing post:', error);
      showToast('error', `Failed to publish: ${error.message || 'Unknown error'}`);
    } finally {
      setPostingIds(prev => {
        const newSet = new Set(prev);
        newSet.delete(calendarId);
        return newSet;
      });
    }
  };

  const handleForceGenerateContent = async (calendarId: string) => {
    setGeneratingContentIds(prev => new Set(prev).add(calendarId));

    try {
      const forceGenerateContent = httpsCallable(functions, 'forceGenerateContentCallable');
      const result = await forceGenerateContent({
        postId: calendarId,
      });

      const data = result.data as { success: boolean; status?: string; message?: string };

      if (data.success) {
        showToast('success', `✅ Content generated! Status: ${data.status || 'pending_approval'}`);
      } else {
        showToast('error', 'Failed to generate content');
      }
    } catch (error: any) {
      console.error('Error generating content:', error);
      showToast('error', `Failed to generate content: ${error.message || 'Unknown error'}`);
    } finally {
      setGeneratingContentIds(prev => {
        const newSet = new Set(prev);
        newSet.delete(calendarId);
        return newSet;
      });
    }
  };

  const getStatusBadge = (status: string) => {
    const baseClasses = 'px-2.5 py-1 rounded-full text-xs font-medium';
    
    switch (status) {
      case 'published':
        return (
          <span className={`${baseClasses} bg-emerald-500/20 text-emerald-400 border border-emerald-500/30`}>
            Published
          </span>
        );
      case 'pending_approval':
        return (
          <span className={`${baseClasses} bg-amber-500/20 text-amber-400 border border-amber-500/30`}>
            Pending Approval
          </span>
        );
      case 'approved':
        return (
          <span className={`${baseClasses} bg-green-500/20 text-green-400 border border-green-500/30`}>
            Approved
          </span>
        );
      case 'processing':
        return (
          <span className={`${baseClasses} bg-yellow-500/20 text-yellow-400 border border-yellow-500/30 animate-pulse`}>
            Processing
          </span>
        );
      case 'scheduled':
        return (
          <span className={`${baseClasses} bg-blue-500/20 text-blue-400 border border-blue-500/30`}>
            Scheduled
          </span>
        );
      case 'error':
        return (
          <span className={`${baseClasses} bg-red-500/20 text-red-400 border border-red-500/30`}>
            Error
          </span>
        );
      case 'planned':
        return (
          <span className={`${baseClasses} bg-slate-500/20 text-slate-400 border border-slate-500/30`}>
            📅 Planned
          </span>
        );
      case 'draft':
      default:
        return (
          <span className={`${baseClasses} bg-slate-500/20 text-slate-400 border border-slate-500/30`}>
            Draft
          </span>
        );
    }
  };

  const formatScheduleDate = (date: Date | null): string => {
    if (!date) return '—';
    return format(date, 'MMM d, h:mm a');
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-blue-400" />
      </div>
    );
  }

  if (calendarEntries.length === 0) {
    return (
      <div className="text-center py-12 bg-slate-800 border border-slate-700 rounded-lg">
        <CalendarIcon className="w-12 h-12 text-slate-600 mx-auto mb-4" />
        <p className="text-slate-400 text-lg mb-2">No content scheduled</p>
        <p className="text-slate-500 text-sm">Generate Keywords to start.</p>
      </div>
    );
  }

  return (
    <div className="bg-slate-800 border border-slate-700 rounded-lg overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-slate-900/50 border-b border-slate-700">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">
                Status
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">
                Topic
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">
                Keyword
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">
                Schedule
              </th>
              <th className="px-6 py-3 text-right text-xs font-medium text-slate-400 uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-700">
            {calendarEntries.map((entry, index) => (
              <tr
                key={entry.id}
                data-tour={index === 0 ? "first-post" : undefined}
                className={`hover:bg-slate-900/50 transition-colors ${
                  entry.status === 'planned' 
                    ? 'bg-slate-800/30 border-l-2 border-dashed border-slate-600' 
                    : ''
                }`}
              >
                <td className="px-6 py-4 whitespace-nowrap">
                  {getStatusBadge(entry.status)}
                </td>
                <td className="px-6 py-4">
                  <p className="text-sm font-semibold text-white">
                    {entry.blogTopic || 'Untitled'}
                  </p>
                </td>
                <td className="px-6 py-4">
                  <p className="text-xs text-slate-400">
                    {entry.keyword || '—'}
                  </p>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <p className="text-sm text-slate-300">
                    {formatScheduleDate(entry.scheduledDate)}
                  </p>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-right">
                  <div className="flex items-center justify-end gap-2">
                    {/* Published Status */}
                    {entry.status === 'published' && (
                      <>
                        {entry.wordpressPostUrl && (
                          <a
                            href={entry.wordpressPostUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-2 text-blue-400 hover:text-blue-300 hover:bg-slate-700 rounded-lg transition-colors"
                            title="View Post"
                          >
                            <ExternalLink className="w-4 h-4" />
                          </a>
                        )}
                        <button
                          onClick={() => handleDelete(entry.id, entry.blogTopic)}
                          disabled={deletingIds.has(entry.id)}
                          className="p-2 text-red-400 hover:text-red-300 hover:bg-slate-700 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                          title="Delete"
                        >
                          {deletingIds.has(entry.id) ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <Trash2 className="w-4 h-4" />
                          )}
                        </button>
                      </>
                    )}

                    {/* Scheduled Status */}
                    {entry.status === 'scheduled' && (
                      <>
                        {!entry.generatedContent && (
                          <button
                            onClick={() => handleManualGenerate(entry.id)}
                            disabled={generatingIds.has(entry.id)}
                            className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-700 disabled:text-slate-400 disabled:cursor-not-allowed text-white text-xs font-medium rounded-lg transition-colors flex items-center gap-1.5"
                            title="Generate content now for approval"
                          >
                            {generatingIds.has(entry.id) ? (
                              <>
                                <Loader2 className="w-3 h-3 animate-spin" />
                                <span>Generating...</span>
                              </>
                            ) : (
                              <>
                                <Sparkles className="w-3 h-3" />
                                <span>Generate Draft</span>
                              </>
                            )}
                          </button>
                        )}
                        <button
                          onClick={() => handlePostNow(entry.id)}
                          disabled={postingIds.has(entry.id)}
                          className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-700 disabled:text-slate-400 disabled:cursor-not-allowed text-white text-xs font-medium rounded-lg transition-colors flex items-center gap-1.5"
                          title="Publish to WordPress Immediately"
                        >
                          {postingIds.has(entry.id) ? (
                            <>
                              <Loader2 className="w-3 h-3 animate-spin" />
                              <span>Publishing...</span>
                            </>
                          ) : (
                            <>
                              <Rocket className="w-3 h-3" />
                              <span>Post Now</span>
                            </>
                          )}
                        </button>
                        <button
                          onClick={() => handleEdit(entry)}
                          className="p-2 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg transition-colors"
                          title="Edit"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(entry.id, entry.blogTopic)}
                          disabled={deletingIds.has(entry.id)}
                          className="p-2 text-red-400 hover:text-red-300 hover:bg-slate-700 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                          title="Delete"
                        >
                          {deletingIds.has(entry.id) ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <Trash2 className="w-4 h-4" />
                          )}
                        </button>
                      </>
                    )}

                    {/* Pending Approval Status */}
                    {entry.status === 'pending_approval' && (
                      <>
                        <button
                          onClick={() => handlePreview(entry)}
                          className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white text-xs font-medium rounded-lg transition-colors flex items-center gap-1.5"
                          title="Preview & Approve"
                        >
                          <Eye className="w-3 h-3" />
                          <span>Preview</span>
                        </button>
                        <button
                          onClick={() => handlePostNow(entry.id)}
                          disabled={postingIds.has(entry.id)}
                          className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-700 disabled:text-slate-400 disabled:cursor-not-allowed text-white text-xs font-medium rounded-lg transition-colors flex items-center gap-1.5"
                          title="Publish to WordPress Immediately"
                        >
                          {postingIds.has(entry.id) ? (
                            <>
                              <Loader2 className="w-3 h-3 animate-spin" />
                              <span>Publishing...</span>
                            </>
                          ) : (
                            <>
                              <Rocket className="w-3 h-3" />
                              <span>Post Now</span>
                            </>
                          )}
                        </button>
                        <button
                          onClick={() => handleDelete(entry.id, entry.blogTopic)}
                          disabled={deletingIds.has(entry.id)}
                          className="p-2 text-red-400 hover:text-red-300 hover:bg-slate-700 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                          title="Delete"
                        >
                          {deletingIds.has(entry.id) ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <Trash2 className="w-4 h-4" />
                          )}
                        </button>
                      </>
                    )}

                    {/* Approved Status */}
                    {entry.status === 'approved' && (
                      <>
                        {entry.generatedContent && (
                          <button
                            onClick={() => handlePreview(entry)}
                            className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium rounded-lg transition-colors flex items-center gap-1.5"
                            title="View Draft"
                          >
                            <Eye className="w-3 h-3" />
                            <span>View Draft</span>
                          </button>
                        )}
                        <button
                          onClick={() => handlePostNow(entry.id)}
                          disabled={postingIds.has(entry.id)}
                          className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-700 disabled:text-slate-400 disabled:cursor-not-allowed text-white text-xs font-medium rounded-lg transition-colors flex items-center gap-1.5"
                          title="Publish to WordPress Immediately"
                        >
                          {postingIds.has(entry.id) ? (
                            <>
                              <Loader2 className="w-3 h-3 animate-spin" />
                              <span>Publishing...</span>
                            </>
                          ) : (
                            <>
                              <Rocket className="w-3 h-3" />
                              <span>Post Now</span>
                            </>
                          )}
                        </button>
                        <button
                          onClick={() => handleRevertToDraft(entry.id)}
                          disabled={revertingIds.has(entry.id)}
                          className="px-3 py-1.5 bg-slate-600 hover:bg-slate-700 disabled:bg-slate-700 disabled:text-slate-400 disabled:cursor-not-allowed text-white text-xs font-medium rounded-lg transition-colors flex items-center gap-1.5"
                          title="Revert to Draft"
                        >
                          {revertingIds.has(entry.id) ? (
                            <>
                              <Loader2 className="w-3 h-3 animate-spin" />
                              <span>Reverting...</span>
                            </>
                          ) : (
                            <>
                              <Undo2 className="w-3 h-3" />
                              <span>Revert</span>
                            </>
                          )}
                        </button>
                      </>
                    )}

                    {/* Planned Status */}
                    {entry.status === 'planned' && (
                      <>
                        <button
                          onClick={() => handleForceGenerateContent(entry.id)}
                          disabled={generatingContentIds.has(entry.id)}
                          className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-700 disabled:text-slate-400 disabled:cursor-not-allowed text-white text-xs font-medium rounded-lg transition-colors flex items-center gap-1.5"
                          title="Generate content now"
                        >
                          {generatingContentIds.has(entry.id) ? (
                            <>
                              <Loader2 className="w-3 h-3 animate-spin" />
                              <span>Generating...</span>
                            </>
                          ) : (
                            <>
                              <Sparkles className="w-3 h-3" />
                              <span>Generate Now</span>
                            </>
                          )}
                        </button>
                        <button
                          onClick={() => handleEdit(entry)}
                          className="p-2 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg transition-colors"
                          title="Edit"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(entry.id, entry.blogTopic)}
                          disabled={deletingIds.has(entry.id)}
                          className="p-2 text-red-400 hover:text-red-300 hover:bg-slate-700 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                          title="Delete"
                        >
                          {deletingIds.has(entry.id) ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <Trash2 className="w-4 h-4" />
                          )}
                        </button>
                      </>
                    )}

                    {/* Error Status */}
                    {entry.status === 'error' && (
                      <>
                        <button
                          onClick={() => handleRetry(entry.id)}
                          disabled={retryingIds.has(entry.id)}
                          className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-700 disabled:text-slate-400 disabled:cursor-not-allowed text-white text-xs font-medium rounded-lg transition-colors flex items-center gap-1.5"
                          title={entry.errorMessage || 'Retry processing'}
                        >
                          {retryingIds.has(entry.id) ? (
                            <>
                              <Loader2 className="w-3 h-3 animate-spin" />
                              <span>Retrying...</span>
                            </>
                          ) : (
                            <>
                              <RotateCw className="w-3 h-3" />
                              <span>Retry</span>
                            </>
                          )}
                        </button>
                        <button
                          onClick={() => handleDelete(entry.id, entry.blogTopic)}
                          disabled={deletingIds.has(entry.id)}
                          className="p-2 text-red-400 hover:text-red-300 hover:bg-slate-700 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                          title="Delete"
                        >
                          {deletingIds.has(entry.id) ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <Trash2 className="w-4 h-4" />
                          )}
                        </button>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Post Preview Modal */}
      <PostPreviewModal
        isOpen={isPreviewOpen}
        onClose={() => {
          setIsPreviewOpen(false);
          setPreviewPost(null);
        }}
        post={previewPost}
        onApprove={handleApprove}
        onRegenerate={handleRegenerate}
        isApproving={previewPost ? approvingIds.has(previewPost.id) : false}
        isRegenerating={previewPost ? regeneratingImageId === previewPost.id : false}
      />

      {/* Edit Modal */}
      {editingEntry && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
          <div className="w-full max-w-md bg-slate-900 border border-slate-700 rounded-xl shadow-2xl p-6">
            <h3 className="text-xl font-bold text-white mb-4">Edit Post</h3>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Blog Topic
                </label>
                <input
                  type="text"
                  value={editTopic}
                  onChange={(e) => setEditTopic(e.target.value)}
                  className="w-full px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Scheduled Date
                </label>
                <input
                  type="datetime-local"
                  value={editDate}
                  onChange={(e) => setEditDate(e.target.value)}
                  className="w-full px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => {
                  setEditingEntry(null);
                  setEditTopic('');
                  setEditDate('');
                }}
                className="flex-1 px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white font-medium rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveEdit}
                className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
