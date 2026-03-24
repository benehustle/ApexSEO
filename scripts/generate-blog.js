const fs = require('fs');
const path = require('path');
const admin = require('firebase-admin');
const { execSync } = require('child_process');

// CONFIGURATION
const SITE_ID = 'CrwYROIIGRhyGotnV4dh'; // "Apex SEO" Site ID
const AGENCY_ID = 'XkMHFUavXVgGV6YfapK9wBYPrbK2'; // Your Agency ID

// PATHS
const WEBSITE_DIR = path.join(__dirname, '../website');
const BLOG_DIR = path.join(WEBSITE_DIR, 'blog');
const TEMPLATE_PATH = path.join(BLOG_DIR, 'template.html');
const SERVICE_ACCOUNT_PATH = path.join(__dirname, '../service-account.json');

// 1. Initialize Firebase
if (!fs.existsSync(SERVICE_ACCOUNT_PATH)) {
    console.error('❌ Error: service-account.json not found in root directory.');
    console.error('👉 Please download a new private key from Firebase Console > Project Settings > Service Accounts');
    console.error('👉 Save it as "service-account.json" in the project root.');
    process.exit(1);
}

admin.initializeApp({
    credential: admin.credential.cert(require(SERVICE_ACCOUNT_PATH))
});

const db = admin.firestore();

async function generateAndDeploy() {
    console.log('🚀 Starting Blog Automation...');

    // 2. Use Hardcoded Site ID
    console.log(`🚀 Using Site ID: ${SITE_ID} for Agency: ${AGENCY_ID}`);
    const siteId = SITE_ID;

    // 3. Fetch Posts
    console.log(`📥 Fetching approved posts...`);
    const postsSnapshot = await db.collection('posts')
        .where('siteId', '==', siteId)
        .where('status', 'in', ['approved', 'published']) 
        .orderBy('createdAt', 'desc')
        .get();

    if (postsSnapshot.empty) {
        console.warn('⚠️ No approved posts found. Go to your dashboard and generate/approve some content!');
    } else {
        const posts = [];
        postsSnapshot.forEach(doc => {
            posts.push({ id: doc.id, ...doc.data() });
        });

        console.log(`✅ Found ${posts.length} posts. Generating HTML...`);

        // 4. Read Template
        let template = fs.readFileSync(TEMPLATE_PATH, 'utf8');

        // 5. Generate Individual Post Pages
        const generatedFiles = [];

        posts.forEach(post => {
            // Create slug
            const slug = post.slug || post.keyword.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
            const fileName = `${slug}.html`;
            const filePath = path.join(BLOG_DIR, fileName);

            // Format Date
            const date = post.createdAt ? new Date(post.createdAt.toDate()).toLocaleDateString('en-US', {
                year: 'numeric', month: 'long', day: 'numeric'
            }) : new Date().toLocaleDateString();

            // Calculate Read Time
            const wordCount = post.content ? post.content.split(/\s+/).length : 0;
            const readTime = Math.ceil(wordCount / 200);

            // Replace Placeholders
            let html = template
                .replace(/{{TITLE}}/g, post.title)
                .replace(/{{CONTENT}}/g, post.content)
                .replace(/{{FEATURED_IMAGE}}/g, post.featuredImage || '../assets/apex-logo.png')
                .replace(/{{DATE}}/g, date)
                .replace(/{{READ_TIME}}/g, readTime);

            fs.writeFileSync(filePath, html);
            generatedFiles.push({ title: post.title, slug: slug, date: date, image: post.featuredImage });
            process.stdout.write('.'); // Progress dot
        });
        console.log('\n✅ All post pages generated.');

        // 6. Update Blog Index
        console.log('📄 Updating Blog Index...');
        const indexTemplatePath = path.join(BLOG_DIR, 'index.html');
        let indexHtml = fs.readFileSync(indexTemplatePath, 'utf8');

        // Create Grid HTML
        const gridHtml = generatedFiles.map(post => `
            <a href="${post.slug}.html" class="group block bg-white rounded-2xl overflow-hidden shadow-sm hover:shadow-xl transition-all duration-300 border border-slate-100 hover:-translate-y-1">
                <div class="aspect-video overflow-hidden bg-slate-100 relative">
                    <img src="${post.image || '../assets/apex-logo.png'}" alt="${post.title}" class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500">
                    <div class="absolute inset-0 bg-gradient-to-t from-slate-900/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>
                </div>
                <div class="p-6">
                    <div class="text-xs text-primary-600 font-semibold mb-2 uppercase tracking-wider">${post.date}</div>
                    <h3 class="text-xl font-bold text-slate-900 group-hover:text-primary-600 transition-colors mb-2 line-clamp-2">${post.title}</h3>
                    <div class="flex items-center text-primary-600 font-medium text-sm mt-4">
                        Read Article 
                        <svg class="w-4 h-4 ml-1 group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 8l4 4m0 0l-4 4m4-4H3"></path></svg>
                    </div>
                </div>
            </a>
        `).join('\n');

        // Replace Grid
        const gridRegex = /(<div id="blog-grid"[^>]*>)([\s\S]*?)(<\/div>)/;
        if (gridRegex.test(indexHtml)) {
            indexHtml = indexHtml.replace(gridRegex, `$1${gridHtml}$3`);
            fs.writeFileSync(indexTemplatePath, indexHtml);
        }
    }

    // 7. Auto-Deploy to Cloudflare
    console.log('☁️  Deploying to Cloudflare...');
    try {
        // Using the project path explicitly to ensure it finds the website folder
        execSync(`npx wrangler pages deploy "${WEBSITE_DIR}" --project-name=apex-seo-marketing`, { stdio: 'inherit' });
        console.log('🎉 SUCCESS! Blog updated and deployed.');
        console.log('👉 View it at: https://apex-seo-marketing.pages.dev/blog/index.html');
    } catch (error) {
        console.error('❌ Deployment failed:', error.message);
    }
}

generateAndDeploy().catch(console.error);
