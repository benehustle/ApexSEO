import { collection, query, where, getDocs, doc, updateDoc, deleteDoc, Timestamp, orderBy, getDoc, addDoc } from 'firebase/firestore';
import { db } from '../config/firebase';
import { Blog } from '../types/blog';

export const blogService = {
  async getBlogs(siteId?: string, filters?: {
    status?: string;
    startDate?: Date;
    endDate?: Date;
  }): Promise<Blog[]> {
    const blogsRef = collection(db, 'blogs');
    let q = query(blogsRef);

    if (siteId) {
      q = query(q, where('siteId', '==', siteId));
    }

    if (filters?.status) {
      q = query(q, where('status', '==', filters.status));
    }

    q = query(q, orderBy('scheduledDate', 'desc'));

    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => {
      const data = doc.data();
      return {
        id: doc.id,
        ...data,
        userId: data.userId || '', // Ensure userId exists
        scheduledDate: data.scheduledDate.toDate(),
        publishedDate: data.publishedDate?.toDate(),
        createdAt: data.createdAt.toDate(),
        updatedAt: data.updatedAt.toDate(),
        lastViewedAt: data.lastViewedAt?.toDate()
      } as Blog;
    });
  },

  async getBlog(blogId: string): Promise<Blog | null> {
    const blogRef = doc(db, 'blogs', blogId);
    const snapshot = await getDoc(blogRef);
    
    if (!snapshot.exists()) return null;
    
    const data = snapshot.data();
    return {
      id: snapshot.id,
      ...data,
      userId: data.userId || '', // Ensure userId exists
      scheduledDate: data.scheduledDate.toDate(),
      publishedDate: data.publishedDate?.toDate(),
      createdAt: data.createdAt.toDate(),
      updatedAt: data.updatedAt.toDate(),
      lastViewedAt: data.lastViewedAt?.toDate()
    } as Blog;
  },

  async createBlog(blogData: Omit<Blog, 'id'>): Promise<string> {
    const blogsRef = collection(db, 'blogs');
    
    // Convert undefined to null for Firestore compatibility
    const firestoreData: any = {
      ...blogData,
      scheduledDate: blogData.scheduledDate instanceof Date ? Timestamp.fromDate(blogData.scheduledDate) : blogData.scheduledDate,
      publishedDate: blogData.publishedDate ? (blogData.publishedDate instanceof Date ? Timestamp.fromDate(blogData.publishedDate) : blogData.publishedDate) : null,
      createdAt: blogData.createdAt instanceof Date ? Timestamp.fromDate(blogData.createdAt) : blogData.createdAt,
      updatedAt: blogData.updatedAt instanceof Date ? Timestamp.fromDate(blogData.updatedAt) : blogData.updatedAt,
      lastViewedAt: blogData.lastViewedAt ? (blogData.lastViewedAt instanceof Date ? Timestamp.fromDate(blogData.lastViewedAt) : blogData.lastViewedAt) : null,
    };
    
    // Remove undefined values (Firestore doesn't accept undefined)
    Object.keys(firestoreData).forEach(key => {
      if (firestoreData[key] === undefined) {
        firestoreData[key] = null;
      }
    });
    
    const docRef = await addDoc(blogsRef, firestoreData);
    return docRef.id;
  },

  async updateBlogStatus(blogId: string, status: Blog['status']): Promise<void> {
    const blogRef = doc(db, 'blogs', blogId);
    await updateDoc(blogRef, {
      status,
      updatedAt: Timestamp.now()
    });
  },

  async updateBlog(blogId: string, updates: Partial<Blog>): Promise<void> {
    const blogRef = doc(db, 'blogs', blogId);
    const updateData: any = {
      updatedAt: Timestamp.now()
    };

    // Only include defined fields (exclude undefined)
    Object.keys(updates).forEach(key => {
      const value = (updates as any)[key];
      if (value !== undefined && value !== null) {
        updateData[key] = value;
      }
    });

    // Convert Date objects to Timestamps
    if (updates.scheduledDate) {
      updateData.scheduledDate = Timestamp.fromDate(updates.scheduledDate);
    }
    if (updates.publishedDate) {
      updateData.publishedDate = Timestamp.fromDate(updates.publishedDate);
    }
    if (updates.lastViewedAt) {
      updateData.lastViewedAt = Timestamp.fromDate(updates.lastViewedAt);
    }

    // Remove any undefined values that might have been added
    Object.keys(updateData).forEach(key => {
      if (updateData[key] === undefined) {
        delete updateData[key];
      }
    });

    await updateDoc(blogRef, updateData);
  },

  async deleteBlog(blogId: string): Promise<void> {
    const blogRef = doc(db, 'blogs', blogId);
    await deleteDoc(blogRef);
  },

  async approveBlog(blogId: string): Promise<void> {
    await this.updateBlogStatus(blogId, 'approved');
  },

  async rejectBlog(blogId: string): Promise<void> {
    await this.updateBlogStatus(blogId, 'rejected');
  },

  async bulkUpdateStatus(blogIds: string[], status: Blog['status']): Promise<void> {
    const promises = blogIds.map(id => this.updateBlogStatus(id, status));
    await Promise.all(promises);
  },

  async bulkDelete(blogIds: string[]): Promise<void> {
    const promises = blogIds.map(id => this.deleteBlog(id));
    await Promise.all(promises);
  },

  async deleteAllBlogs(): Promise<number> {
    const blogsRef = collection(db, 'blogs');
    const snapshot = await getDocs(blogsRef);
    const deletePromises = snapshot.docs.map(doc => deleteDoc(doc.ref));
    await Promise.all(deletePromises);
    return snapshot.docs.length;
  },

  async deleteAllBlogsForSite(siteId: string): Promise<number> {
    const blogsRef = collection(db, 'blogs');
    const q = query(blogsRef, where('siteId', '==', siteId));
    const snapshot = await getDocs(q);
    const deletePromises = snapshot.docs.map(doc => deleteDoc(doc.ref));
    await Promise.all(deletePromises);
    return snapshot.docs.length;
  }
};
