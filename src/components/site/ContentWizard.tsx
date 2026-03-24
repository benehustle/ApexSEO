import React, { useState, useEffect } from 'react';
import { X, Search, FileText, Calendar, CheckCircle2, Loader2, TrendingUp, Edit2, Save } from 'lucide-react';
import { Site } from '../../types/site';
import { collection, addDoc, Timestamp, onSnapshot, query, orderBy, serverTimestamp, updateDoc, doc } from 'firebase/firestore';
import { db } from '../../config/firebase';
import { useToast } from '../Toast';
import { format, addDays, startOfTomorrow } from 'date-fns';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../../config/firebase';

interface ContentWizardProps {
  siteId: string;
  site: Site;
  isOpen: boolean;
  onClose: () => void;
  onComplete?: () => void;
}

type WizardStep = 1 | 2 | 3;

interface TargetedKeyword {
  id: string;
  keyword: string;
  volume: number;
  difficulty: number;
  addedAt: Date;
}

interface ContentPlan {
  keyword: string;
  title: string;
  metaDescription: string;
  imagePrompt: string;
  blogDescription: string;
  isEditing?: boolean;
  editedTitle?: string;
  editedDescription?: string;
}

interface TopicCluster {
  pillar: { title: string; keyword: string };
  clusters: Array<{ title: string; keyword: string }>;
}

const SCHEDULE_STRATEGIES = [
  { value: 'daily', label: 'Daily (7 posts/week)', postsPerWeek: 7 },
  { value: '5x', label: '5x per week', postsPerWeek: 5 },
  { value: '3x', label: '3x per week', postsPerWeek: 3 },
  { value: '2x', label: '2x per week', postsPerWeek: 2 },
  { value: 'weekly', label: 'Weekly (1 post/week)', postsPerWeek: 1 },
];

