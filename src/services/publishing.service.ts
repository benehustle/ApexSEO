import { doc, updateDoc, Timestamp, getDoc } from 'firebase/firestore';
import { db } from '../config/firebase';
import { wordpressService } from './wordpress.service';
import { siteService } from './site.service';
import { blogService } from './blog.service';
import { emailService } from './email.service';
import { preferencesService } from './preferences.service';
import { seoService } from './seo.service';

export const publishingService = {
  async publishNow(blogId: string): Promise<void> {
    const blog = await blogService.getBlog(blogId);
    if (!blog) throw new Error('Blog not found');

    const site = await siteService.getSite(blog.siteId);
    if (!site) throw new Error('Site not found');

    try {
      // ⚠️ CONTENT QUALITY CHECKS & OPTIMIZATION
      let contentWithTracking = blog.content;

      // 1. Validate heading hierarchy
      const headingValidation = seoService.validateHeadingHierarchy(contentWithTracking);
      if (!headingValidation.valid) {
        console.warn('Heading hierarchy issues found, attempting to fix:', headingValidation.errors);
        contentWithTracking = seoService.fixHeadingHierarchy(contentWithTracking, blog.title);
      }

      // 2. Validate meta description length (155 chars)
      const metaDescValidation = seoService.validateMetaDescription(blog.metaDescription);
      if (metaDescValidation.warning) {
        console.warn('Meta description warning:', metaDescValidation.warning);
      }

      // 3. Validate internal links
      const internalLinkValidation = seoService.validateInternalLinks(contentWithTracking, site.url);
      if (!internalLinkValidation.valid) {
        console.warn('Internal link issues:', internalLinkValidation.errors);
      }

      // 4. Calculate readability score
      const readabilityScore = seoService.calculateReadabilityScore(contentWithTracking);
      console.log(`Content readability score: ${Math.round(readabilityScore)}/100 (target: 60-70)`);

      // 5. Analyze keyword density
      const keywordDensity = seoService.analyzeKeywordDensity(
        contentWithTracking,
        blog.keyword,
        blog.relatedKeywords
      );
      console.log(`Primary keyword density: ${keywordDensity.primary.toFixed(2)}% (target: 1-2%)`);
      if (keywordDensity.primary < 0.5 || keywordDensity.primary > 3) {
        console.warn(`⚠️ Keyword density for "${blog.keyword}" is ${keywordDensity.primary.toFixed(2)}% - may need adjustment`);
      }

      // 6. Check featured snippet optimization
      const snippetOptimization = seoService.optimizeForFeaturedSnippets(contentWithTracking, blog.keyword);
      if (snippetOptimization.suggestions.length > 0) {
        console.info('Featured snippet improvement suggestions:', snippetOptimization.suggestions);
      }

      // 7. Suggest semantic keyword placement
      if (blog.relatedKeywords && blog.relatedKeywords.length > 0) {
        const keywordPlacement = seoService.suggestSemanticKeywordPlacement(contentWithTracking, blog.relatedKeywords);
        if (keywordPlacement.suggestions.length > 0) {
          console.info('Semantic keyword suggestions:', keywordPlacement.suggestions.slice(0, 3));
        }
      }

      contentWithTracking += (blog.trackingScript || '');

      // Upload featured image with alt text
      let featuredMediaId;
      let imageAltText = '';
      if (blog.featuredImageUrl) {
        const imageResponse = await fetch(blog.featuredImageUrl);
        if (!imageResponse.ok) {
          throw new Error('Failed to fetch featured image');
        }
        const imageBlob = await imageResponse.blob();

        // Generate alt text
        imageAltText = seoService.generateImageAltText(blog.title, blog.keyword);

        const imageData = await wordpressService.uploadImage(
          site.wordpressApiUrl,
          site.wordpressUsername,
          site.wordpressAppPassword,
          imageBlob,
          `${blogId}.webp`,
          {
            altText: imageAltText,
            title: blog.title,
            description: blog.excerpt,
            caption: blog.excerpt
          }
        );

        featuredMediaId = imageData.id;
      }

      // Generate slug if not already set
      const slug = blog.slug || seoService.generateSlug(blog.title, blog.keyword);

      const postData = await wordpressService.createDraftPost(
        site.wordpressApiUrl,
        site.wordpressUsername,
        site.wordpressAppPassword,
        {
          title: blog.title,
          content: contentWithTracking,
          excerpt: blog.excerpt,
          featuredMediaId,
          slug
        }
      );

      // Generate SEO metadata
      const postUrl = postData.link || `${site.url}/?p=${postData.id}`;
      const seoMetadata = seoService.generateSeoMetadata(blog, site, postUrl, {
        authorName: site.name,
        twitterHandle: undefined // Could be added to Site type if needed
      });

      // Update post with SEO metadata
      await wordpressService.updatePostSeoMetadata(
        site.wordpressApiUrl,
        site.wordpressUsername,
        site.wordpressAppPassword,
        postData.id,
        {
          metaDescription: blog.metaDescription,
          schemas: [
            seoMetadata.schemas.blogPosting,
            seoMetadata.schemas.imageObject,
            seoMetadata.schemas.organization
          ],
          openGraphTags: seoMetadata.openGraph,
          twitterCardTags: seoMetadata.twitterCard,
          canonical: postUrl,
          imageAltText
        }
      );

      // Publish the post
      await wordpressService.publishPost(
        site.wordpressApiUrl,
        site.wordpressUsername,
        site.wordpressAppPassword,
        postData.id
      );

      // Update blog document with SEO metadata
      const blogRef = doc(db, 'blogs', blogId);
      await updateDoc(blogRef, {
        status: 'published',
        wordpressPostId: postData.id,
        publishedDate: Timestamp.now(),
        wordpressPostUrl: postData.link,
        updatedAt: Timestamp.now(),
        // Store SEO metadata
        featuredImageAltText: imageAltText,
        seoSchemas: seoMetadata.schemas ? Object.values(seoMetadata.schemas) : undefined,
        openGraphTags: seoMetadata.openGraph,
        twitterCardTags: seoMetadata.twitterCard,
        canonicalUrl: postUrl,
        headingHierarchyValid: headingValidation.valid,
        // Store Phase 3 SEO optimization results
        slug,
        contentReadabilityScore: readabilityScore,
        keywordDensity,
        metaDescriptionLength: blog.metaDescription.length,
        internalLinksValidated: internalLinkValidation.valid,
        featuredSnippetOptimized: snippetOptimization.suggestions.length > 0
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
