export const measurePerformance = (metricName: string, fn: () => any) => {
  const start = performance.now();
  const result = fn();
  const end = performance.now();
  
  const duration = end - start;
  console.log(`${metricName}: ${duration.toFixed(2)}ms`);
  
  // Log to analytics if slow
  if (duration > 1000) {
    console.warn(`Slow operation detected: ${metricName} (${duration.toFixed(2)}ms)`);
  }
  
  return result;
};

export const measureAsyncPerformance = async (metricName: string, fn: () => Promise<any>) => {
  const start = performance.now();
  const result = await fn();
  const end = performance.now();
  
  const duration = end - start;
  console.log(`${metricName}: ${duration.toFixed(2)}ms`);
  
  // Log to analytics if slow
  if (duration > 1000) {
    console.warn(`Slow operation detected: ${metricName} (${duration.toFixed(2)}ms)`);
  }
  
  return result;
};
