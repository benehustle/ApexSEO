import React from 'react';
import { BlogCard } from './blog/BlogCard';
import { Blog } from '../types/blog';

interface VirtualBlogListProps {
  blogs: Blog[];
  height: number;
  siteName: string;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
  onPublish?: (id: string, title: string) => void;
  onSelect?: (id: string, selected: boolean) => void;
  selectedBlogs?: Set<string>;
}

export const VirtualBlogList: React.FC<VirtualBlogListProps> = ({
  blogs,
  siteName,
  onApprove,
  onReject,
  onEdit,
  onDelete,
  onPublish,
  onSelect,
  selectedBlogs
}) => {
  if (blogs.length === 0) {
    return (
      <div className="text-center py-12 text-gray-500">
        No blogs found
      </div>
    );
  }

  // Simple scrollable list - virtual scrolling can be added later if needed
  return (
    <div className="space-y-4" style={{ maxHeight: '600px', overflowY: 'auto' }}>
      {blogs.map(blog => (
        <BlogCard
          key={blog.id}
          blog={blog}
          siteName={siteName}
          onApprove={onApprove}
          onReject={onReject}
          onEdit={onEdit}
          onDelete={onDelete}
          onPublish={onPublish}
          onSelect={onSelect}
          isSelected={selectedBlogs?.has(blog.id)}
        />
      ))}
    </div>
  );
};
