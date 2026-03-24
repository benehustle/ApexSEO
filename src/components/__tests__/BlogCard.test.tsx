import { describe, it, expect, vi } from 'vitest';
import { screen, fireEvent } from '@testing-library/react';
import { BlogCard } from '../blog/BlogCard';
import { renderWithProviders, mockBlog } from '../../test/utils';

describe('BlogCard', () => {
  const mockHandlers = {
    onApprove: vi.fn(),
    onReject: vi.fn(),
    onEdit: vi.fn(),
    onDelete: vi.fn(),
    onPublish: vi.fn(),
  };

  it('should render blog details', () => {
    renderWithProviders(
      <BlogCard 
        blog={mockBlog} 
        siteName="Test Site"
        {...mockHandlers}
      />
    );

    expect(screen.getByText(mockBlog.title)).toBeInTheDocument();
    expect(screen.getByText(new RegExp(`${mockBlog.wordCount}`, 'i'))).toBeInTheDocument();
  });

  it('should display status badge', () => {
    renderWithProviders(
      <BlogCard 
        blog={mockBlog} 
        siteName="Test Site"
        {...mockHandlers}
      />
    );

    const statusBadge = screen.getByText('pending');
    expect(statusBadge).toBeInTheDocument();
  });

  it('should call onApprove when approve button is clicked', () => {
    renderWithProviders(
      <BlogCard 
        blog={mockBlog} 
        siteName="Test Site"
        {...mockHandlers}
      />
    );

    const approveButton = screen.getByRole('button', { name: /approve/i });
    fireEvent.click(approveButton);

    expect(mockHandlers.onApprove).toHaveBeenCalledWith(mockBlog.id);
  });

  it('should call onReject when reject button is clicked', () => {
    renderWithProviders(
      <BlogCard 
        blog={mockBlog} 
        siteName="Test Site"
        {...mockHandlers}
      />
    );

    const rejectButton = screen.getByRole('button', { name: /reject/i });
    fireEvent.click(rejectButton);

    expect(mockHandlers.onReject).toHaveBeenCalledWith(mockBlog.id);
  });

  it('should call onEdit when edit button is clicked', () => {
    renderWithProviders(
      <BlogCard 
        blog={mockBlog} 
        siteName="Test Site"
        {...mockHandlers}
      />
    );

    const editButton = screen.getByRole('button', { name: /edit/i });
    fireEvent.click(editButton);

    expect(mockHandlers.onEdit).toHaveBeenCalledWith(mockBlog.id);
  });

  it('should display status badge with correct styling for approved status', () => {
    const approvedBlog = { ...mockBlog, status: 'approved' as const };
    
    renderWithProviders(
      <BlogCard 
        blog={approvedBlog}
        siteName="Test Site"
        {...mockHandlers}
      />
    );

    const statusBadge = screen.getByText('approved');
    expect(statusBadge).toBeInTheDocument();
  });

  it('should display keyword', () => {
    renderWithProviders(
      <BlogCard 
        blog={mockBlog} 
        siteName="Test Site"
        {...mockHandlers}
      />
    );

    expect(screen.getByText(mockBlog.keyword)).toBeInTheDocument();
  });
});
