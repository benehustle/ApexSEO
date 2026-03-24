export async function retryOperation<T>(
  operation: () => Promise<T>,
  maxRetries: number = 3,
  delay: number = 1000
): Promise<T> {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await operation();
    } catch (error) {
      if (i === maxRetries - 1) throw error;
      
      console.log(`Retry attempt ${i + 1} of ${maxRetries}...`);
      await new Promise(resolve => setTimeout(resolve, delay * (i + 1)));
    }
  }
  
  throw new Error('Max retries exceeded');
}
