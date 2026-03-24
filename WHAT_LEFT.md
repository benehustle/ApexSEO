# What's Left for MVP - Action Items

## ✅ Already Completed

- ✅ Cloud Functions deployed (Node.js 20)
- ✅ Secret Manager integration code written
- ✅ All 8 functions live and ready
- ✅ Environment variable templates created
- ✅ Deployment scripts created
- ✅ Documentation updated

## 🔴 Critical - Do These Now (15-30 minutes)

### 1. Grant Secret Manager Permissions ⚠️ REQUIRED
**Without this, functions won't be able to read your API key**

1. Go to: https://console.cloud.google.com/iam-admin/iam?project=apex-seo-ffbd0
2. Find: `apex-seo-ffbd0@appspot.gserviceaccount.com`
3. Click **Edit** (pencil icon)
4. Click **ADD ANOTHER ROLE**
5. Select: **Secret Manager Secret Accessor**
6. Click **SAVE**

**Time:** 2 minutes

### 2. Verify Secret Name
**Check your secret name matches the code**

1. Go to: https://console.cloud.google.com/security/secret-manager?project=apex-seo-ffbd0
2. Check the name of your Anthropic API key secret
3. If it's NOT `anthropic-api-key`, either:
   - Rename it to `anthropic-api-key` in Secret Manager, OR
   - Update line 15 in `functions/src/index.ts`:
     ```typescript
     const SECRET_NAME = process.env.ANTHROPIC_SECRET_NAME || "your-actual-secret-name";
     ```

**Time:** 1 minute

### 3. Deploy Updated Functions
**Deploy the Secret Manager code**

```bash
cd "/Users/benwake/Library/Mobile Documents/com~apple~CloudDocs/Apps/Apex SEO"
firebase deploy --only functions
```

**Time:** 3-5 minutes

### 4. Create .env.production
**Copy your .env.local to .env.production**

```bash
cp .env.local .env.production
```

Then review `.env.production` and ensure all values are correct for production.

**Time:** 2 minutes

### 5. Test Critical Flow
**Verify everything works end-to-end**

1. Start your dev server: `npm run dev`
2. Login to your app
3. Create a test site (or use existing)
4. Try generating keywords (this tests Secret Manager)
5. Try generating a blog post
6. Check function logs if errors: `firebase functions:log`

**Time:** 10-15 minutes

## 🟡 Important - Before Production Launch

### 6. Deploy to Production Hosting
**Once testing passes, deploy the frontend**

```bash
npm run build
firebase deploy --only hosting
```

**Time:** 2-3 minutes

### 7. Production Testing
**Test on the live production URL**

- [ ] Login works
- [ ] Site creation works
- [ ] Keyword generation works
- [ ] Blog generation works
- [ ] No console errors
- [ ] Functions are accessible

**Time:** 10 minutes

## 🟢 Nice to Have (Can Do Later)

- Error handling improvements
- Loading states polish
- Mobile responsiveness testing
- Performance optimization
- Security audit

## 📋 Quick Command Reference

```bash
# Deploy functions
firebase deploy --only functions

# Deploy hosting
npm run build && firebase deploy --only hosting

# Deploy everything
npm run build && firebase deploy

# Check function logs
firebase functions:log

# Test locally
npm run dev
```

## ⏱️ Total Time to MVP: ~30-45 minutes

Most of this is just:
1. Granting permissions (2 min)
2. Deploying functions (5 min)
3. Testing (15 min)
4. Deploying hosting (3 min)

## 🎯 Priority Order

1. **Grant Secret Manager permissions** ← Do this first!
2. Deploy functions
3. Test keyword generation
4. Deploy to production
5. Test production

---

**You're 95% there!** Just need to grant permissions and deploy. 🚀
