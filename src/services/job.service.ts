import { collection, addDoc, updateDoc, doc, getDoc, Timestamp } from 'firebase/firestore';
import { db } from '../config/firebase';
import { BlogGenerationJob } from '../types/job';

export const jobService = {
  async createJob(userId: string, siteId: string, totalBlogs: number): Promise<string> {
    const jobsRef = collection(db, 'jobs');
    const docRef = await addDoc(jobsRef, {
      userId,
      siteId,
      totalBlogs,
      completedBlogs: 0,
      failedBlogs: 0,
      status: 'pending',
      errors: [],
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now()
    });
    return docRef.id;
  },

  async updateJobProgress(jobId: string, updates: Partial<BlogGenerationJob>) {
    const jobRef = doc(db, 'jobs', jobId);
    await updateDoc(jobRef, {
      ...updates,
      updatedAt: Timestamp.now()
    });
  },

  async markJobComplete(jobId: string) {
    await this.updateJobProgress(jobId, { status: 'completed' });
  },

  async markJobFailed(jobId: string, error: string) {
    const jobRef = doc(db, 'jobs', jobId);
    const jobDoc = await getDoc(jobRef);
    const existingErrors = jobDoc.data()?.errors || [];
    
    await updateDoc(jobRef, {
      status: 'failed',
      errors: [...existingErrors, error],
      updatedAt: Timestamp.now()
    });
  },

  async getJob(jobId: string): Promise<BlogGenerationJob | null> {
    const jobRef = doc(db, 'jobs', jobId);
    const jobDoc = await getDoc(jobRef);
    
    if (!jobDoc.exists()) {
      return null;
    }

    const data = jobDoc.data();
    return {
      id: jobDoc.id,
      ...data,
      createdAt: data.createdAt.toDate(),
      updatedAt: data.updatedAt.toDate()
    } as BlogGenerationJob;
  }
};