export const ContentWizard: React.FC<ContentWizardProps> = ({
  siteId,
  site: _site,
  isOpen,
  onClose,
  onComplete,
}) => {
  const [step, setStep] = useState<WizardStep>(1);
  const [seedKeyword, setSeedKeyword] = useState('');
  const [targetedKeywords, setTargetedKeywords] = useState<TargetedKeyword[]>([]);
  const [selectedKeywordIds, setSelectedKeywordIds] = useState<Set<string>>(new Set());
  const [contentPlans, setContentPlans] = useState<ContentPlan[]>([]);
  const [scheduleStrategy, setScheduleStrategy] = useState('3x');
  const [isGeneratingKeywords, setIsGeneratingKeywords] = useState(false);
  const [searchProgress, setSearchProgress] = useState({ found: 0, attempts: 0 });
  const [isGeneratingTopics, setIsGeneratingTopics] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isGeneratingCluster, setIsGeneratingCluster] = useState(false);
  const [topicCluster, setTopicCluster] = useState<TopicCluster | null>(null);
  const [clusterMode, setClusterMode] = useState(false); // Toggle between keyword mode and cluster mode
  const { showToast } = useToast();

  // Real-time subscription to targetedKeywords collection
  useEffect(() => {
    if (!isOpen || !siteId) return;

    const keywordsRef = collection(db, 'sites', siteId, 'targetedKeywords');
    const q = query(keywordsRef, orderBy('addedAt', 'desc'));

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const keywords: TargetedKeyword[] = snapshot.docs.map((doc) => {
          const data = doc.data();
          return {
            id: doc.id,
            keyword: data.keyword,
            volume: data.volume || 0,
            difficulty: data.difficulty || 0,
            addedAt: data.addedAt?.toDate() || new Date(),
          };
        });
        setTargetedKeywords(keywords);
      },
      (err) => {
        console.error('Error fetching targeted keywords:', err);
        showToast('error', 'Failed to load keywords');
      }
    );

    return () => unsubscribe();
  }, [isOpen, siteId, showToast]);

  if (!isOpen) return null;

  // Step 1: Generate Keywords - Client-side loop
  const handleGenerateKeywords = async () => {
    if (!seedKeyword.trim()) {
      showToast('error', 'Please enter a seed keyword');
      return;
    }

    setIsGeneratingKeywords(true);
    setSearchProgress({ found: 0, attempts: 0 });

    const targetCount = 10;
    const maxAttempts = 5;
    let validKeywordsFound = 0;
    let attempts = 0;
    const allSeenKeywords: string[] = [];
    const savedInThisSession = new Set<string>(); // Track keywords saved in this session
    const targetedKeywordsRef = collection(db, 'sites', siteId, 'targetedKeywords');

    const getGeminiSuggestionsFn = httpsCallable(functions, 'getGeminiSuggestions');
    const checkKeywordMetricsFn = httpsCallable(functions, 'checkKeywordMetrics');

    try {
      while (validKeywordsFound < targetCount && attempts < maxAttempts) {
        attempts++;
        setSearchProgress({ found: validKeywordsFound, attempts });

        // Step 1: Get suggestions from Gemini
        const geminiResult = await getGeminiSuggestionsFn({
          seed: seedKeyword.trim(),
          avoidKeywords: allSeenKeywords,
        });

        const geminiData = geminiResult.data as { keywords: string[] };
        if (!geminiData || !geminiData.keywords || geminiData.keywords.length === 0) {
          console.warn(`[handleGenerateKeywords] No keywords from Gemini on attempt ${attempts}`);
          continue;
        }

        // Step 2: Check metrics from DataForSEO
        const metricsResult = await checkKeywordMetricsFn({
          keywords: geminiData.keywords,
          siteId: siteId, // Pass siteId to use targetCountry for location-specific metrics
        });

        const metricsData = metricsResult.data as {
          results: Array<{ keyword: string; volume: number; difficulty: number }>;
        };

        if (!metricsData || !metricsData.results || metricsData.results.length === 0) {
          console.warn(`[handleGenerateKeywords] No metrics from DataForSEO on attempt ${attempts} (credentials may not be configured)`);
          // Add to seen keywords anyway
          allSeenKeywords.push(...geminiData.keywords);
          // If this is the first attempt and we got no results, show a warning
          if (attempts === 1) {
            showToast('warning', 'DataForSEO credentials not configured. Keywords will be saved without metrics.');
          }
          continue;
        }

        // Step 3: Filter client-side (volume > 200, difficulty < 50)
        const goodOnes = metricsData.results.filter(
          (k) => k.volume > 200 && k.difficulty < 50
        );

        // Step 4: Save immediately to Firestore
        for (const goodOne of goodOnes) {
          // Check if we already have enough
          if (validKeywordsFound >= targetCount) break;

          // Check if keyword already exists (avoid duplicates)
          const keywordLower = goodOne.keyword.toLowerCase();
          const existsInState = targetedKeywords.some((kw) => kw.keyword.toLowerCase() === keywordLower);
          const existsInSession = savedInThisSession.has(keywordLower);
          
          if (existsInState || existsInSession) {
            console.log(`[handleGenerateKeywords] Skipping duplicate: ${goodOne.keyword}`);
            continue;
          }

          try {
            await addDoc(targetedKeywordsRef, {
              keyword: goodOne.keyword,
              volume: goodOne.volume,
              difficulty: goodOne.difficulty,
              addedAt: serverTimestamp(),
            });
            savedInThisSession.add(keywordLower);
            validKeywordsFound++;
            setSearchProgress({ found: validKeywordsFound, attempts });
          } catch (error: any) {
            console.error(`[handleGenerateKeywords] Failed to save keyword ${goodOne.keyword}:`, error);
            // Continue with next keyword
          }
        }

        // Update seen keywords for next iteration
        allSeenKeywords.push(...geminiData.keywords);

        // Small delay to avoid rate limits
        if (validKeywordsFound < targetCount && attempts < maxAttempts) {
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }
      }

      if (validKeywordsFound >= targetCount) {
        showToast('success', `Found ${validKeywordsFound} valid keywords!`);
      } else if (validKeywordsFound > 0) {
        showToast('warning', `Found ${validKeywordsFound} valid keywords (target: ${targetCount})`);
      } else {
        showToast('error', 'No valid keywords found. Try a different seed keyword.');
      }
    } catch (error: any) {
      console.error('Error generating keywords:', error);
      const errorMessage = error.message || error.details || 'Failed to generate keywords';
      showToast('error', errorMessage);
    } finally {
      setIsGeneratingKeywords(false);
      setSearchProgress({ found: 0, attempts: 0 });
    }
  };

  const handleToggleKeyword = (keywordId: string) => {
    setSelectedKeywordIds((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(keywordId)) {
        newSet.delete(keywordId);
      } else {
        newSet.add(keywordId);
      }
      return newSet;
    });
  };

  const handleSelectAllKeywords = () => {
    if (selectedKeywordIds.size === targetedKeywords.length) {
      setSelectedKeywordIds(new Set());
    } else {
      setSelectedKeywordIds(new Set(targetedKeywords.map((kw) => kw.id)));
    }
  };

  const handleNextToTopics = () => {
    const selected = targetedKeywords.filter((kw) => selectedKeywordIds.has(kw.id));
    if (selected.length === 0) {
      showToast('error', 'Please select at least one keyword');
      return;
    }
    setStep(2);
    handleGenerateTopics(selected.map((k) => k.keyword));
  };

  // Step 2: Generate Topics
  const handleGenerateTopics = async (keywordList: string[]) => {
    setIsGeneratingTopics(true);
    try {
      const generateContentPlanFn = httpsCallable(functions, 'generateContentPlanCallable');
      const result = await generateContentPlanFn({
        selectedKeywords: keywordList,
        tone: 'Professional',
      });

      const data = result.data as { contentPlans: Array<{ keyword: string; blogTopic: string; blogDescription: string; imagePrompt: string }> };

      if (!data || !data.contentPlans || data.contentPlans.length === 0) {
        showToast('error', 'No content plans generated. Please try again.');
        setContentPlans([]);
        return;
      }

      // Map response to ContentPlan interface
      const mappedPlans: ContentPlan[] = data.contentPlans.map((plan) => ({
        keyword: plan.keyword,
        title: plan.blogTopic,
        blogDescription: plan.blogDescription,
        imagePrompt: plan.imagePrompt,
        metaDescription: plan.blogDescription.substring(0, 155), // Use blogDescription as meta (truncated to 155 chars)
        isEditing: false,
      }));

      setContentPlans(mappedPlans);
      showToast('success', `Generated ${mappedPlans.length} content plans`);
    } catch (error: any) {
      console.error('Error generating topics:', error);
      const errorMessage = error.message || error.details || 'Failed to generate topics';
      showToast('error', errorMessage);
      setContentPlans([]);
    } finally {
      setIsGeneratingTopics(false);
    }
  };

  const handleEditTopic = (index: number) => {
    setContentPlans((prev) =>
      prev.map((plan, i) =>
        i === index
          ? {
              ...plan,
              isEditing: true,
              editedTitle: plan.title,
              editedDescription: plan.blogDescription,
            }
          : plan
      )
    );
  };

  const handleSaveTopic = (index: number) => {
    setContentPlans((prev) =>
      prev.map((plan, i) =>
        i === index
          ? {
              ...plan,
              title: plan.editedTitle || plan.title,
              blogDescription: plan.editedDescription || plan.blogDescription,
              isEditing: false,
            }
          : plan
      )
    );
  };

  const handleCancelEdit = (index: number) => {
    setContentPlans((prev) =>
      prev.map((plan, i) => (i === index ? { ...plan, isEditing: false } : plan))
    );
  };

  // Step 3: Schedule
  const handleSchedule = async () => {
    if (topicCluster) {
      // Schedule topic cluster with linking
      await handleScheduleCluster();
    } else if (contentPlans.length === 0) {
      showToast('error', 'No content plans to schedule');
      return;
    } else {
      // Schedule regular content plans
      await handleScheduleRegular();
    }
  };

  const handleScheduleRegular = async () => {
    setIsSaving(true);
    try {
      const strategy = SCHEDULE_STRATEGIES.find((s) => s.value === scheduleStrategy);
      if (!strategy) {
        throw new Error('Invalid schedule strategy');
      }

      const daysBetween = Math.floor(7 / strategy.postsPerWeek); // Days between posts
      const startDate = startOfTomorrow();
      const calendarRef = collection(db, 'sites', siteId, 'contentCalendar');

      const promises = contentPlans.map((plan, index) => {
        const scheduledDate = addDays(startDate, index * daysBetween);
        
        return addDoc(calendarRef, {
          blogTopic: plan.title,
          keyword: plan.keyword,
          blogDescription: plan.blogDescription,
          imagePrompt: plan.imagePrompt,
          metaDescription: plan.metaDescription,
          status: 'scheduled',
          scheduledDate: Timestamp.fromDate(scheduledDate),
          createdAt: Timestamp.now(),
          updatedAt: Timestamp.now(),
        });
      });

      await Promise.all(promises);

      showToast('success', `Successfully scheduled ${contentPlans.length} posts!`);
      onComplete?.();
      handleClose();
    } catch (error: any) {
      console.error('Error scheduling content:', error);
      showToast('error', error.message || 'Failed to schedule content');
    } finally {
      setIsSaving(false);
    }
  };

  const handleScheduleCluster = async () => {
    if (!topicCluster) return;

    setIsSaving(true);
    try {
      const calendarRef = collection(db, 'sites', siteId, 'contentCalendar');
      const startDate = startOfTomorrow();

      // Step 1: Save the Pillar post first
      const pillarDocRef = await addDoc(calendarRef, {
        blogTopic: topicCluster.pillar.title,
        keyword: topicCluster.pillar.keyword,
        blogDescription: `Comprehensive guide covering ${topicCluster.pillar.keyword}`,
        imagePrompt: `Professional illustration representing ${topicCluster.pillar.keyword}`,
        status: 'scheduled',
        scheduledDate: Timestamp.fromDate(startDate),
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
        isPillar: true,
        childClusterIds: [], // Will be updated after clusters are saved
      });

      const pillarId = pillarDocRef.id;
      console.log(`[handleScheduleCluster] Pillar saved with ID: ${pillarId}`);

      // Step 2: Save Cluster posts with parentPillarId and staggered dates
      const clusterPromises = topicCluster.clusters.map((cluster, index) => {
        const scheduledDate = addDays(startDate, (index + 1) * 2); // +2, +4, +6, +8 days
        
        return addDoc(calendarRef, {
          blogTopic: cluster.title,
          keyword: cluster.keyword,
          blogDescription: `Detailed guide on ${cluster.keyword}`,
          imagePrompt: `Professional illustration representing ${cluster.keyword}`,
          status: 'scheduled',
          scheduledDate: Timestamp.fromDate(scheduledDate),
          createdAt: Timestamp.now(),
          updatedAt: Timestamp.now(),
          parentPillarId: pillarId,
          isCluster: true,
        });
      });

      const clusterDocRefs = await Promise.all(clusterPromises);
      const clusterIds = clusterDocRefs.map((ref) => ref.id);
      console.log(`[handleScheduleCluster] Clusters saved with IDs: ${clusterIds.join(', ')}`);

      // Step 3: Update Pillar document with childClusterIds
      await updateDoc(doc(db, 'sites', siteId, 'contentCalendar', pillarId), {
        childClusterIds: clusterIds,
        updatedAt: Timestamp.now(),
      });

      console.log(`[handleScheduleCluster] Pillar updated with child cluster IDs`);

      showToast('success', `Successfully scheduled topic cluster: 1 pillar + ${clusterIds.length} clusters!`);
      onComplete?.();
      handleClose();
    } catch (error: any) {
      console.error('Error scheduling topic cluster:', error);
      showToast('error', error.message || 'Failed to schedule topic cluster');
    } finally {
      setIsSaving(false);
    }
  };

  // Topic Cluster Generation
  const handleGenerateCluster = async () => {
    if (!seedKeyword.trim()) {
      showToast('error', 'Please enter a seed keyword');
      return;
    }

    setIsGeneratingCluster(true);
    try {
      const generateClusterFn = httpsCallable(functions, 'generateTopicClusterCallable');
      const result = await generateClusterFn({
        seedKeyword: seedKeyword.trim(),
        siteId: siteId, // Pass siteId to include location context
      });

      const data = result.data as TopicCluster;
      if (!data || !data.pillar || !data.clusters || data.clusters.length !== 4) {
        showToast('error', 'Invalid cluster data received');
        return;
      }

      setTopicCluster(data);
      setStep(2); // Move to topics step to show the cluster
      showToast('success', 'Topic cluster generated successfully!');
    } catch (error: any) {
      console.error('Error generating topic cluster:', error);
      const errorMessage = error.message || error.details || 'Failed to generate topic cluster';
      showToast('error', errorMessage);
    } finally {
      setIsGeneratingCluster(false);
    }
  };

  const handleClose = () => {
    if (isGeneratingKeywords || isGeneratingTopics || isSaving || isGeneratingCluster) return;
    
    setStep(1);
    setSeedKeyword('');
    setSelectedKeywordIds(new Set());
    setContentPlans([]);
    setScheduleStrategy('3x');
    setSearchProgress({ found: 0, attempts: 0 });
    setTopicCluster(null);
    setClusterMode(false);
    onClose();
  };

  const selectedKeywordsCount = selectedKeywordIds.size;
  const selectedStrategy = SCHEDULE_STRATEGIES.find((s) => s.value === scheduleStrategy);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
      <div className="w-full max-w-5xl max-h-[90vh] bg-slate-900 border border-slate-700 rounded-xl shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-slate-700">
          <div className="flex items-center gap-3">
            <FileText className="w-6 h-6 text-blue-400" />
            <h2 className="text-2xl font-bold text-white">Content Generation Wizard</h2>
          </div>
          <button
            onClick={handleClose}
            disabled={isGeneratingKeywords || isGeneratingTopics || isSaving}
            className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Stepper */}
        <div className="px-6 py-4 border-b border-slate-700 bg-slate-800/50">
          <div className="flex items-center justify-between">
            {[1, 2, 3].map((stepNum) => (
              <React.Fragment key={stepNum}>
                <div className="flex items-center gap-2">
                  <div
                    className={`w-8 h-8 rounded-full flex items-center justify-center font-semibold transition-colors ${
                      step >= stepNum
                        ? 'bg-blue-600 text-white'
                        : 'bg-slate-700 text-slate-400'
                    }`}
                  >
                    {step > stepNum ? (
                      <CheckCircle2 className="w-5 h-5" />
                    ) : (
                      stepNum
                    )}
                  </div>
                  <span
                    className={`text-sm font-medium ${
                      step >= stepNum ? 'text-white' : 'text-slate-400'
                    }`}
                  >
                    {stepNum === 1 && 'Keywords'}
                    {stepNum === 2 && 'Topics'}
                    {stepNum === 3 && 'Schedule'}
                  </span>
                </div>
                {stepNum < 3 && (
                  <div
                    className={`flex-1 h-0.5 mx-4 ${
                      step > stepNum ? 'bg-blue-600' : 'bg-slate-700'
                    }`}
                  />
                )}
              </React.Fragment>
            ))}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {/* Step 1: Keyword Research */}
          {step === 1 && (
            <div className="space-y-6">
              {/* Mode Toggle */}
              <div className="flex gap-4 p-4 bg-slate-800 border border-slate-700 rounded-lg">
                <button
                  onClick={() => setClusterMode(false)}
                  className={`flex-1 px-4 py-2 rounded-lg font-medium transition-colors ${
                    !clusterMode
                      ? 'bg-blue-600 text-white'
                      : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                  }`}
                >
                  Keyword Research
                </button>
                <button
                  onClick={() => setClusterMode(true)}
                  className={`flex-1 px-4 py-2 rounded-lg font-medium transition-colors ${
                    clusterMode
                      ? 'bg-blue-600 text-white'
                      : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                  }`}
                >
                  Topic Cluster
                </button>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">
                  Seed Keyword
                </label>
                <div className="flex gap-3">
                  <input
                    type="text"
                    value={seedKeyword}
                    onChange={(e) => setSeedKeyword(e.target.value)}
                    placeholder="e.g., Landscaping"
                    className="flex-1 px-4 py-3 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    onKeyPress={(e) => {
                      if (e.key === 'Enter' && seedKeyword.trim()) {
                        if (clusterMode) {
                          handleGenerateCluster();
                        } else if (!isGeneratingKeywords) {
                          handleGenerateKeywords();
                        }
                      }
                    }}
                  />
                  {clusterMode ? (
                    <button
                      onClick={handleGenerateCluster}
                      disabled={!seedKeyword.trim() || isGeneratingCluster}
                      className="px-6 py-3 bg-purple-600 hover:bg-purple-700 disabled:bg-slate-700 disabled:text-slate-400 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors flex items-center gap-2"
                    >
                      {isGeneratingCluster ? (
                        <>
                          <Loader2 className="w-5 h-5 animate-spin" />
                          <span>Generating...</span>
                        </>
                      ) : (
                        <>
                          <TrendingUp className="w-5 h-5" />
                          <span>Generate Cluster</span>
                        </>
                      )}
                    </button>
                  ) : (
                    <button
                      onClick={handleGenerateKeywords}
                      disabled={!seedKeyword.trim() || isGeneratingKeywords}
                      className="px-6 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-700 disabled:text-slate-400 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors flex items-center gap-2"
                    >
                      {isGeneratingKeywords ? (
                        <>
                          <Loader2 className="w-5 h-5 animate-spin" />
                          <span>Generating...</span>
                        </>
                      ) : (
                        <>
                          <Search className="w-5 h-5" />
                          <span>Generate</span>
                        </>
                      )}
                    </button>
                  )}
                </div>
                <p className="mt-2 text-xs text-slate-400">
                  {clusterMode
                    ? 'Generate a structured topic cluster: 1 pillar + 4 supporting clusters'
                    : 'Keywords are filtered: Volume ≥ 200, Difficulty < 50'}
                </p>
              </div>

              {isGeneratingKeywords && (
                <div className="p-4 bg-slate-800 border border-slate-700 rounded-lg">
                  <div className="flex items-center gap-3 mb-2">
                    <Loader2 className="w-5 h-5 animate-spin text-blue-400" />
                    <span className="text-white font-medium">Searching...</span>
                  </div>
                  <p className="text-sm text-slate-400">
                    Found {searchProgress.found} valid keywords so far (Attempt {searchProgress.attempts}/5)
                  </p>
                </div>
              )}

              {targetedKeywords.length > 0 && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg font-semibold text-white">
                      Targeted Keywords ({selectedKeywordsCount} selected)
                    </h3>
                    <button
                      onClick={handleSelectAllKeywords}
                      className="px-4 py-2 text-sm text-blue-400 hover:text-blue-300 hover:bg-slate-800 rounded-lg transition-colors"
                    >
                      {selectedKeywordIds.size === targetedKeywords.length ? 'Deselect All' : 'Select All'}
                    </button>
                  </div>

                  <div className="grid grid-cols-1 gap-3 max-h-[400px] overflow-y-auto">
                    {targetedKeywords.map((kw) => (
                      <div
                        key={kw.id}
                        className={`p-4 bg-slate-800 border rounded-lg transition-colors ${
                          selectedKeywordIds.has(kw.id)
                            ? 'border-blue-500 bg-blue-500/10'
                            : 'border-slate-700 hover:border-slate-600'
                        }`}
                      >
                        <div className="flex items-start gap-4">
                          <input
                            type="checkbox"
                            checked={selectedKeywordIds.has(kw.id)}
                            onChange={() => handleToggleKeyword(kw.id)}
                            className="mt-1 w-5 h-5 text-blue-600 bg-slate-700 border-slate-600 rounded focus:ring-blue-500 focus:ring-2"
                          />
                          <div className="flex-1">
                            <h4 className="font-semibold text-white mb-2">{kw.keyword}</h4>
                            <div className="flex items-center gap-4 text-sm">
                              <div className="flex items-center gap-1 text-slate-400">
                                <TrendingUp className="w-4 h-4" />
                                <span>{kw.volume.toLocaleString()}/mo</span>
                              </div>
                              <div className="text-slate-400">
                                Difficulty: <span className="text-slate-300">{kw.difficulty}</span>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  {targetedKeywords.length > 0 && (
                    <button
                      onClick={handleNextToTopics}
                      disabled={selectedKeywordsCount === 0}
                      className="w-full px-6 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-700 disabled:text-slate-400 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors"
                    >
                      Continue to Topics ({selectedKeywordsCount} selected)
                    </button>
                  )}
                </div>
              )}

              {!isGeneratingKeywords && targetedKeywords.length === 0 && (
                <div className="text-center py-8 text-slate-400">
                  <p>No keywords found yet. Enter a seed keyword and click "Generate" to start searching.</p>
                </div>
              )}
            </div>
          )}

          {/* Step 2: Topic Generation */}
          {step === 2 && (
            <div className="space-y-6">
              {topicCluster ? (
                // Display Topic Cluster
                <>
                  <div>
                    <h3 className="text-lg font-semibold text-white mb-2">
                      Topic Cluster Plan
                    </h3>
                    <p className="text-sm text-slate-400">
                      Review the pillar and cluster topics. Posts will be scheduled with 2-day intervals.
                    </p>
                  </div>

                  <div className="space-y-4 max-h-[450px] overflow-y-auto">
                    {/* Pillar */}
                    <div className="p-5 bg-gradient-to-r from-purple-900/30 to-blue-900/30 border-2 border-purple-500 rounded-lg">
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <span className="px-2 py-1 text-xs font-semibold text-purple-300 bg-purple-500/20 rounded">
                            PILLAR
                          </span>
                        </div>
                        <span className="text-sm text-slate-400">
                          Scheduled: {format(startOfTomorrow(), 'MMM d, yyyy')}
                        </span>
                      </div>
                      <h4 className="font-semibold text-white mb-1">{topicCluster.pillar.title}</h4>
                      <p className="text-sm text-slate-400">Keyword: {topicCluster.pillar.keyword}</p>
                    </div>

                    {/* Clusters */}
                    {topicCluster.clusters.map((cluster, index) => {
                      const scheduledDate = addDays(startOfTomorrow(), (index + 1) * 2);
                      return (
                        <div
                          key={index}
                          className="p-5 bg-slate-800 border border-slate-700 rounded-lg"
                        >
                          <div className="flex items-start justify-between mb-2">
                            <div className="flex items-center gap-2">
                              <span className="px-2 py-1 text-xs font-semibold text-blue-300 bg-blue-500/20 rounded">
                                CLUSTER {index + 1}
                              </span>
                            </div>
                            <span className="text-sm text-slate-400">
                              Scheduled: {format(scheduledDate, 'MMM d, yyyy')}
                            </span>
                          </div>
                          <h4 className="font-semibold text-white mb-1">{cluster.title}</h4>
                          <p className="text-sm text-slate-400">Keyword: {cluster.keyword}</p>
                        </div>
                      );
                    })}
                  </div>

                  {/* Action Button for Topic Cluster */}
                  <div className="pt-4 border-t border-slate-700">
                    <button
                      onClick={() => setStep(3)}
                      disabled={isSaving}
                      className="w-full px-6 py-3 bg-purple-600 hover:bg-purple-700 disabled:bg-slate-700 disabled:text-slate-400 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors flex items-center justify-center gap-2"
                    >
                      {isSaving ? (
                        <>
                          <Loader2 className="w-5 h-5 animate-spin" />
                          <span>Scheduling...</span>
                        </>
                      ) : (
                        <>
                          <Calendar className="w-5 h-5" />
                          <span>Review & Schedule Cluster</span>
                        </>
                      )}
                    </button>
                  </div>
                </>
              ) : isGeneratingTopics ? (
                <div className="flex flex-col items-center justify-center py-12 space-y-4">
                  <Loader2 className="w-12 h-12 animate-spin text-blue-400" />
                  <p className="text-lg font-semibold text-white">Generating content plans...</p>
                  <p className="text-sm text-slate-400">Creating titles, descriptions, and image prompts</p>
                </div>
              ) : (
                <>
                  <div>
                    <h3 className="text-lg font-semibold text-white mb-2">
                      Proposed Content Plans
                    </h3>
                    <p className="text-sm text-slate-400">
                      Review and edit the generated topics before scheduling
                    </p>
                  </div>

                  <div className="space-y-4 max-h-[450px] overflow-y-auto">
                    {contentPlans.map((plan, index) => (
                      <div
                        key={index}
                        className="p-5 bg-slate-800 border border-slate-700 rounded-lg"
                      >
                        {plan.isEditing ? (
                          <div className="space-y-4">
                            <div>
                              <label className="block text-sm font-medium text-slate-300 mb-2">
                                Title
                              </label>
                              <input
                                type="text"
                                value={plan.editedTitle || plan.title}
                                onChange={(e) =>
                                  setContentPlans((prev) =>
                                    prev.map((p, i) =>
                                      i === index
                                        ? { ...p, editedTitle: e.target.value }
                                        : p
                                    )
                                  )
                                }
                                className="w-full px-4 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                              />
                            </div>
                            <div>
                              <label className="block text-sm font-medium text-slate-300 mb-2">
                                Description
                              </label>
                              <textarea
                                value={plan.editedDescription || plan.blogDescription}
                                onChange={(e) =>
                                  setContentPlans((prev) =>
                                    prev.map((p, i) =>
                                      i === index
                                        ? { ...p, editedDescription: e.target.value }
                                        : p
                                    )
                                  )
                                }
                                rows={3}
                                className="w-full px-4 py-2 bg-slate-900 border border-slate-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                              />
                            </div>
                            <div className="flex gap-2">
                              <button
                                onClick={() => handleSaveTopic(index)}
                                className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors flex items-center gap-2"
                              >
                                <Save className="w-4 h-4" />
                                Save
                              </button>
                              <button
                                onClick={() => handleCancelEdit(index)}
                                className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition-colors"
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div>
                            <div className="flex items-start justify-between mb-3">
                              <div className="flex-1">
                                <h4 className="font-semibold text-white mb-2">{plan.title}</h4>
                                <p className="text-sm text-slate-400 mb-3">{plan.blogDescription}</p>
                                <div className="flex items-center gap-4 text-xs text-slate-500">
                                  <span>Keyword: {plan.keyword}</span>
                                  <span>Meta: {plan.metaDescription.substring(0, 50)}...</span>
                                </div>
                              </div>
                              <button
                                onClick={() => handleEditTopic(index)}
                                className="p-2 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg transition-colors"
                                title="Edit"
                              >
                                <Edit2 className="w-4 h-4" />
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>

                  {topicCluster ? (
                    <button
                      onClick={() => setStep(3)}
                      className="w-full px-6 py-3 bg-purple-600 hover:bg-purple-700 text-white font-medium rounded-lg transition-colors flex items-center justify-center gap-2"
                    >
                      <Calendar className="w-5 h-5" />
                      Approve & Schedule Cluster
                    </button>
                  ) : (
                    <button
                      onClick={() => setStep(3)}
                      className="w-full px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors"
                    >
                      Continue to Scheduling
                    </button>
                  )}
                </>
              )}
            </div>
          )}

          {/* Step 3: Scheduling */}
          {step === 3 && (
            <div className="space-y-6">
              {topicCluster ? (
                // Cluster scheduling - fixed intervals
                <>
                  <div>
                    <h3 className="text-lg font-semibold text-white mb-2">Topic Cluster Schedule</h3>
                    <p className="text-sm text-slate-400 mb-4">
                      Posts will be scheduled with 2-day intervals. The pillar post will be published first, followed by clusters.
                    </p>
                  </div>

                  <div className="p-4 bg-slate-800 border border-slate-700 rounded-lg">
                    <div className="flex items-center gap-2 text-sm text-slate-300 mb-4">
                      <Calendar className="w-4 h-4" />
                      <span className="font-medium">Schedule Preview</span>
                    </div>
                    <div className="space-y-3">
                      {/* Pillar */}
                      <div className="flex items-center justify-between p-3 bg-gradient-to-r from-purple-900/20 to-blue-900/20 border border-purple-500/30 rounded-lg">
                        <div className="flex items-center gap-3">
                          <span className="px-2 py-1 text-xs font-semibold text-purple-300 bg-purple-500/20 rounded">
                            PILLAR
                          </span>
                          <span className="text-white font-medium">{topicCluster.pillar.title}</span>
                        </div>
                        <span className="text-slate-300">{format(startOfTomorrow(), 'MMM d, yyyy')}</span>
                      </div>

                      {/* Clusters */}
                      {topicCluster.clusters.map((cluster, index) => {
                        const scheduledDate = addDays(startOfTomorrow(), (index + 1) * 2);
                        return (
                          <div
                            key={index}
                            className="flex items-center justify-between p-3 bg-slate-700/50 border border-slate-600 rounded-lg"
                          >
                            <div className="flex items-center gap-3">
                              <span className="px-2 py-1 text-xs font-semibold text-blue-300 bg-blue-500/20 rounded">
                                CLUSTER {index + 1}
                              </span>
                              <span className="text-white">{cluster.title}</span>
                            </div>
                            <span className="text-slate-300">{format(scheduledDate, 'MMM d, yyyy')}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  <div className="flex gap-3 pt-4 border-t border-slate-700">
                    <button
                      onClick={() => setStep(2)}
                      className="px-6 py-3 bg-slate-700 hover:bg-slate-600 text-white font-medium rounded-lg transition-colors"
                    >
                      Back
                    </button>
                    <button
                      onClick={handleSchedule}
                      disabled={isSaving}
                      className="flex-1 px-6 py-3 bg-purple-600 hover:bg-purple-700 disabled:bg-slate-700 disabled:text-slate-400 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors flex items-center justify-center gap-2"
                    >
                      {isSaving ? (
                        <>
                          <Loader2 className="w-5 h-5 animate-spin" />
                          <span>Scheduling...</span>
                        </>
                      ) : (
                        <>
                          <CheckCircle2 className="w-5 h-5" />
                          <span>Approve & Schedule Cluster</span>
                        </>
                      )}
                    </button>
                  </div>
                </>
              ) : (
                // Regular scheduling
                <>
                  <div>
                    <h3 className="text-lg font-semibold text-white mb-2">Schedule Strategy</h3>
                    <p className="text-sm text-slate-400 mb-4">
                      Choose how often you want to publish these {contentPlans.length} posts
                    </p>

                <div className="grid grid-cols-1 gap-3">
                  {SCHEDULE_STRATEGIES.map((strategy) => (
                    <label
                      key={strategy.value}
                      className={`p-4 border rounded-lg cursor-pointer transition-colors ${
                        scheduleStrategy === strategy.value
                          ? 'border-blue-500 bg-blue-500/10'
                          : 'border-slate-700 hover:border-slate-600 bg-slate-800'
                      }`}
                    >
                      <input
                        type="radio"
                        name="schedule"
                        value={strategy.value}
                        checked={scheduleStrategy === strategy.value}
                        onChange={(e) => setScheduleStrategy(e.target.value)}
                        className="sr-only"
                      />
                      <div className="flex items-center gap-3">
                        <div
                          className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                            scheduleStrategy === strategy.value
                              ? 'border-blue-500'
                              : 'border-slate-600'
                          }`}
                        >
                          {scheduleStrategy === strategy.value && (
                            <div className="w-3 h-3 rounded-full bg-blue-500" />
                          )}
                        </div>
                        <div>
                          <div className="font-medium text-white">{strategy.label}</div>
                          <div className="text-xs text-slate-400">
                            {contentPlans.length} posts will be scheduled over{' '}
                            {Math.ceil(contentPlans.length / strategy.postsPerWeek)} weeks
                          </div>
                        </div>
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              <div className="p-4 bg-slate-800 border border-slate-700 rounded-lg">
                <div className="flex items-center gap-2 text-sm text-slate-300 mb-2">
                  <Calendar className="w-4 h-4" />
                  <span className="font-medium">Schedule Preview</span>
                </div>
                <div className="space-y-2 text-sm">
                  {contentPlans.slice(0, 5).map((plan, index) => {
                    const daysBetween = selectedStrategy
                      ? Math.floor(7 / selectedStrategy.postsPerWeek)
                      : 2;
                    const date = addDays(startOfTomorrow(), index * daysBetween);
                    return (
                      <div key={index} className="flex items-center justify-between text-slate-400">
                        <span className="truncate">{plan.title}</span>
                        <span className="text-slate-300">{format(date, 'MMM d, yyyy')}</span>
                      </div>
                    );
                  })}
                  {contentPlans.length > 5 && (
                    <div className="text-slate-500 text-xs pt-2">
                      +{contentPlans.length - 5} more posts
                    </div>
                  )}
                </div>
              </div>

              <div className="flex gap-3 pt-4 border-t border-slate-700">
                <button
                  onClick={() => setStep(2)}
                  className="px-6 py-3 bg-slate-700 hover:bg-slate-600 text-white font-medium rounded-lg transition-colors"
                >
                  Back
                </button>
                <button
                  onClick={handleSchedule}
                  disabled={isSaving}
                  className="flex-1 px-6 py-3 bg-green-600 hover:bg-green-700 disabled:bg-slate-700 disabled:text-slate-400 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors flex items-center justify-center gap-2"
                >
                  {isSaving ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      <span>Scheduling...</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-5 h-5" />
                      <span>Confirm & Schedule</span>
                    </>
                  )}
                </button>
              </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
