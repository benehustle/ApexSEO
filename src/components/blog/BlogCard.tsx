import React, { useState } from 'react';
import { Blog } from '../../types/blog';
import { Calendar, FileText, Image, Link as LinkIcon, CheckCircle, XCircle, Edit, Trash2, Eye, PlayCircle, MessageSquare } from 'lucide-react';
import { format } from 'date-fns';
import { FeedbackForm } from '../feedback/FeedbackForm';

interface BlogCardProps {
  blog: Blog;
  siteName: string;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
  onPublish?: (id: string, title: string) => void;
  onSelect?: (id: string, selected: boolean) => void;
  isSelected?: boolean;
}

export const BlogCard: React.FC<BlogCardProps> = ({
  blog,
  siteName,
  onApprove,
  onReject,
  onEdit,
  onDelete,
  onPublish,
  onSelect,
  isSelected
}) => {
  const [showFeedback, setShowFeedback] = useState(false);

  const getStatusColor = (status: Blog['status']) => {
    switch(status) {
      case 'pending': return 'bg-amber-100 text-amber-800 border-amber-200';
      case 'approved': return 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30';
      case 'scheduled': return 'bg-blue-500/20 text-blue-400 border-blue-500/30';
      case 'rejected': return 'bg-red-500/20 text-red-400 border-red-500/30';
      case 'published': return 'bg-purple-500/20 text-purple-400 border-purple-500/30';
      case 'planned': return 'bg-slate-500/20 text-slate-400 border-slate-500/30';
      default: return 'bg-slate-500/20 text-slate-400 border-slate-500/30';
    }
  };

  return (
    <div className={`card group transition-all duration-300 ${isSelected ? 'ring-2 ring-primary-500 shadow-medium' : 'hover:shadow-medium'}`}>
      <div className="p-5">
        <div className="flex items-start justify-between gap-4">
          {onSelect && (
            <div className="pt-1">
              <input
                type="checkbox"
                checked={isSelected}
                onChange={(e) => onSelect(blog.id, e.target.checked)}
                className="w-5 h-5 rounded border-slate-600 bg-slate-700 text-blue-600 focus:ring-blue-500 cursor-pointer"
              />
            </div>
          )}
          
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2 mb-3">
              <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold uppercase tracking-wide border ${getStatusColor(blog.status)}`}>
                {blog.status}
              </span>
              {blog.manuallyEdited && (
                <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-orange-500/20 text-orange-400 border border-orange-500/30">
                  Edited
                </span>
              )}
              <span className="text-xs text-slate-400 font-medium flex items-center">
                <span className="w-1 h-1 bg-slate-500 rounded-full mr-2"></span>
                {siteName}
              </span>
            </div>
            
            <h3 className="font-bold text-white text-lg mb-2 leading-tight group-hover:text-blue-400 transition-colors cursor-pointer" onClick={() => onEdit(blog.id)}>
              {blog.title}
            </h3>
            
            <p className="text-slate-400 text-sm mb-4 line-clamp-2 leading-relaxed">
              {blog.excerpt}
            </p>
            
            <div className="flex flex-wrap items-center gap-4 text-xs font-medium text-slate-400 mb-4">
              <div className="flex items-center bg-slate-700 px-2 py-1 rounded-md">
                <Calendar className="w-3.5 h-3.5 mr-1.5 text-slate-400" />
                {format(blog.scheduledDate, 'MMM dd, yyyy')}
              </div>
              <div className="flex items-center bg-slate-700 px-2 py-1 rounded-md">
                <FileText className="w-3.5 h-3.5 mr-1.5 text-slate-400" />
                {blog.wordCount} words
              </div>
              <div className="flex items-center bg-slate-700 px-2 py-1 rounded-md">
                <LinkIcon className="w-3.5 h-3.5 mr-1.5 text-slate-400" />
                {blog.internalLinks.length} int, {blog.externalLinks.length} ext
              </div>
              <div className="flex items-center bg-slate-700 px-2 py-1 rounded-md">
                 <Image className="w-3.5 h-3.5 mr-1.5 text-slate-400" />
                 {blog.featuredImageUrl ? 'Has Image' : 'No Image'}
              </div>
              {blog.status === 'published' && (
                <div className="flex items-center bg-purple-500/20 text-purple-400 border border-purple-500/30 px-2 py-1 rounded-md">
                  <Eye className="w-3.5 h-3.5 mr-1.5" />
                  {blog.totalViews.toLocaleString()} views
                </div>
              )}
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider mr-1">Key:</span>
              <span className="bg-blue-500/20 text-blue-400 px-2 py-1 rounded text-xs font-medium border border-blue-500/30">
                {blog.keyword}
              </span>
              {blog.relatedKeywords?.slice(0, 2).map((kw, idx) => (
                <span key={idx} className="bg-slate-700 text-slate-300 px-2 py-1 rounded text-xs border border-slate-600 hidden sm:inline-block">
                  {kw}
                </span>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-2 border-l border-gray-100 pl-4 ml-2">
            {blog.status === 'pending' && (
              <>
                <button
                  onClick={() => onApprove(blog.id)}
                  className="p-2 text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors"
                  title="Approve"
                >
                  <CheckCircle className="w-5 h-5" />
                </button>
                <button
                  onClick={() => onReject(blog.id)}
                  className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                  title="Reject"
                >
                  <XCircle className="w-5 h-5" />
                </button>
              </>
            )}
            {(blog.status === 'approved' || blog.status === 'scheduled') && onPublish && (
              <button
                onClick={() => onPublish(blog.id, blog.title)}
                className="p-2 text-purple-600 hover:bg-purple-50 rounded-lg transition-colors"
                title="Publish Now"
              >
                <PlayCircle className="w-5 h-5" />
              </button>
            )}
            <button
              onClick={() => onEdit(blog.id)}
              className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
              title="Edit"
            >
              <Edit className="w-5 h-5" />
            </button>
            <button
              onClick={() => onDelete(blog.id)}
              className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
              title="Delete"
            >
              <Trash2 className="w-5 h-5" />
            </button>
            {(blog.status === 'published' || blog.status === 'approved') && (
              <button
                onClick={() => setShowFeedback(!showFeedback)}
                className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                title="Provide Feedback"
              >
                <MessageSquare className="w-5 h-5" />
              </button>
            )}
          </div>
        </div>
        
        {/* Feedback Section */}
        {showFeedback && (blog.status === 'published' || blog.status === 'approved') && (
          <div className="mt-4 pt-4 border-t border-gray-200">
            <FeedbackForm
              blogId={blog.id}
              siteId={blog.siteId}
              promptType="blog"
              onSubmitted={() => setShowFeedback(false)}
              onCancel={() => setShowFeedback(false)}
            />
            {blog.title && (
              <div className="mt-3">
                <FeedbackForm
                  blogId={blog.id}
                  siteId={blog.siteId}
                  promptType="headline"
                  onSubmitted={() => {}}
                />
              </div>
            )}
            {blog.imagePrompt && (
              <div className="mt-3">
                <FeedbackForm
                  blogId={blog.id}
                  siteId={blog.siteId}
                  promptType="image"
                  onSubmitted={() => {}}
                />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
