import React from 'react';

export function AuthorInsightsHeader({ selectedAuthorName }) {
  if (!selectedAuthorName) {
    return null;
  }
  return (
    <div className="author-insights-selected">
      Showing insights for {selectedAuthorName}
    </div>
  );
}
