import React, { useState, useEffect } from 'react';
import { keywordService, KeywordAnalysis } from '../services/keyword.service';
import { blogOrchestrator } from '../services/blog.orchestrator';
import { useAuth } from '../hooks/useAuth';
import { useAgencyContext } from '../contexts/AgencyContext';
import { siteService } from '../services/site.service';
import { Site } from '../types/site';
import { Search, TrendingUp, FileText, ExternalLink, Sparkles, MessageSquare } from 'lucide-react';
import { FeedbackForm } from '../components/feedback/FeedbackForm';

export const KeywordResearch: React.FC = () => {
  const [keyword, setKeyword] = useState('');
  const [selectedSite, setSelectedSite] = useState('');
  const [results, setResults] = useState<KeywordAnalysis | null>(null);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [sites, setSites] = useState<Site[]>([]);
  const [showFeedback, setShowFeedback] = useState(false);
  const { user } = useAuth();
  const { agencyId, loading: agencyLoading } = useAgencyContext();

  useEffect(() => {
    if (!agencyLoading) {
      loadSites();
    }
  }, [user, agencyId, agencyLoading]);

  const loadSites = async () => {
    if (!user || agencyLoading) return;
    try {
      const sitesData = await siteService.getUserSites(user.uid, agencyId);
      setSites(sitesData);
      if (sitesData.length > 0) setSelectedSite(sitesData[0].id);
    } catch (error) {
      console.error('Failed to load sites:', error);
    }
  };

  const handleSearch = async () => {
    if (!keyword || !selectedSite) return;
    
    setLoading(true);
    try {
      const site = sites.find(s => s.id === selectedSite);
      if (!site) return;
      
      const analysis = await keywordService.analyzeKeyword(keyword, site.url);
      setResults(analysis);
    } catch (error: any) {
      alert('Failed to analyze keyword: ' + (error.message || error));
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateSuggestions = async () => {
    if (!selectedSite) {
      alert('Please select a site first');
      return;
    }
    
    setLoadingSuggestions(true);
    try {
      const site = sites.find(s => s.id === selectedSite);
      if (!site) return;
      
      const seedKeyword = keyword || site.primaryKeywords[0] || site.industry;
      const generated = await keywordService.generateKeywords(
        seedKeyword,
        site.industry,
        20
      );
      setSuggestions(generated);
    } catch (error: any) {
      alert('Failed to generate suggestions: ' + (error.message || error));
    } finally {
      setLoadingSuggestions(false);
    }
  };

  const handleGenerateBlog = async () => {
    if (!results || !selectedSite) return;
    
    if (confirm(`Generate a blog post for keyword: "${results.keyword}"?`)) {
      try {
        const scheduledDate = new Date();
        scheduledDate.setDate(scheduledDate.getDate() + 1);
        scheduledDate.setHours(9, 0, 0, 0);
        
        await blogOrchestrator.generateSingleBlog({
          siteId: selectedSite,
          keyword: results.keyword,
          scheduledDate
        });
        
        alert('✅ Blog generated successfully! Check your content calendar.');
        setResults(null);
        setKeyword('');
      } catch (error: any) {
        alert('❌ Failed to generate blog: ' + (error.message || error));
      }
    }
  };

  const getDifficultyColor = (difficulty: number) => {
    if (difficulty < 40) return 'bg-green-100 text-green-800 border-green-200';
    if (difficulty < 60) return 'bg-yellow-100 text-yellow-800 border-yellow-200';
    return 'bg-red-100 text-red-800 border-red-200';
  };

  const getDifficultyLabel = (difficulty: number) => {
    if (difficulty < 40) return 'Easy';
    if (difficulty < 60) return 'Medium';
    return 'Hard';
  };

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-gray-900">Keyword Research</h1>
          <p className="text-gray-600">Discover high-opportunity keywords for your content</p>
        </div>

        {/* Search Bar */}
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="md:col-span-2">
              <label className="block text-sm font-medium mb-2">Keyword</label>
              <input
                type="text"
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                placeholder="Enter keyword to analyze..."
                className="input-field"
                onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">Site</label>
              <select
                value={selectedSite}
                onChange={(e) => setSelectedSite(e.target.value)}
                className="input-field"
                disabled={sites.length === 0}
              >
                {sites.length === 0 ? (
                  <option value="">No sites available</option>
                ) : (
                  sites.map(site => (
                    <option key={site.id} value={site.id}>{site.name}</option>
                  ))
                )}
              </select>
            </div>
            <div className="flex items-end">
              <button
                onClick={handleSearch}
                disabled={loading || !keyword || !selectedSite}
                className="btn-primary w-full flex items-center justify-center space-x-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Search className="w-5 h-5" />
                <span>{loading ? 'Analyzing...' : 'Analyze'}</span>
              </button>
            </div>
          </div>

          <button
            onClick={handleGenerateSuggestions}
            disabled={loadingSuggestions || !selectedSite}
            className="mt-4 btn-secondary flex items-center space-x-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Sparkles className="w-4 h-4" />
            <span>{loadingSuggestions ? 'Generating...' : 'Generate Keyword Ideas'}</span>
          </button>
        </div>

        {/* Keyword Suggestions */}
        {suggestions.length > 0 && (
          <div className="bg-white rounded-lg shadow p-6 mb-6">
            <h3 className="text-lg font-semibold mb-4">AI-Generated Keyword Ideas</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              {suggestions.map((suggestion, idx) => (
                <button
                  key={idx}
                  onClick={() => {
                    setKeyword(suggestion);
                    setResults(null);
                  }}
                  className="text-left px-3 py-2 bg-gray-50 hover:bg-primary-50 hover:text-primary-700 rounded-lg text-sm transition-colors"
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Results */}
        {results && (
          <div className="space-y-6">
            {/* Main Metrics */}
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-2xl font-bold mb-6">{results.keyword}</h2>
              
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-gradient-to-br from-blue-50 to-blue-100 p-6 rounded-lg border border-blue-200">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-sm font-medium text-blue-900">Search Volume</p>
                    <TrendingUp className="w-5 h-5 text-blue-600" />
                  </div>
                  <p className="text-4xl font-bold text-blue-900">
                    {results.searchVolume.toLocaleString()}
                  </p>
                  <p className="text-xs text-blue-700 mt-1">monthly searches</p>
                </div>

                <div className={`p-6 rounded-lg border ${getDifficultyColor(results.difficulty)}`}>
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-sm font-medium">Difficulty Score</p>
                  </div>
                  <p className="text-4xl font-bold">{results.difficulty}</p>
                  <p className="text-xs mt-1">{getDifficultyLabel(results.difficulty)} to rank</p>
                </div>

                <div className="bg-gradient-to-br from-green-50 to-green-100 p-6 rounded-lg border border-green-200">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-sm font-medium text-green-900">Opportunity Score</p>
                  </div>
                  <p className="text-4xl font-bold text-green-900">{results.opportunityScore}</p>
                  <div className="mt-2">
                    <div className="w-full bg-green-200 rounded-full h-2">
                      <div
                        className="bg-green-600 h-2 rounded-full transition-all duration-500"
                        style={{ width: `${results.opportunityScore}%` }}
                      />
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-6 flex items-center justify-between">
                <button
                  onClick={() => setShowFeedback(!showFeedback)}
                  className="btn-secondary flex items-center space-x-2"
                >
                  <MessageSquare className="w-4 h-4" />
                  <span>{showFeedback ? 'Hide' : 'Provide'} Feedback</span>
                </button>
                <button
                  onClick={handleGenerateBlog}
                  className="btn-primary flex items-center space-x-2"
                >
                  <FileText className="w-5 h-5" />
                  <span>Generate Blog Post</span>
                </button>
              </div>
              
              {/* Feedback Section */}
              {showFeedback && results && selectedSite && (
                <div className="mt-4 pt-4 border-t border-gray-200">
                  <FeedbackForm
                    keyword={results.keyword}
                    siteId={selectedSite}
                    promptType="keyword"
                    onSubmitted={() => setShowFeedback(false)}
                    onCancel={() => setShowFeedback(false)}
                  />
                </div>
              )}
            </div>

            {/* Related Keywords */}
            {results.relatedKeywords.length > 0 && (
              <div className="bg-white rounded-lg shadow p-6">
                <h3 className="text-lg font-semibold mb-4">Related Keywords</h3>
                <div className="flex flex-wrap gap-2">
                  {results.relatedKeywords.map((kw, idx) => (
                    <button
                      key={idx}
                      onClick={() => {
                        setKeyword(kw);
                        setResults(null);
                      }}
                      className="bg-gray-100 hover:bg-primary-100 hover:text-primary-700 px-4 py-2 rounded-full text-sm transition-colors"
                    >
                      {kw}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* YouTube Videos */}
            {results.youtubeVideos.length > 0 && (
              <div className="bg-white rounded-lg shadow p-6">
                <h3 className="text-lg font-semibold mb-4">Relevant YouTube Videos</h3>
                <p className="text-sm text-gray-600 mb-4">
                  These videos can be referenced in your blog post for additional value
                </p>
                <div className="space-y-3">
                  {results.youtubeVideos.map((video, idx) => (
                    <div key={idx} className="flex items-start space-x-3 p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors">
                      <div className="bg-red-100 p-2 rounded">
                        <FileText className="w-5 h-5 text-red-600" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <a
                          href={video.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-600 hover:underline font-medium block truncate"
                        >
                          {video.title}
                        </a>
                        <p className="text-xs text-gray-500 mt-1">
                          {video.viewCount > 0 ? `${video.viewCount.toLocaleString()} views` : video.url}
                        </p>
                      </div>
                      <a
                        href={video.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-gray-400 hover:text-gray-600"
                      >
                        <ExternalLink className="w-5 h-5" />
                      </a>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Recommendations */}
            <div className="bg-gradient-to-r from-primary-50 to-blue-50 rounded-lg p-6 border border-primary-200">
              <h3 className="text-lg font-semibold text-gray-900 mb-3">💡 Recommendations</h3>
              <ul className="space-y-2 text-sm text-gray-700">
                {results.opportunityScore > 70 && (
                  <li className="flex items-start space-x-2">
                    <span className="text-green-600">✓</span>
                    <span>High opportunity keyword - excellent choice for content creation!</span>
                  </li>
                )}
                {results.searchVolume > 5000 && (
                  <li className="flex items-start space-x-2">
                    <span className="text-green-600">✓</span>
                    <span>Good search volume - plenty of traffic potential</span>
                  </li>
                )}
                {results.difficulty < 40 && (
                  <li className="flex items-start space-x-2">
                    <span className="text-green-600">✓</span>
                    <span>Low difficulty - you have a good chance of ranking</span>
                  </li>
                )}
                {results.difficulty > 60 && (
                  <li className="flex items-start space-x-2">
                    <span className="text-yellow-600">⚠</span>
                    <span>High difficulty - consider targeting long-tail variations</span>
                  </li>
                )}
                {results.searchVolume < 1000 && (
                  <li className="flex items-start space-x-2">
                    <span className="text-yellow-600">⚠</span>
                    <span>Low search volume - consider if this aligns with your niche strategy</span>
                  </li>
                )}
                {results.opportunityScore < 50 && (
                  <li className="flex items-start space-x-2">
                    <span className="text-yellow-600">⚠</span>
                    <span>Lower opportunity score - consider exploring related keywords</span>
                  </li>
                )}
              </ul>
            </div>
          </div>
        )}

        {/* Empty State */}
        {!results && !loading && (
          <div className="bg-white rounded-lg shadow p-12 text-center">
            <Search className="w-16 h-16 text-gray-400 mx-auto mb-4" />
            <h3 className="text-xl font-semibold text-gray-900 mb-2">Start Your Keyword Research</h3>
            <p className="text-gray-600 mb-6">
              Enter a keyword above to analyze its potential and find related opportunities
            </p>
            <div className="max-w-md mx-auto text-left bg-gray-50 rounded-lg p-4">
              <p className="text-sm font-medium text-gray-900 mb-2">Tips for keyword research:</p>
              <ul className="text-sm text-gray-600 space-y-1">
                <li>• Start with broad terms related to your industry</li>
                <li>• Look for keywords with high volume and low difficulty</li>
                <li>• Target long-tail keywords for easier ranking</li>
                <li>• Use AI suggestions to discover new opportunities</li>
              </ul>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
export default KeywordResearch;
