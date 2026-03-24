import React, { useState, useEffect } from 'react';
import {
  collection,
  query,
  onSnapshot,
  orderBy,
  deleteDoc,
  doc,
} from 'firebase/firestore';
import { db } from '../../config/firebase';
import { useToast } from '../Toast';
import { TrendingUp, Trash2, Loader2, Search } from 'lucide-react';
import { format } from 'date-fns';

interface TargetedKeyword {
  id: string;
  keyword: string;
  volume: number;
  difficulty: number;
  addedAt: Date;
}

interface TargetedKeywordsListProps {
  siteId: string;
}

export const TargetedKeywordsList: React.FC<TargetedKeywordsListProps> = ({ siteId }) => {
  const [keywords, setKeywords] = useState<TargetedKeyword[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [deletingIds, setDeletingIds] = useState<Set<string>>(new Set());
  const { showToast } = useToast();

  // Real-time subscription to targetedKeywords collection
  useEffect(() => {
    if (!siteId) return;

    const keywordsRef = collection(db, 'sites', siteId, 'targetedKeywords');
    const q = query(keywordsRef, orderBy('addedAt', 'desc'));

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const keywordsData: TargetedKeyword[] = snapshot.docs.map((doc) => {
          const data = doc.data();
          return {
            id: doc.id,
            keyword: data.keyword,
            volume: data.volume || 0,
            difficulty: data.difficulty || 0,
            addedAt: data.addedAt?.toDate() || new Date(),
          };
        });
        setKeywords(keywordsData);
        setLoading(false);
      },
      (err) => {
        console.error('Error fetching targeted keywords:', err);
        showToast('error', 'Failed to load keywords');
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [siteId, showToast]);

  const handleDelete = async (keywordId: string, keyword: string) => {
    if (!confirm(`Are you sure you want to delete "${keyword}"?`)) {
      return;
    }

    setDeletingIds((prev) => new Set(prev).add(keywordId));

    try {
      const keywordRef = doc(db, 'sites', siteId, 'targetedKeywords', keywordId);
      await deleteDoc(keywordRef);
      showToast('success', 'Keyword deleted successfully');
    } catch (error: any) {
      console.error('Error deleting keyword:', error);
      showToast('error', 'Failed to delete keyword');
    } finally {
      setDeletingIds((prev) => {
        const newSet = new Set(prev);
        newSet.delete(keywordId);
        return newSet;
      });
    }
  };

  const filteredKeywords = keywords.filter((kw) =>
    kw.keyword.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-blue-400" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Search Bar */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-slate-400" />
        <input
          type="text"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="Search keywords..."
          className="w-full pl-10 pr-4 py-3 bg-slate-800 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-slate-800 border border-slate-700 rounded-lg p-4">
          <div className="text-sm text-slate-400 mb-1">Total Keywords</div>
          <div className="text-2xl font-bold text-white">{keywords.length}</div>
        </div>
        <div className="bg-slate-800 border border-slate-700 rounded-lg p-4">
          <div className="text-sm text-slate-400 mb-1">Avg Volume</div>
          <div className="text-2xl font-bold text-white">
            {keywords.length > 0
              ? Math.round(keywords.reduce((sum, kw) => sum + kw.volume, 0) / keywords.length).toLocaleString()
              : '0'}
          </div>
        </div>
        <div className="bg-slate-800 border border-slate-700 rounded-lg p-4">
          <div className="text-sm text-slate-400 mb-1">Avg Difficulty</div>
          <div className="text-2xl font-bold text-white">
            {keywords.length > 0
              ? Math.round(keywords.reduce((sum, kw) => sum + kw.difficulty, 0) / keywords.length)
              : '0'}
          </div>
        </div>
      </div>

      {/* Keywords List */}
      {filteredKeywords.length === 0 ? (
        <div className="text-center py-12 bg-slate-800 border border-slate-700 rounded-lg">
          <Search className="w-12 h-12 text-slate-600 mx-auto mb-4" />
          <p className="text-slate-400 text-lg mb-2">
            {searchTerm ? 'No keywords match your search' : 'No targeted keywords yet'}
          </p>
          <p className="text-slate-500 text-sm">
            {searchTerm
              ? 'Try a different search term'
              : 'Use the "Generate New Content" button to start finding keywords'}
          </p>
        </div>
      ) : (
        <div className="bg-slate-800 border border-slate-700 rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-900/50 border-b border-slate-700">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">
                    Keyword
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">
                    Volume
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">
                    Difficulty
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">
                    Added
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-slate-400 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700">
                {filteredKeywords.map((kw) => (
                  <tr
                    key={kw.id}
                    className="hover:bg-slate-900/50 transition-colors"
                  >
                    <td className="px-6 py-4">
                      <p className="text-sm font-semibold text-white">{kw.keyword}</p>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2 text-slate-300">
                        <TrendingUp className="w-4 h-4 text-slate-400" />
                        <span className="text-sm">{kw.volume.toLocaleString()}/mo</span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span
                        className={`text-sm font-medium ${
                          kw.difficulty < 30
                            ? 'text-green-400'
                            : kw.difficulty < 50
                            ? 'text-yellow-400'
                            : 'text-red-400'
                        }`}
                      >
                        {kw.difficulty}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <p className="text-sm text-slate-400">
                        {format(kw.addedAt, 'MMM d, yyyy')}
                      </p>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right">
                      <button
                        onClick={() => handleDelete(kw.id, kw.keyword)}
                        disabled={deletingIds.has(kw.id)}
                        className="p-2 text-red-400 hover:text-red-300 hover:bg-slate-700 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        title="Delete keyword"
                      >
                        {deletingIds.has(kw.id) ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Trash2 className="w-4 h-4" />
                        )}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
