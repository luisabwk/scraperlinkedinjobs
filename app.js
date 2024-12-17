// app.js
const express = require("express");
const cors = require("cors");
const puppeteerExtra = require("puppeteer-extra");
const { authenticateLinkedIn } = require("./auth/linkedinAuth");
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
        "--js-flags=--max-old-space-size=460" // Limit Chrome's memory usage
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

// Example route with enhanced error handling
app.post("/api/jobs/search", ensureBrowser, async (req, res) => {
  const startTime = Date.now();
  try {
    // Set request timeout
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

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('[ERROR] Express error:', err);
  console.error('[DEBUG] Error stack:', err.stack);
  res.status(500).json({ error: 'Internal server error', message: err.message });
});

// jobs/job-details.js modifications
const getJobDetails = async (browser, jobUrl, li_at) => {
  let page = null;
  const startTime = Date.now();
  
  try {
    console.log(`[INFO] Starting job details fetch for: ${jobUrl}`);
    if (!browser || !browser.isConnected()) {
      throw new Error('Browser not connected');
    }
    
    page = await browser.newPage();
    // ... rest of your existing getJobDetails code ...
    
  } catch (error) {
    console.error(`[ERROR] Failed to get job details for ${jobUrl}:`, error);
    throw error;
  } finally {
    if (page) {
      try {
        await page.close();
        console.log(`[INFO] Page closed. Job details fetch took ${Date.now() - startTime}ms`);
      } catch (closeError) {
        console.error('[WARN] Error closing page:', closeError);
      }
    }
  }
};

// jobs/scrape-jobs.js modifications
const getJobListings = async (browser, searchTerm, location, li_at, maxJobs) => {
  let page = null;
  const startTime = Date.now();
  
  try {
    console.log('[INFO] Starting job listings fetch');
    if (!browser || !browser.isConnected()) {
      throw new Error('Browser not connected');
    }
    
    page = await browser.newPage();
    // ... rest of your existing getJobListings code ...
    
  } catch (error) {
    console.error('[ERROR] Failed to get job listings:', error);
    throw error;
  } finally {
    if (page) {
      try {
        await page.close();
        console.log(`[INFO] Page closed. Job listings fetch took ${Date.now() - startTime}ms`);
      } catch (closeError) {
        console.error('[WARN] Error closing page:', closeError);
      }
    }
  }
};
