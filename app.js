const express = require("express");
const cors = require("cors");
const puppeteerExtra = require("puppeteer-extra");
const LinkedInAuthManager = require("./auth/linkedinAuth");
const getJobListings = require("./jobs/scrape-jobs");
const getJobDetails = require("./jobs/job-details");

const app = express();
app.use(express.json());
app.use(cors());

// Configuração de timeout maior para requisições
app.use((req, res, next) => {
  res.setTimeout(300000); // 5 minutos de timeout para todas as requisições
  next();
});

// Single browser instance
let browser;

// Middleware to initialize the browser
async function ensureBrowser(req, res, next) {
  try {
    if (!browser || !browser.isConnected()) {
      console.log("[INFO] Initializing browser...");
      browser = await puppeteerExtra.launch({
        headless: true,
        args: [
          "--no-sandbox",
          "--disable-setuid-sandbox",
          "--disable-dev-shm-usage",
          "--disable-gpu",
          "--no-zygote",
          "--single-process",
        ],
      });
    }
    next();
  } catch (error) {
    console.error("[ERROR] Failed to initialize browser:", error.message);
    res.status(500).json({ error: "Failed to initialize browser", details: error.message });
  }
}

// Status endpoint
app.get("/status", (req, res) => {
  res.status(200).json({ status: "online", message: "API is running" });
});

// Endpoints
app.post("/auth", ensureBrowser, async (req, res) => {
  const { linkedinUsername, linkedinPassword, emailUsername, emailPassword, emailHost, emailPort, captchaApiKey } = req.body;
  try {
    const authManager = new LinkedInAuthManager();
    const li_at = await authManager.loginWithVerificationAndCaptcha(
      linkedinUsername, linkedinPassword, emailUsername, emailPassword, emailHost, emailPort, captchaApiKey
    );
    res.status(200).json({ message: "Authentication successful", li_at });
  } catch (error) {
    console.error("[ERROR] Authentication failed:", error.message);
    res.status(500).json({ error: error.message });
  }
});

app.post("/scrape-jobs", ensureBrowser, async (req, res) => {
  const { searchTerm, location, li_at, maxJobs } = req.body;
  try {
    const results = await getJobListings(browser, searchTerm, location, li_at, maxJobs);
    res.status(200).json(results);
  } catch (error) {
    console.error("[ERROR] Failed to scrape jobs:", error.message);
    res.status(500).json({ error: error.message });
  }
});

app.post("/job-details", ensureBrowser, async (req, res) => {
  const { jobUrl, li_at } = req.body;
  try {
    const details = await getJobDetails(browser, jobUrl, li_at);
    res.status(200).json(details);
  } catch (error) {
    console.error("[ERROR] Failed to fetch job details:", error.message);
    res.status(500).json({ error: error.message });
  }
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`[INFO] Server running on port ${PORT}`);
});
