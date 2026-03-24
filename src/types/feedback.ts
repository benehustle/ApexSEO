export interface Feedback {
  id: string;
  blogId?: string; // Optional - for keyword feedback, this might be empty
  keyword?: string; // For keyword-specific feedback
  siteId: string;
  userId: string;
  promptType: 'blog' | 'image' | 'headline' | 'keyword' | 'content-plan';
  rating: number; // 1-5 stars
  text?: string; // Optional text feedback
  createdAt: Date;
  analyzed: boolean; // Whether this feedback has been included in analysis
}

export interface PromptConfig {
  siteId: string;
  blogSystemPrompt: string;
  blogUserPromptTemplate: string;
  imagePromptTemplate: string;
  headlinePromptTemplate: string;
  version: number;
  updatedAt: Date;
  updatedBy: 'system' | 'user';
  changeLog: string[]; // History of improvements
}
