import express from 'express';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readFileSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.PORT || 8080;

const distPath = join(__dirname, 'dist');
const indexPath = join(distPath, 'index.html');

// Serve static files from the dist directory
// This MUST come before the catch-all route
// express.static will serve files if they exist, and call next() if they don't
app.use(express.static(distPath, {
  // Explicitly set MIME types to ensure JS files are served correctly
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.js') || filePath.endsWith('.mjs')) {
      res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
    }
  }
}));

// Handle client-side routing - serve index.html for routes that don't match static files
// This middleware only runs if express.static didn't find a matching file (called next())
app.use((req, res) => {
  // express.static already handled static files, so this only runs for routes
  try {
    const indexContent = readFileSync(indexPath, 'utf-8');
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(indexContent);
  } catch (error) {
    console.error('Error serving index.html:', error);
    res.status(500).send('Internal Server Error');
  }
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
