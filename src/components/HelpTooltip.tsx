import React, { useState } from 'react';
import { HelpCircle } from 'lucide-react';

interface HelpTooltipProps {
  content: string;
  learnMoreUrl?: string;
}

export const HelpTooltip: React.FC<HelpTooltipProps> = ({ content, learnMoreUrl }) => {
  const [show, setShow] = useState(false);

  return (
    <div className="relative inline-block">
      <button
        onMouseEnter={() => setShow(true)}
        onMouseLeave={() => setShow(false)}
        onFocus={() => setShow(true)}
        onBlur={() => setShow(false)}
        className="text-gray-400 hover:text-gray-600 transition-colors focus:outline-none"
        aria-label="Help"
      >
        <HelpCircle className="w-4 h-4" />
      </button>

      {show && (
        <div className="absolute z-50 bottom-full left-1/2 -translate-x-1/2 mb-2 w-64 bg-gray-900 text-white text-sm rounded-lg p-3 shadow-lg">
          <p>{content}</p>
          {learnMoreUrl && (
            <a
              href={learnMoreUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary-300 hover:text-primary-200 text-xs mt-2 inline-block"
            >
              Learn more →
            </a>
          )}
          <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-1">
            <div className="border-8 border-transparent border-t-gray-900"></div>
          </div>
        </div>
      )}
    </div>
  );
};
