import { doc, updateDoc, Timestamp, getDoc } from 'firebase/firestore';
import { db } from '../config/firebase';
import { wordpressService } from './wordpress.service';
import { siteService } from './site.service';
import { blogService } from './blog.service';
import { emailService } from './email.service';
import { preferencesService } from './preferences.service';

export const publishingService = {
  async publishNow(blogId: string): Promise<void> {
    const blog = await blogService.getBlog(blogId);
    if (!blog) throw new Error('Blog not found');
    
    const site = await siteService.getSite(blog.siteId);
    if (!site) throw new Error('Site not found');
    
    try {
      // Upload featured image
      let featuredMediaId;
      if (blog.featuredImageUrl) {
        const imageResponse = await fetch(blog.featuredImageUrl);
        if (!imageResponse.ok) {
          throw new Error('Failed to fetch featured image');
        }
        const imageBlob = await imageResponse.blob();
        
        const imageData = await wordpressService.uploadImage(
          site.wordpressApiUrl,
          site.wordpressUsername,
          site.wordpressAppPassword,
          imageBlob,
          `${blogId}.webp`
        );
        
        featuredMediaId = imageData.id;
      }
      
      // Create post with tracking
      const contentWithTracking = blog.content + (blog.trackingScript || '');
      
      const postData = await wordpressService.createDraftPost(
        site.wordpressApiUrl,
        site.wordpressUsername,
        site.wordpressAppPassword,
        {
          title: blog.title,
          content: contentWithTracking,
          excerpt: blog.excerpt,
          featuredMediaId
        }
      );
      
      // Publish the post
      await wordpressService.publishPost(
        site.wordpressApiUrl,
        site.wordpressUsername,
        site.wordpressAppPassword,
        postData.id
      );
      
      // Update blog document
      const blogRef = doc(db, 'blogs', blogId);
      await updateDoc(blogRef, {
        status: 'published',
        wordpressPostId: postData.id,
        publishedDate: Timestamp.now(),
        wordpressPostUrl: postData.link,
        updatedAt: Timestamp.now()
      });

      // Send email notification if enabled
      try {
        const userDoc = await getDoc(doc(db, 'users', site.userId));
        if (userDoc.exists()) {
          const user = userDoc.data();
          const preferences = await preferencesService.getPreferences(site.userId);
          
          if (preferences.emailNotifications.blogPublished && user.email) {
            await emailService.sendBlogPublished(user.email, {
              siteName: site.name,
              blogTitle: blog.title,
              publishDate: new Date().toLocaleString(),
              scheduledDate: blog.scheduledDate.toLocaleString(),
              wordpressUrl: postData.link,
              analyticsUrl: `${window.location.origin}/analytics?blog=${blogId}`,
            });
          }
        }
      } catch (emailError) {
        console.error('Failed to send email notification:', emailError);
        // Don't fail the publish if email fails
      }
      
    } catch (error: any) {
      console.error('Publishing error:', error);
      throw new Error(`Failed to publish: ${error.message || error}`);
    }
  },

  async scheduleBlog(blogId: string, scheduledDate: Date): Promise<void> {
    const blogRef = doc(db, 'blogs', blogId);
    await updateDoc(blogRef, {
      scheduledDate: Timestamp.fromDate(scheduledDate),
      status: 'approved',
      updatedAt: Timestamp.now()
    });
  },

  async bulkSchedule(blogIds: string[], startDate: Date, blogsPerWeek: number): Promise<void> {
    const daysInterval = Math.floor(7 / blogsPerWeek);
    
    for (let i = 0; i < blogIds.length; i++) {
      const scheduledDate = new Date(startDate);
      scheduledDate.setDate(scheduledDate.getDate() + (i * daysInterval));
      scheduledDate.setHours(9, 0, 0, 0); // Set to 9 AM
      
      // Skip weekends
      if (scheduledDate.getDay() === 0) scheduledDate.setDate(scheduledDate.getDate() + 1);
      if (scheduledDate.getDay() === 6) scheduledDate.setDate(scheduledDate.getDate() + 2);
      
      await this.scheduleBlog(blogIds[i], scheduledDate);
    }
  }
};
