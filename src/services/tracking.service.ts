export class TrackingService {
  generateTrackingScript(blogId: string, siteId: string): string {
    const functionsUrl = import.meta.env.VITE_CLOUD_FUNCTIONS_URL;
    
    return `
<!-- Blog Analytics Tracker -->
<script>
(function() {
  const blogId = '${blogId}';
  const siteId = '${siteId}';
  const trackingEndpoint = '${functionsUrl}/trackPageView';
  
  function trackView() {
    const data = {
      blogId: blogId,
      siteId: siteId,
      timestamp: new Date().toISOString(),
      referrer: document.referrer || 'Direct',
      userAgent: navigator.userAgent,
      screenResolution: window.screen.width + 'x' + window.screen.height,
      language: navigator.language,
      url: window.location.href
    };
    
    fetch(trackingEndpoint, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify(data),
      keepalive: true
    }).catch(e => console.error('Tracking failed:', e));
  }
  
  let startTime = Date.now();
  window.addEventListener('beforeunload', function() {
    const timeOnPage = Math.round((Date.now() - startTime) / 1000);
    navigator.sendBeacon(trackingEndpoint.replace('/trackPageView', '/trackTimeOnPage'), JSON.stringify({
      blogId: blogId,
      siteId: siteId,
      timeOnPage: timeOnPage
    }));
  });
  
  let maxScroll = 0;
  window.addEventListener('scroll', function() {
    const scrollPercent = Math.round((window.scrollY / (document.documentElement.scrollHeight - window.innerHeight)) * 100);
    if (scrollPercent > maxScroll) maxScroll = scrollPercent;
  });
  
  window.addEventListener('beforeunload', function() {
    navigator.sendBeacon(trackingEndpoint.replace('/trackPageView', '/trackScrollDepth'), JSON.stringify({
      blogId: blogId,
      siteId: siteId,
      maxScroll: maxScroll
    }));
  });
  
  if (document.readyState === 'complete') {
    trackView();
  } else {
    window.addEventListener('load', trackView);
  }
})();
</script>`;
  }

  getTrackingScriptForWordPress(blogId: string, siteId: string): string {
    // Returns a minified version for WordPress custom fields
    const script = this.generateTrackingScript(blogId, siteId);
    return script.replace(/\s+/g, ' ').trim();
  }
}

export const trackingService = new TrackingService();
