const express = require("express");
const cors = require("cors");
const puppeteerExtra = require("puppeteer-extra");
const getJobListings = require("./jobs/scrape-jobs");
const getJobDetails = require("./jobs/job-details");

// Add global error handlers
process.on('unhandledRejection', (reason, promise) => {
  console.error('[CRITICAL] Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (error) => {
  console.error('[CRITICAL] Uncaught Exception:', error);
});

const app = express();
app.use(express.json());
app.use(cors());

// Shared browser state
let browser;
let browserLastInitialized = null;
const BROWSER_RESET_INTERVAL = 3600000; // 1 hour

async function initializeBrowser() {
  try {
    console.log('[INFO] Starting browser initialization...');
    console.log('[DEBUG] System memory usage:', process.memoryUsage());
    
    if (browser && browser.isConnected()) {
      try {
        await browser.close();
        console.log('[INFO] Closed existing browser instance');
      } catch (error) {
        console.error('[WARN] Error closing existing browser:', error);
      }
    }
    
    browser = await puppeteerExtra.launch({
      headless: "new",
      protocolTimeout: 60000,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
        "--single-process",
        "--no-zygote",
        "--disable-notifications",
        "--disable-extensions",
        "--memory-pressure-off",
        "--js-flags=--max-old-space-size=460"
      ],
      ignoreHTTPSErrors: true,
      executablePath: "/usr/bin/chromium",
    });

    browserLastInitialized = Date.now();
    console.log('[INFO] Browser successfully initialized');
    
    browser.on('disconnected', () => {
      console.error('[CRITICAL] Browser disconnected unexpectedly');
      browser = null;
    });

    return browser;
  } catch (error) {
    console.error('[CRITICAL] Browser initialization failed:', error);
    console.error('[DEBUG] Error stack:', error.stack);
    throw error;
  }
}

// Middleware to ensure browser is healthy
async function ensureBrowser(req, res, next) {
  try {
    const now = Date.now();
    if (!browser || !browser.isConnected() || 
        (browserLastInitialized && (now - browserLastInitialized) > BROWSER_RESET_INTERVAL)) {
      console.log('[INFO] Reinitializing browser...');
      await initializeBrowser();
    }
    next();
  } catch (error) {
    console.error('[ERROR] Browser check failed:', error);
    res.status(500).json({ error: 'Browser initialization failed' });
  }
}

// Add middleware to track request timing and memory usage
app.use((req, res, next) => {
  const start = Date.now();
  const startMemory = process.memoryUsage();
  
  res.on('finish', () => {
    const duration = Date.now() - start;
    const endMemory = process.memoryUsage();
    console.log(`[INFO] ${req.method} ${req.url} - ${res.statusCode} - ${duration}ms`);
    console.log('[DEBUG] Memory delta:', {
      heapUsed: endMemory.heapUsed - startMemory.heapUsed,
      rss: endMemory.rss - startMemory.rss
    });
  });
  next();
});

// Route with enhanced error handling
app.post("/api/jobs/search", ensureBrowser, async (req, res) => {
  const startTime = Date.now();
  try {
    req.setTimeout(180000, () => {
      console.error('[ERROR] Request timeout reached');
      res.status(504).send('Request timeout');
    });

    const { searchTerm, location, li_at, maxJobs = 25 } = req.body;
    console.log(`[INFO] Starting job search for "${searchTerm}" in "${location}"`);

    const results = await getJobListings(browser, searchTerm, location, li_at, maxJobs);
    
    const duration = Date.now() - startTime;
    console.log(`[INFO] Job search completed in ${duration}ms`);
    
    res.json(results);
  } catch (error) {
    console.error('[ERROR] Job search failed:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/jobs/:url", ensureBrowser, async (req, res) => {
  const startTime = Date.now();
  try {
    req.setTimeout(180000, () => {
      console.error('[ERROR] Request timeout reached');
      res.status(504).send('Request timeout');
    });

    const { url } = req.params;
    const { li_at } = req.query;
    
    console.log(`[INFO] Starting job details fetch for URL: ${url}`);

    const jobDetails = await getJobDetails(browser, decodeURIComponent(url), li_at);
    
    const duration = Date.now() - startTime;
    console.log(`[INFO] Job details fetch completed in ${duration}ms`);
    
    res.json(jobDetails);
  } catch (error) {
    console.error('[ERROR] Job details fetch failed:', error);
    res.status(500).json({ error: error.message });
  }
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('[ERROR] Express error:', err);
  console.error('[DEBUG] Error stack:', err.stack);
  res.status(500).json({ error: 'Internal server error', message: err.message });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, async () => {
  try {
    await initializeBrowser();
    console.log(`[INFO] Server is running on port ${PORT}`);
  } catch (error) {
    console.error('[CRITICAL] Failed to start server:', error);
    process.exit(1);
  }
});

module.exports = { app, initializeBrowser };
