import React, { useState, useEffect } from 'react';
import { blogService } from '../services/blog.service';
import { siteService } from '../services/site.service';
import { BlogCard } from '../components/blog/BlogCard';
import { BlogEditor } from '../components/blog/BlogEditor';
import { useAuth } from '../hooks/useAuth';
import { useAgencyContext } from '../contexts/AgencyContext';
import { Blog } from '../types/blog';
import { Site } from '../types/site';
import { Filter, CheckSquare, Trash2, Calendar } from 'lucide-react';
import { PublishNowModal } from '../components/common/PublishNowModal';
import { BulkScheduleModal } from '../components/common/BulkScheduleModal';
// import { publishingService } from '../services/publishing.service';

export const ContentCalendar: React.FC = () => {
  const [blogs, setBlogs] = useState<Blog[]>([]);
  const [sites, setSites] = useState<Site[]>([]);
  const [selectedSite, setSelectedSite] = useState<string>('all');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [selectedBlogs, setSelectedBlogs] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [publishModal, setPublishModal] = useState<{ blogId: string; title: string } | null>(null);
  const [scheduleModal, setScheduleModal] = useState(false);
  const [editingBlog, setEditingBlog] = useState<Blog | null>(null);
  const { user } = useAuth();
  const { agencyId, loading: agencyLoading } = useAgencyContext();

  useEffect(() => {
    if (!agencyLoading) {
      loadData();
    }
  }, [user, agencyId, agencyLoading, selectedSite, selectedStatus]);

  const loadData = async () => {
    if (!user) return;
    
    setLoading(true);
    try {
      const [blogsData, sitesData] = await Promise.all([
        blogService.getBlogs(
          selectedSite === 'all' ? undefined : selectedSite,
          { status: selectedStatus === 'all' ? undefined : selectedStatus }
        ),
        siteService.getUserSites(user.uid, agencyId)
      ]);

      setBlogs(blogsData);
      setSites(sitesData);
    } catch (error) {
      console.error('Failed to load data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (blogId: string) => {
    await blogService.approveBlog(blogId);
    loadData();
  };

  const handleReject = async (blogId: string) => {
    await blogService.rejectBlog(blogId);
    loadData();
  };

  const handleEdit = async (blogId: string) => {
    const blog = await blogService.getBlog(blogId);
    if (blog) {
      setEditingBlog(blog);
    }
  };

  const handleDelete = async (blogId: string) => {
    if (confirm('Are you sure you want to delete this blog?')) {
      await blogService.deleteBlog(blogId);
      loadData();
    }
  };

  const handleBulkApprove = async () => {
    if (selectedBlogs.size === 0) return;
    await blogService.bulkUpdateStatus(Array.from(selectedBlogs), 'approved');
    setSelectedBlogs(new Set());
    loadData();
  };

  const handleBulkDelete = async () => {
    if (selectedBlogs.size === 0) return;
    if (confirm(`Are you sure you want to delete ${selectedBlogs.size} blogs?`)) {
      await blogService.bulkDelete(Array.from(selectedBlogs));
      setSelectedBlogs(new Set());
      loadData();
    }
  };

  const handleSelectBlog = (blogId: string, selected: boolean) => {
    const newSelected = new Set(selectedBlogs);
    if (selected) {
      newSelected.add(blogId);
    } else {
      newSelected.delete(blogId);
    }
    setSelectedBlogs(newSelected);
  };

  const handleSelectAll = () => {
    if (selectedBlogs.size === blogs.length) {
      setSelectedBlogs(new Set());
    } else {
      setSelectedBlogs(new Set(blogs.map(b => b.id)));
    }
  };

  const handlePublishNow = (blogId: string, title: string) => {
    setPublishModal({ blogId, title });
  };

  const handleBulkSchedule = () => {
    if (selectedBlogs.size === 0) {
      alert('Please select blogs to schedule');
      return;
    }
    setScheduleModal(true);
  };

  const getSelectedSite = () => {
    if (selectedSite === 'all' && sites.length > 0) {
      return sites[0];
    }
    return sites.find(s => s.id === selectedSite);
  };

    if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  return (
    <div className="animate-slide-in">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 tracking-tight">Content Calendar</h1>
        <p className="text-gray-500 mt-1 text-lg">Manage and schedule your blog posts</p>
      </div>

      {/* Filters */}
      <div className="card p-4 mb-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4 flex-1">
              <Filter className="w-5 h-5 text-gray-500" />
              
              <select
                value={selectedSite}
                onChange={(e) => setSelectedSite(e.target.value)}
                className="input-field"
              >
                <option value="all">All Sites</option>
                {sites.map(site => (
                  <option key={site.id} value={site.id}>{site.name}</option>
                ))}
              </select>

              <select
                value={selectedStatus}
                onChange={(e) => setSelectedStatus(e.target.value)}
                className="input-field"
              >
                <option value="all">All Statuses</option>
                <option value="pending">Pending</option>
                <option value="approved">Approved</option>
                <option value="scheduled">Scheduled</option>
                <option value="published">Published</option>
                <option value="rejected">Rejected</option>
              </select>
            </div>

            {selectedBlogs.size > 0 && (
              <div className="flex items-center space-x-2">
                <span className="text-sm text-gray-600">{selectedBlogs.size} selected</span>
                <button
                  onClick={handleBulkApprove}
                  className="btn-secondary text-sm flex items-center space-x-1"
                >
                  <CheckSquare className="w-4 h-4" />
                  <span>Approve</span>
                </button>
                <button
                  onClick={handleBulkSchedule}
                  className="btn-secondary text-sm flex items-center space-x-1"
                >
                  <Calendar className="w-4 h-4" />
                  <span>Schedule</span>
                </button>
                <button
                  onClick={handleBulkDelete}
                  className="bg-red-600 text-white px-3 py-2 rounded-lg hover:bg-red-700 text-sm flex items-center space-x-1"
                >
                  <Trash2 className="w-4 h-4" />
                  <span>Delete</span>
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Select All */}
        {blogs.length > 0 && (
          <div className="mb-4">
            <button
              onClick={handleSelectAll}
              className="text-sm text-primary-600 hover:text-primary-700 font-medium"
            >
              {selectedBlogs.size === blogs.length ? 'Deselect All' : 'Select All'}
            </button>
          </div>
        )}

        {/* Blog List */}
        <div className="space-y-4">
          {blogs.map(blog => (
            <BlogCard
              key={blog.id}
              blog={blog}
              siteName={sites.find(s => s.id === blog.siteId)?.name || 'Unknown'}
              onApprove={handleApprove}
              onReject={handleReject}
              onEdit={handleEdit}
              onDelete={handleDelete}
              onPublish={handlePublishNow}
              onSelect={handleSelectBlog}
              isSelected={selectedBlogs.has(blog.id)}
            />
          ))}

          {blogs.length === 0 && (
            <div className="text-center py-16 card bg-slate-900/50 border-dashed border-2 border-slate-700 shadow-none">
              <Calendar className="w-16 h-16 text-slate-600 mx-auto mb-4" />
              <p className="text-white font-bold text-lg mb-2">No blogs found</p>
              <p className="text-slate-400">Generate some blogs to get started!</p>
            </div>
          )}
        </div>

        {/* Modals */}
        {publishModal && (
          <PublishNowModal
            blogId={publishModal.blogId}
            blogTitle={publishModal.title}
            onClose={() => setPublishModal(null)}
            onSuccess={() => {
              loadData();
              setPublishModal(null);
            }}
          />
        )}

        {scheduleModal && (
          <BulkScheduleModal
            blogIds={Array.from(selectedBlogs)}
            blogsPerWeek={getSelectedSite()?.blogsPerWeek || 3}
            onClose={() => setScheduleModal(false)}
            onSuccess={() => {
              loadData();
              setSelectedBlogs(new Set());
              setScheduleModal(false);
            }}
          />
        )}

        {editingBlog && (
          <BlogEditor
            blog={editingBlog}
            onClose={() => setEditingBlog(null)}
            onSave={() => {
              loadData();
              setEditingBlog(null);
            }}
          />
        )}
    </div>
  );
};

export default ContentCalendar;
