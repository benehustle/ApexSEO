export const calculateCost = {
  anthropic: (tokens: number) => {
    const inputCost = 0.003; // $3 per million tokens
    const outputCost = 0.015; // $15 per million tokens
    // Assuming 50/50 split for simplicity
    return ((tokens / 2) * inputCost + (tokens / 2) * outputCost) / 1000;
  },

  openai: (images: number) => {
    return images * 0.04; // $0.04 per DALL-E 3 image (standard quality)
  },

  youtube: (_requests: number) => {
    return 0; // YouTube API is free with quota limits
  },

  dataforseo: (_requests: number) => {
    return _requests * 0.5; // Approximate $0.50 per keyword lookup
  }
};

export const estimateBlogCost = () => {
  const avgTokens = 3000; // Average tokens per blog
  const contentCost = calculateCost.anthropic(avgTokens);
  const imageCost = calculateCost.openai(1);
  const keywordCost = calculateCost.dataforseo(1);

  return {
    contentCost,
    imageCost,
    keywordCost,
    totalCost: contentCost + imageCost + keywordCost
  };
};
