import React, { useState } from 'react';
import { X, Sparkles, Loader2, CheckCircle2, Calendar, TrendingUp } from 'lucide-react';
import { aiService } from '../../services/ai.service';
import { Site } from '../../types/site';
import { collection, addDoc, Timestamp } from 'firebase/firestore';
import { db } from '../../config/firebase';
import { useToast } from '../Toast';
import { addDays, startOfTomorrow } from 'date-fns';

interface ContentGenerationWizardProps {
  siteId: string;
  site: Site;
  isOpen: boolean;
  onClose: () => void;
  onComplete?: () => void;
}

type WizardStep = 'input' | 'processing' | 'review';

interface GeneratedTopic {
  title: string;
  keyword: string;
  searchVolume?: number;
  difficulty?: number;
  selected: boolean;
}

const TONE_OPTIONS = [
  { value: 'professional', label: 'Professional' },
  { value: 'casual', label: 'Casual' },
  { value: 'urgent', label: 'Urgent' },
];

const PROCESSING_STEPS = [
  'Analyzing search volume...',
  'Checking keyword difficulty...',
  'Drafting topic ideas...',
  'Optimizing for SEO...',
  'Finalizing suggestions...',
];

export const ContentGenerationWizard: React.FC<ContentGenerationWizardProps> = ({
  siteId,
  site,
  isOpen,
  onClose,
  onComplete,
}) => {
  const [step, setStep] = useState<WizardStep>('input');
  const [seedKeyword, setSeedKeyword] = useState('');
  const [tone, setTone] = useState('professional');
  const [topics, setTopics] = useState<GeneratedTopic[]>([]);
  const [processingStep, setProcessingStep] = useState(0);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const { showToast } = useToast();

  if (!isOpen) return null;

  const handleGenerate = async () => {
    if (!seedKeyword.trim()) {
      showToast('error', 'Please enter a seed keyword');
      return;
    }

    setIsGenerating(true);
    setStep('processing');
    setProcessingStep(0);

    // Simulate processing steps
    const stepInterval = setInterval(() => {
      setProcessingStep((prev) => {
        if (prev >= PROCESSING_STEPS.length - 1) {
          clearInterval(stepInterval);
          return prev;
        }
        return prev + 1;
      });
    }, 1500);

    try {
      // Generate blog ideas using the AI service
      const ideas = await aiService.generateBlogIdeas(site, 15);

      // Transform ideas into topics with mock data
      const generatedTopics: GeneratedTopic[] = ideas.map((idea) => {
        // Extract keyword from title (simplified - could be improved)
        const keyword = idea.split(':')[0]?.trim() || seedKeyword;
        
        return {
          title: idea,
          keyword: keyword,
          searchVolume: Math.floor(Math.random() * 5000) + 200, // Mock: 200-5200
          difficulty: Math.floor(Math.random() * 50) + 20, // Mock: 20-70
          selected: true,
        };
      });

      clearInterval(stepInterval);
      setProcessingStep(PROCESSING_STEPS.length - 1);
      
      // Small delay to show final step
      setTimeout(() => {
        setTopics(generatedTopics);
        setStep('review');
        setIsGenerating(false);
      }, 500);
    } catch (error: any) {
      clearInterval(stepInterval);
      console.error('Error generating topics:', error);
      showToast('error', error.message || 'Failed to generate topics');
      setStep('input');
      setIsGenerating(false);
    }
  };

  const handleToggleTopic = (index: number) => {
    setTopics((prev) =>
      prev.map((topic, i) =>
        i === index ? { ...topic, selected: !topic.selected } : topic
      )
    );
  };

  const handleSelectAll = () => {
    const allSelected = topics.every((t) => t.selected);
    setTopics((prev) => prev.map((t) => ({ ...t, selected: !allSelected })));
  };

  const handleAddToCalendar = async () => {
    const selectedTopics = topics.filter((t) => t.selected);
    
    if (selectedTopics.length === 0) {
      showToast('error', 'Please select at least one topic');
      return;
    }

    setIsSaving(true);

    try {
      const calendarRef = collection(db, 'sites', siteId, 'contentCalendar');
      const startDate = startOfTomorrow(); // Start from tomorrow
      const daysBetween = 2; // 1 post every 2 days

      const promises = selectedTopics.map((topic, index) => {
        const scheduledDate = addDays(startDate, index * daysBetween);
        
        return addDoc(calendarRef, {
          blogTopic: topic.title,
          keyword: topic.keyword,
          blogDescription: `A comprehensive guide about ${topic.keyword} for ${site.name}.`,
          status: 'scheduled',
          scheduledDate: Timestamp.fromDate(scheduledDate),
          createdAt: Timestamp.now(),
          updatedAt: Timestamp.now(),
        });
      });

      await Promise.all(promises);

      showToast('success', `Successfully added ${selectedTopics.length} topics to calendar!`);
      onComplete?.();
      handleClose();
    } catch (error: any) {
      console.error('Error adding to calendar:', error);
      showToast('error', error.message || 'Failed to add topics to calendar');
    } finally {
      setIsSaving(false);
    }
  };

  const handleClose = () => {
    if (isGenerating || isSaving) return; // Prevent closing during operations
    
    setStep('input');
    setSeedKeyword('');
    setTone('professional');
    setTopics([]);
    setProcessingStep(0);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
      <div className="w-full max-w-4xl max-h-[90vh] bg-slate-900 border border-slate-700 rounded-xl shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-slate-700">
          <div className="flex items-center gap-3">
            <Sparkles className="w-6 h-6 text-blue-400" />
            <h2 className="text-2xl font-bold text-white">Generate New Content</h2>
          </div>
          <button
            onClick={handleClose}
            disabled={isGenerating || isSaving}
            className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {/* Step 1: Input */}
          {step === 'input' && (
            <div className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Seed Keyword
                </label>
                <input
                  type="text"
                  value={seedKeyword}
                  onChange={(e) => setSeedKeyword(e.target.value)}
                  placeholder="e.g., Roofing Services"
                  className="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  onKeyPress={(e) => {
                    if (e.key === 'Enter' && seedKeyword.trim()) {
                      handleGenerate();
                    }
                  }}
                />
                <p className="mt-2 text-xs text-slate-400">
                  Enter a keyword to generate related blog topic ideas
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Tone
                </label>
                <select
                  value={tone}
                  onChange={(e) => setTone(e.target.value)}
                  className="w-full px-4 py-3 bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  {TONE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>

              <button
                onClick={handleGenerate}
                disabled={!seedKeyword.trim() || isGenerating}
                className="w-full px-6 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-700 disabled:text-slate-400 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors flex items-center justify-center gap-2"
              >
                <Sparkles className="w-5 h-5" />
                <span>Generate Ideas</span>
              </button>
            </div>
          )}

          {/* Step 2: Processing */}
          {step === 'processing' && (
            <div className="flex flex-col items-center justify-center py-12 space-y-6">
              <Loader2 className="w-12 h-12 animate-spin text-blue-400" />
              <div className="text-center space-y-2">
                <p className="text-lg font-semibold text-white">
                  {PROCESSING_STEPS[processingStep] || 'Processing...'}
                </p>
                <div className="w-64 h-2 bg-slate-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-blue-600 transition-all duration-500"
                    style={{
                      width: `${((processingStep + 1) / PROCESSING_STEPS.length) * 100}%`,
                    }}
                  />
                </div>
              </div>
            </div>
          )}

          {/* Step 3: Review & Schedule */}
          {step === 'review' && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-semibold text-white">
                    Review & Schedule Topics
                  </h3>
                  <p className="text-sm text-slate-400 mt-1">
                    {topics.filter((t) => t.selected).length} of {topics.length} selected
                  </p>
                </div>
                <button
                  onClick={handleSelectAll}
                  className="px-4 py-2 text-sm text-blue-400 hover:text-blue-300 hover:bg-slate-800 rounded-lg transition-colors"
                >
                  {topics.every((t) => t.selected) ? 'Deselect All' : 'Select All'}
                </button>
              </div>

              <div className="space-y-3 max-h-[400px] overflow-y-auto">
                {topics.map((topic, index) => (
                  <div
                    key={index}
                    className={`p-4 bg-slate-800 border rounded-lg transition-colors ${
                      topic.selected
                        ? 'border-blue-500 bg-blue-500/10'
                        : 'border-slate-700 hover:border-slate-600'
                    }`}
                  >
                    <div className="flex items-start gap-4">
                      <input
                        type="checkbox"
                        checked={topic.selected}
                        onChange={() => handleToggleTopic(index)}
                        className="mt-1 w-5 h-5 text-blue-600 bg-slate-700 border-slate-600 rounded focus:ring-blue-500 focus:ring-2"
                      />
                      <div className="flex-1">
                        <h4 className="font-semibold text-white mb-2">{topic.title}</h4>
                        <div className="flex items-center gap-4 text-sm">
                          <div className="flex items-center gap-1 text-slate-400">
                            <span className="font-medium">Keyword:</span>
                            <span className="text-slate-300">{topic.keyword}</span>
                          </div>
                          {topic.searchVolume && (
                            <div className="flex items-center gap-1 text-slate-400">
                              <TrendingUp className="w-4 h-4" />
                              <span>{topic.searchVolume.toLocaleString()}/mo</span>
                            </div>
                          )}
                          {topic.difficulty && (
                            <div className="flex items-center gap-1 text-slate-400">
                              <span>Difficulty: {topic.difficulty}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex items-center gap-4 pt-4 border-t border-slate-700">
                <div className="flex-1 text-sm text-slate-400">
                  <Calendar className="w-4 h-4 inline mr-2" />
                  Posts will be scheduled every 2 days starting tomorrow
                </div>
                <button
                  onClick={handleAddToCalendar}
                  disabled={isSaving || topics.filter((t) => t.selected).length === 0}
                  className="px-6 py-3 bg-green-600 hover:bg-green-700 disabled:bg-slate-700 disabled:text-slate-400 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors flex items-center gap-2"
                >
                  {isSaving ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      <span>Adding...</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-5 h-5" />
                      <span>Add to Calendar</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
