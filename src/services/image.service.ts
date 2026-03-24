import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { storage } from '../config/firebase';
import { Blog } from '../types/blog';
import { Site } from '../types/site';
import { promptService } from './prompt.service';

export class ImageGenerationService {
  private apiKey: string;

  constructor() {
    this.apiKey = import.meta.env.VITE_OPENAI_API_KEY;
  }

  async generateFeaturedImage(params: {
    blogTitle: string;
    blogSummary: string;
    industry: string;
    style: string;
    siteId: string;
  }): Promise<Blob> {
    if (!this.apiKey) {
      throw new Error('OpenAI API key is not configured');
    }

    const prompt = await this.createImagePrompt(params);

    const response = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`
      },
      body: JSON.stringify({
        model: 'dall-e-3',
        prompt,
        n: 1,
        size: '1792x1024',
        quality: 'standard'
      })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: { message: 'Unknown error' } }));
      throw new Error(`Failed to generate image: ${errorData.error?.message || response.statusText}`);
    }

    const data = await response.json();
    const imageUrl = data.data[0].url;

    // Fetch the image and convert to blob
    const imageResponse = await fetch(imageUrl);
    if (!imageResponse.ok) {
      throw new Error('Failed to fetch generated image');
    }
    const blob = await imageResponse.blob();

    return this.optimizeImage(blob);
  }

  private async createImagePrompt(params: {
    blogTitle: string;
    blogSummary: string;
    industry: string;
    style: string;
    siteId: string;
  }): Promise<string> {
    try {
      const prompts = await promptService.getPrompts(params.siteId);
      return prompts.imagePromptTemplate
        .replace(/{blogTitle}/g, params.blogTitle)
        .replace(/{blogSummary}/g, params.blogSummary)
        .replace(/{industry}/g, params.industry)
        .replace(/{style}/g, params.style);
    } catch (error) {
      console.error('Failed to load image prompt template, using default:', error);
      // Fallback to default
      return `Create a professional, high-quality featured image for a blog post.

Title: ${params.blogTitle}
Summary: ${params.blogSummary}
Industry: ${params.industry}
Style: ${params.style}

Requirements:
- Professional and visually appealing
- No text or words in the image
- Relevant to the blog topic
- Modern and clean design
- Suitable for ${params.industry} industry
- ${params.style} style`;
    }
  }

  private async optimizeImage(blob: Blob): Promise<Blob> {
    return new Promise((resolve, reject) => {
      // Create image element
      const img = new Image();
      const url = URL.createObjectURL(blob);
      
      img.onload = () => {
        try {
          // Create canvas and resize
          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d');
          
          if (!ctx) {
            URL.revokeObjectURL(url);
            reject(new Error('Failed to get canvas context'));
            return;
          }
          
          const maxWidth = 1200;
          const maxHeight = 630;
          let { width, height } = img;

          if (width > maxWidth) {
            height = (height * maxWidth) / width;
            width = maxWidth;
          }
          if (height > maxHeight) {
            width = (width * maxHeight) / height;
            height = maxHeight;
          }

          canvas.width = width;
          canvas.height = height;
          ctx.drawImage(img, 0, 0, width, height);

          // Convert to blob
          canvas.toBlob(
            (optimizedBlob) => {
              URL.revokeObjectURL(url);
              if (optimizedBlob) {
                resolve(optimizedBlob);
              } else {
                reject(new Error('Failed to optimize image'));
              }
            },
            'image/webp',
            0.85
          );
        } catch (error) {
          URL.revokeObjectURL(url);
          reject(error);
        }
      };

      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error('Failed to load image for optimization'));
      };

      img.src = url;
    });
  }

  async uploadToStorage(imageBlob: Blob, path: string): Promise<string> {
    try {
      const storageRef = ref(storage, path);
      await uploadBytes(storageRef, imageBlob);
      const downloadURL = await getDownloadURL(storageRef);
      return downloadURL;
    } catch (error) {
      throw new Error(`Failed to upload image to storage: ${error}`);
    }
  }

  async generateAndUpload(blog: Partial<Blog>, site: Site): Promise<string> {
    if (!blog.title || !blog.excerpt) {
      throw new Error('Blog title and excerpt are required for image generation');
    }

    const imageBlob = await this.generateFeaturedImage({
      blogTitle: blog.title,
      blogSummary: blog.excerpt,
      industry: site.industry,
      style: 'modern professional',
      siteId: site.id
    });

    const path = `sites/${site.id}/blog-images/${Date.now()}.webp`;
    const url = await this.uploadToStorage(imageBlob, path);

    return url;
  }
}

export const imageService = new ImageGenerationService();
