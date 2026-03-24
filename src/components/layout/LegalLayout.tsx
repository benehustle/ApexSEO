import React from 'react';
import { Link } from 'react-router-dom';

interface LegalLayoutProps {
  children: React.ReactNode;
}

export const LegalLayout: React.FC<LegalLayoutProps> = ({ children }) => {
  return (
    <div className="min-h-screen bg-slate-900">
      {/* Header with Logo */}
      <div className="border-b border-slate-800 bg-slate-950">
        <div className="max-w-4xl mx-auto px-6 py-6">
          <Link to="/" className="inline-block">
            <img 
              src="/logo.svg" 
              alt="Apex SEO" 
              className="h-10 w-auto"
            />
          </Link>
        </div>
      </div>

      {/* Content Container */}
      <div className="max-w-4xl mx-auto px-6 py-12">
        <div className="bg-slate-800 rounded-lg border border-slate-700 p-8 md:p-12">
          {children}
        </div>
      </div>
    </div>
  );
};
