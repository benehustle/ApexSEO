import React, { useState } from 'react';
import { Blog } from '../../types/blog';
import { blogService } from '../../services/blog.service';
import { Save, X, AlertCircle, Trash2, Sparkles } from 'lucide-react';
import { FeedbackForm } from '../feedback/FeedbackForm';

interface BlogEditorProps {
  blog: Blog;
  onClose: () => void;
  onSave: () => void;
  onDelete?: () => void;
  onGenerateContent?: () => Promise<void>;
}

export const BlogEditor: React.FC<BlogEditorProps> = ({ blog, onClose, onSave, onDelete, onGenerateContent }) => {
  const [editedBlog, setEditedBlog] = useState<Partial<Blog>>({
    title: blog.title,
    metaDescription: blog.metaDescription,
    content: blog.content,
    imagePrompt: blog.imagePrompt,
  });
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showFeedback, setShowFeedback] = useState(false);

  const handleSave = async () => {
    if (!editedBlog.title || editedBlog.title.trim().length === 0) {
      setError('Title is required');
      return;
    }

    setSaving(true);
    setError(null);

    try {
      await blogService.updateBlog(blog.id, {
        ...editedBlog,
        manuallyEdited: true, // Mark as manually edited to prevent auto-publish
      } as Partial<Blog>);
      onSave();
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to save blog');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm('Are you sure you want to delete this blog post? This action cannot be undone.')) {
      return;
    }

    setDeleting(true);
    setError(null);

    try {
      await blogService.deleteBlog(blog.id);
      if (onDelete) {
        onDelete();
      }
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to delete blog');
    } finally {
      setDeleting(false);
    }
  };

  const handleGenerateContent = async () => {
    if (!onGenerateContent) return;

    setGenerating(true);
    setError(null);

    try {
      await onGenerateContent();
      // Reload the blog data after generation
      const updatedBlog = await blogService.getBlog(blog.id);
      if (updatedBlog) {
        setEditedBlog({
          title: updatedBlog.title,
          metaDescription: updatedBlog.metaDescription,
          content: updatedBlog.content,
          imagePrompt: updatedBlog.imagePrompt,
        });
      }
    } catch (err: any) {
      setError(err.message || 'Failed to generate content');
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-slate-800 rounded-xl shadow-2xl border border-slate-700 max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-700 flex items-center justify-between">
          <h2 className="text-2xl font-bold text-white">Edit Blog Post</h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-slate-700 rounded-lg transition-colors text-slate-400 hover:text-white"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start space-x-3">
              <AlertCircle className="w-5 h-5 text-red-600 mt-0.5" />
              <p className="text-red-800 text-sm">{error}</p>
            </div>
          )}

          {/* Title */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Title *
            </label>
            <input
              type="text"
              value={editedBlog.title || ''}
              onChange={(e) => setEditedBlog({ ...editedBlog, title: e.target.value })}
              className="input-field w-full"
              placeholder="Blog post title"
            />
          </div>

          {/* Meta Description */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Meta Description
              <span className="text-xs text-gray-500 ml-2">
                ({editedBlog.metaDescription?.length || 0} / 155 characters)
              </span>
            </label>
            <textarea
              value={editedBlog.metaDescription || ''}
              onChange={(e) => setEditedBlog({ ...editedBlog, metaDescription: e.target.value })}
              className="input-field w-full"
              rows={3}
              placeholder="SEO meta description (155 characters recommended)"
              maxLength={160}
            />
          </div>

          {/* Image Prompt */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Image Prompt
            </label>
            <textarea
              value={editedBlog.imagePrompt || ''}
              onChange={(e) => setEditedBlog({ ...editedBlog, imagePrompt: e.target.value })}
              className="input-field w-full"
              rows={2}
              placeholder="Description for AI image generation"
            />
          </div>

          {/* Content */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-sm font-medium text-gray-700">
                Content *
              </label>
              {onGenerateContent && (
                <button
                  onClick={handleGenerateContent}
                  disabled={generating || saving || deleting}
                  className="btn-secondary flex items-center space-x-2 text-sm py-1.5 px-3"
                >
                  {generating ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary-600"></div>
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
            </div>
            <textarea
              value={editedBlog.content || ''}
              onChange={(e) => setEditedBlog({ ...editedBlog, content: e.target.value })}
              className="input-field w-full font-mono text-sm"
              rows={20}
              placeholder="Blog post content (HTML supported)"
            />
            <p className="text-xs text-gray-500 mt-2">
              HTML is supported. Use &lt;h2&gt;, &lt;h3&gt;, &lt;p&gt;, &lt;a&gt; tags for formatting.
            </p>
          </div>

          {/* Info Banner */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <p className="text-sm text-blue-800">
              <strong>Note:</strong> This blog has been manually edited. It will not be auto-published and requires manual approval.
            </p>
          </div>

          {/* Feedback Section */}
          {blog.content && blog.content.trim().length > 0 && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-medium text-gray-900">Help us improve</h3>
                {!showFeedback && (
                  <button
                    type="button"
                    onClick={() => setShowFeedback(true)}
                    className="text-sm text-primary-600 hover:text-primary-700 font-medium"
                  >
                    Provide Feedback
                  </button>
                )}
              </div>
              
              {showFeedback && (
                <div className="space-y-4">
                  <FeedbackForm
                    blogId={blog.id}
                    siteId={blog.siteId}
                    promptType="blog"
                    onSubmitted={() => setShowFeedback(false)}
                    onCancel={() => setShowFeedback(false)}
                  />
                  
                  {blog.title && (
                    <FeedbackForm
                      blogId={blog.id}
                      siteId={blog.siteId}
                      promptType="headline"
                      onSubmitted={() => {}}
                    />
                  )}
                  
                  {blog.imagePrompt && (
                    <FeedbackForm
                      blogId={blog.id}
                      siteId={blog.siteId}
                      promptType="image"
                      onSubmitted={() => {}}
                    />
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t flex items-center justify-between">
          <button
            onClick={handleDelete}
            disabled={deleting || saving || generating}
            className="btn-secondary text-red-600 hover:bg-red-50 border-red-200 flex items-center space-x-2"
          >
            <Trash2 className="w-4 h-4" />
            <span>{deleting ? 'Deleting...' : 'Delete'}</span>
          </button>
          <div className="flex items-center space-x-3">
            <button
              onClick={onClose}
              className="btn-secondary"
              disabled={saving || deleting}
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving || deleting || generating}
              className="btn-primary flex items-center space-x-2"
            >
              <Save className="w-4 h-4" />
              <span>{saving ? 'Saving...' : 'Save Changes'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
