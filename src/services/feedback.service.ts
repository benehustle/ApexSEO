import { collection, addDoc, query, where, getDocs, Timestamp } from 'firebase/firestore';
import { db } from '../config/firebase';
import { Feedback } from '../types/feedback';

class FeedbackService {
  async submitFeedback(feedback: Omit<Feedback, 'id' | 'createdAt' | 'analyzed'>): Promise<string> {
    try {
      const docRef = await addDoc(collection(db, 'feedback'), {
        ...feedback,
        createdAt: Timestamp.now(),
        analyzed: false,
      });
      return docRef.id;
    } catch (error) {
      console.error('Failed to submit feedback:', error);
      throw new Error('Failed to submit feedback');
    }
  }

  async submitKeywordFeedback(params: {
    keyword: string;
    siteId: string;
    userId: string;
    rating: number;
    text?: string;
  }): Promise<string> {
    return this.submitFeedback({
      keyword: params.keyword,
      siteId: params.siteId,
      userId: params.userId,
      promptType: 'keyword',
      rating: params.rating,
      text: params.text,
    });
  }

  async getFeedbackBySite(siteId: string, analyzed?: boolean): Promise<Feedback[]> {
    try {
      let q = query(collection(db, 'feedback'), where('siteId', '==', siteId));
      
      if (analyzed !== undefined) {
        q = query(q, where('analyzed', '==', analyzed));
      }

      const snapshot = await getDocs(q);
      return snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        createdAt: doc.data().createdAt?.toDate() || new Date(),
      } as Feedback));
    } catch (error) {
      console.error('Failed to get feedback:', error);
      throw new Error('Failed to get feedback');
    }
  }

  async getFeedbackCountBySite(siteId: string, analyzed?: boolean): Promise<number> {
    try {
      const feedback = await this.getFeedbackBySite(siteId, analyzed);
      return feedback.length;
    } catch (error) {
      console.error('Failed to get feedback count:', error);
      return 0;
    }
  }

  async getFeedbackByBlog(blogId: string): Promise<Feedback[]> {
    try {
      const q = query(collection(db, 'feedback'), where('blogId', '==', blogId));
      const snapshot = await getDocs(q);
      return snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        createdAt: doc.data().createdAt?.toDate() || new Date(),
      } as Feedback));
    } catch (error) {
      console.error('Failed to get feedback by blog:', error);
      throw new Error('Failed to get feedback by blog');
    }
  }
}

export const feedbackService = new FeedbackService();
