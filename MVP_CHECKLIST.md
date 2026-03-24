# MVP Checklist - What's Left

## 🔴 Critical (Must Have for MVP)

### 1. **API Key Configuration** ⚠️ HIGH PRIORITY
- [ ] Set `ANTHROPIC_API_KEY` environment variable for Cloud Functions
  - Run: `firebase functions:config:set anthropic.key="your-key-here"`
  - Or set in Firebase Console: Functions > Configuration > Environment Variables
  - **Without this, keyword generation and blog generation won't work**

### 2. **Environment Variables Setup**
- [ ] Create `.env` file in root directory with all required variables:
  ```env
  VITE_FIREBASE_API_KEY=
  VITE_FIREBASE_AUTH_DOMAIN=
  VITE_FIREBASE_PROJECT_ID=
  VITE_FIREBASE_STORAGE_BUCKET=
  VITE_FIREBASE_MESSAGING_SENDER_ID=
  VITE_FIREBASE_APP_ID=
  VITE_FIREBASE_MEASUREMENT_ID=
  VITE_ANTHROPIC_API_KEY=  # Optional - now handled by Cloud Functions
  VITE_OPENAI_API_KEY=     # For image generation
  VITE_YOUTUBE_API_KEY=    # For video suggestions
  VITE_DATAFORSEO_LOGIN=   # For keyword research
  VITE_DATAFORSEO_PASSWORD=
  ```
- [ ] Document which variables are required vs optional

### 3. **End-to-End Testing** 🧪
- [ ] **Critical User Flow 1: Site Creation → Blog Generation → Publishing**
  - [ ] Create a new site through onboarding
  - [ ] Generate a single blog post
  - [ ] Verify blog appears in content calendar
  - [ ] Approve the blog
  - [ ] Manually publish to WordPress
  - [ ] Verify blog appears on WordPress site
  - [ ] Verify tracking script is included

- [ ] **Critical User Flow 2: Keyword Research → Blog Generation**
  - [ ] Search for a keyword
  - [ ] Generate keywords using AI
  - [ ] Generate blog from keyword
  - [ ] Verify content quality

- [ ] **Critical User Flow 3: Analytics Tracking**
  - [ ] Publish a blog with tracking script
  - [ ] Visit the published blog post
  - [ ] Verify analytics data appears in dashboard
  - [ ] Check page views, time on page, scroll depth

### 4. **Error Handling & User Feedback**
- [ ] Add clear error messages when API keys are missing
- [ ] Add loading states for all async operations
- [ ] Add success/error toasts for key actions (generate, publish, etc.)
- [ ] Handle WordPress connection failures gracefully
- [ ] Handle Cloud Function failures gracefully

### 5. **WordPress Integration Verification**
- [ ] Test WordPress connection with real credentials
- [ ] Verify featured image uploads correctly
- [ ] Verify post content formatting is correct
- [ ] Verify tracking script is properly injected
- [ ] Test with different WordPress configurations

## 🟡 Important (Should Have for MVP)

### 6. **Content Calendar Improvements**
- [ ] Verify bulk actions (approve/reject multiple blogs) work
- [ ] Verify scheduling works correctly
- [ ] Add ability to reschedule blogs
- [ ] Verify calendar view displays correctly

### 7. **Site Details Page**
- [ ] Verify keyword generation works (now using Cloud Functions)
- [ ] Verify keyword addition/removal works
- [ ] Verify blog list displays correctly
- [ ] Verify analytics summary displays

### 8. **Dashboard**
- [ ] Verify site list displays correctly
- [ ] Verify active/inactive filtering works
- [ ] Verify site archiving/restoring works
- [ ] Verify navigation to site details works

### 9. **Documentation Updates**
- [ ] Update `setup-instructions.md` with Cloud Functions API key setup
- [ ] Add troubleshooting section for common issues
- [ ] Document how to set Cloud Functions environment variables
- [ ] Update README with current deployment status

## 🟢 Nice to Have (Can Wait)

### 10. **Performance Optimization**
- [ ] Verify lazy loading works correctly
- [ ] Optimize image loading
- [ ] Add pagination for large blog lists
- [ ] Verify React Query caching works

### 11. **Mobile Responsiveness**
- [ ] Test on mobile devices (375px width)
- [ ] Verify forms are usable on mobile
- [ ] Verify navigation works on mobile
- [ ] Verify modals work on mobile

### 12. **Security Review**
- [ ] Verify Firestore rules are properly enforced
- [ ] Verify users can't access other users' data
- [ ] Verify API keys aren't exposed in client code
- [ ] Review rate limiting implementation

### 13. **Email Notifications**
- [ ] Verify email notifications are sent (if using Firebase Extensions)
- [ ] Test blog published notification
- [ ] Test weekly report notification
- [ ] Verify email preferences work

## 📋 Quick Start Checklist for MVP

1. **Set Cloud Functions API Key:**
   ```bash
   firebase functions:config:set anthropic.key="your-anthropic-api-key"
   firebase deploy --only functions
   ```

2. **Create `.env` file** with all Firebase config variables

3. **Test Critical Flows:**
   - Site creation
   - Blog generation (single)
   - Blog publishing
   - Analytics tracking

4. **Deploy to Production:**
   ```bash
   npm run build
   firebase deploy --only hosting
   ```

5. **Verify Production:**
   - Test on production URL
   - Verify all features work
   - Check for console errors

## 🐛 Known Issues to Fix

- [ ] Keyword generation now uses Cloud Functions (✅ Fixed)
- [ ] CORS issues with Anthropic API (✅ Fixed - now using Cloud Functions)
- [ ] Node.js 18 decommissioned (✅ Fixed - upgraded to Node 20)
- [ ] Firestore indexes needed (✅ Fixed - indexes deployed)

## 📝 Notes

- **Cloud Functions are deployed** and running on Node.js 20 in `australia-southeast1`
- **Keyword generation** now works through Cloud Functions (no CORS issues)
- **All 8 functions** are live and ready to use
- **API key** needs to be configured for functions to work properly
