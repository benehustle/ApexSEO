import React from 'react';
import { X, Eye, CheckCircle2, Loader2, RefreshCw, Sparkles, Image as ImageIcon } from 'lucide-react';

interface PostPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  post: {
    id: string;
    blogTopic: string;
    generatedContent?: string;
    featuredImageUrl?: string;
    blogDescription?: string;
    keyword?: string;
  } | null;
  onApprove: () => Promise<void>;
  onRegenerate?: () => Promise<void>;
  isApproving?: boolean;
  isRegenerating?: boolean;
}

export const PostPreviewModal: React.FC<PostPreviewModalProps> = ({
  isOpen,
  onClose,
  post,
  onApprove,
  onRegenerate,
  isApproving = false,
  isRegenerating = false,
}) => {
  if (!isOpen || !post) return null;

  const isProcessing = isApproving || isRegenerating;

  // Inline styles for blog content preview
  const blogContentStyles = `
    .blog-content-preview {
      color: #e2e8f0;
      line-height: 1.7;
    }
    .blog-content-preview h1 {
      font-size: 2rem;
      font-weight: 700;
      color: #ffffff;
      margin-top: 2rem;
      margin-bottom: 1rem;
    }
    .blog-content-preview h2 {
      font-size: 1.5rem;
      font-weight: 600;
      color: #ffffff;
      margin-top: 1.5rem;
      margin-bottom: 0.75rem;
    }
    .blog-content-preview h3 {
      font-size: 1.25rem;
      font-weight: 600;
      color: #cbd5e1;
      margin-top: 1.25rem;
      margin-bottom: 0.5rem;
    }
    .blog-content-preview p {
      margin-bottom: 1rem;
      color: #e2e8f0;
    }
    .blog-content-preview ul, .blog-content-preview ol {
      margin-left: 1.5rem;
      margin-bottom: 1rem;
    }
    .blog-content-preview li {
      margin-bottom: 0.5rem;
      color: #e2e8f0;
    }
    .blog-content-preview a {
      color: #60a5fa;
      text-decoration: underline;
    }
    .blog-content-preview a:hover {
      color: #93c5fd;
    }
    .blog-content-preview strong {
      font-weight: 600;
      color: #ffffff;
    }
  `;

  return (
    <>
      <style>{blogContentStyles}</style>
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
      <div className="w-full max-w-6xl max-h-[90vh] bg-slate-900 border border-slate-700 rounded-xl shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-slate-700">
          <div className="flex items-center gap-3">
            <Eye className="w-6 h-6 text-blue-400" />
            <h2 className="text-2xl font-bold text-white">Post Preview</h2>
          </div>
          <button
            onClick={onClose}
            disabled={isProcessing}
            className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto flex">
          {/* Main Content */}
          <div className="flex-1 p-6 overflow-y-auto">
            <div className="mb-6">
              <h1 className="text-3xl font-bold text-white mb-2">{post.blogTopic}</h1>
              {post.keyword && (
                <p className="text-sm text-slate-400">Keyword: {post.keyword}</p>
              )}
              {post.blogDescription && (
                <p className="text-sm text-slate-300 mt-2">{post.blogDescription}</p>
              )}
            </div>

            {post.generatedContent ? (
              <div
                className="max-w-none blog-content-preview"
                dangerouslySetInnerHTML={{ __html: post.generatedContent }}
              />
            ) : (
              <div className="text-center py-12">
                <p className="text-slate-400">Content not yet generated</p>
              </div>
            )}
          </div>

          {/* Sidebar with Featured Image */}
          <div className="w-80 border-l border-slate-700 p-6 bg-slate-800/50">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-slate-300">Featured Image</h3>
              {post.featuredImageUrl && onRegenerate && (
                <button
                  onClick={onRegenerate}
                  disabled={isProcessing}
                  className="p-1.5 text-slate-400 hover:text-blue-400 hover:bg-slate-700 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  title="Regenerate Image"
                >
                  {isRegenerating ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <RefreshCw className="w-4 h-4" />
                  )}
                </button>
              )}
            </div>
            
            {post.featuredImageUrl ? (
              <div className="relative rounded-lg overflow-hidden border border-slate-700">
                {isRegenerating && (
                  <div className="absolute inset-0 bg-black/50 flex items-center justify-center z-10">
                    <Loader2 className="w-8 h-8 text-blue-400 animate-spin" />
                  </div>
                )}
                <img
                  src={post.featuredImageUrl}
                  alt={post.blogTopic}
                  className="w-full h-auto"
                />
              </div>
            ) : (
              <div className="relative h-64 rounded-lg border-2 border-dashed border-slate-600 bg-slate-800/30 flex items-center justify-center">
                {isRegenerating ? (
                  <div className="flex flex-col items-center gap-3">
                    <Loader2 className="w-8 h-8 text-blue-400 animate-spin" />
                    <p className="text-sm text-slate-400">Generating image...</p>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-4">
                    <div className="p-4 rounded-full bg-slate-700/50">
                      <ImageIcon className="w-8 h-8 text-slate-400" />
                    </div>
                    <p className="text-sm text-slate-400">No image generated yet</p>
                    {onRegenerate && (
                      <button
                        onClick={onRegenerate}
                        disabled={isProcessing}
                        className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-700 disabled:text-slate-400 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors flex items-center gap-2"
                      >
                        <Sparkles className="w-4 h-4" />
                        <span>Generate Image</span>
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-between p-6 border-t border-slate-700 bg-slate-800/50">
          <div className="flex gap-3">
            <button
              onClick={onClose}
              disabled={isProcessing}
              className="px-6 py-2 bg-slate-700 hover:bg-slate-600 disabled:bg-slate-700 disabled:text-slate-400 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors"
            >
              Close
            </button>
            <button
              onClick={onApprove}
              disabled={isProcessing}
              className="px-6 py-2 bg-green-600 hover:bg-green-700 disabled:bg-slate-700 disabled:text-slate-400 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors flex items-center gap-2"
            >
              {isApproving ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Approving...</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Approve & Schedule</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
    </>
  );
};
