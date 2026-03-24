import React, { useState } from 'react';
import { Search, Book, Video, MessageCircle, FileText } from 'lucide-react';

const FAQ_ITEMS = [
  {
    category: 'Getting Started',
    questions: [
      {
        q: 'How do I connect my WordPress site?',
        a: 'Go to Settings → WordPress and enter your site URL and application password. You can generate an application password in WordPress under Users → Profile → Application Passwords.'
      },
      {
        q: 'How many blogs can I generate at once?',
        a: 'You can generate up to 30 blogs at a time. They will be automatically scheduled based on your publishing frequency settings.'
      },
      {
        q: 'What happens to blogs in "pending" status?',
        a: 'Pending blogs need your manual approval before they can be published. Review them in the Content Calendar and approve or reject as needed.'
      }
    ]
  },
  {
    category: 'WordPress Integration',
    questions: [
      {
        q: 'Why is my WordPress connection failing?',
        a: 'Common issues: 1) Incorrect API URL (should be yourdomain.com/wp-json), 2) Invalid application password, 3) WordPress REST API disabled, 4) SSL certificate issues.'
      },
      {
        q: 'Can I use this with WordPress.com?',
        a: 'Yes, but you need a WordPress.com Business plan or higher to access the REST API and application passwords.'
      }
    ]
  },
  {
    category: 'Content Generation',
    questions: [
      {
        q: 'How do I improve content quality?',
        a: 'Provide detailed brand voice, target audience, and content goals in your site settings. The more context you provide, the better the AI can match your style.'
      },
      {
        q: 'Can I edit generated blogs?',
        a: 'Yes! Click the edit button on any blog to modify the content, title, or scheduled date before publishing.'
      }
    ]
  },
  {
    category: 'Analytics',
    questions: [
      {
        q: 'How does blog tracking work?',
        a: 'We inject a lightweight tracking script into each published blog that collects page views, time on page, and scroll depth without cookies.'
      },
      {
        q: 'Why aren\'t my analytics showing up?',
        a: 'Analytics start collecting data once a blog is published. It may take a few hours for the first data to appear.'
      }
    ]
  }
];

const GUIDES = [
  {
    title: 'Complete Setup Guide',
    description: 'Step-by-step guide to setting up your first site and generating blogs',
    icon: Book,
    url: '#'
  },
  {
    title: 'WordPress Configuration',
    description: 'How to properly configure WordPress for API access',
    icon: FileText,
    url: '#'
  },
  {
    title: 'Keyword Research Best Practices',
    description: 'Tips for finding high-opportunity keywords',
    icon: Search,
    url: '#'
  },
  {
    title: 'Video Tutorials',
    description: 'Watch video walkthroughs of key features',
    icon: Video,
    url: '#'
  }
];

export const HelpCenter: React.FC = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedQuestions, setExpandedQuestions] = useState<Set<string>>(new Set());

  const toggleQuestion = (question: string) => {
    const newExpanded = new Set(expandedQuestions);
    if (newExpanded.has(question)) {
      newExpanded.delete(question);
    } else {
      newExpanded.add(question);
    }
    setExpandedQuestions(newExpanded);
  };

  const filteredFAQ = FAQ_ITEMS.map(category => ({
    ...category,
    questions: category.questions.filter(item =>
      item.q.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.a.toLowerCase().includes(searchQuery.toLowerCase())
    )
  })).filter(category => category.questions.length > 0);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-6">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-4">Help Center</h1>
          <p className="text-gray-600 dark:text-gray-400 mb-8">Find answers and learn how to use the platform</p>

          {/* Search */}
          <div className="relative max-w-2xl mx-auto">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search for help..."
              className="w-full pl-12 pr-4 py-3 border border-gray-300 dark:border-gray-700 dark:bg-gray-800 dark:text-white rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
            />
          </div>
        </div>

        {/* Guides */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-12">
          {GUIDES.map((guide, idx) => (
            <a
              key={idx}
              href={guide.url}
              className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow hover:shadow-lg transition-shadow"
            >
              <div className="flex items-start space-x-4">
                <div className="bg-primary-100 dark:bg-primary-900 p-3 rounded-lg">
                  <guide.icon className="w-6 h-6 text-primary-600 dark:text-primary-400" />
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900 dark:text-white mb-1">{guide.title}</h3>
                  <p className="text-sm text-gray-600 dark:text-gray-400">{guide.description}</p>
                </div>
              </div>
            </a>
          ))}
        </div>

        {/* FAQ */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">Frequently Asked Questions</h2>

          {filteredFAQ.length === 0 ? (
            <p className="text-gray-500 dark:text-gray-400 text-center py-8">No results found for "{searchQuery}"</p>
          ) : (
            <div className="space-y-8">
              {filteredFAQ.map((category, catIdx) => (
                <div key={catIdx}>
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">{category.category}</h3>
                  <div className="space-y-2">
                    {category.questions.map((item, qIdx) => (
                      <div key={qIdx} className="border border-gray-200 dark:border-gray-700 rounded-lg">
                        <button
                          onClick={() => toggleQuestion(item.q)}
                          className="w-full text-left p-4 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-medium text-gray-900 dark:text-white">{item.q}</span>
                            <span className="text-gray-400 dark:text-gray-500">
                              {expandedQuestions.has(item.q) ? '−' : '+'}
                            </span>
                          </div>
                        </button>
                        {expandedQuestions.has(item.q) && (
                          <div className="px-4 pb-4 text-gray-600 dark:text-gray-400">
                            {item.a}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Contact Support */}
        <div className="mt-8 bg-primary-50 dark:bg-primary-900 rounded-lg p-6 border border-primary-200 dark:border-primary-800">
          <div className="flex items-center space-x-3 mb-3">
            <MessageCircle className="w-6 h-6 text-primary-600 dark:text-primary-400" />
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Still need help?</h3>
          </div>
          <p className="text-gray-600 dark:text-gray-400 mb-4">
            Can't find what you're looking for? Our support team is here to help.
          </p>
          <button className="btn-primary">
            Contact Support
          </button>
        </div>
      </div>
    </div>
  );
};
