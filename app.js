require('dotenv').config({ path: __dirname + '/.env' });

const express = require("express");
const cors = require("cors");
const puppeteerExtra = require("puppeteer-extra");
const LinkedInAuthManager = require("./auth/linkedinAuth");
const getJobListings = require("./jobs/scrape-jobs");
const getJobDetails = require("./jobs/job-details");
const fetch = require("node-fetch");
const HttpsProxyAgent = require("https-proxy-agent");

const app = express();
app.use(express.json());
app.use(cors());

// Middleware de log para depuração
app.use((req, res, next) => {
  console.log(`[REQUEST] ${new Date().toISOString()} - ${req.method} ${req.originalUrl}`);
  next();
});

// Configuração de timeout maior para requisições
app.use((req, res, next) => {
  res.setTimeout(300000); // 5 minutos
  next();
});

// Proxy configuration
const proxyHost = process.env.PROXY_HOST;
const proxyPort = process.env.PROXY_PORT;
const proxyUsername = process.env.PROXY_USERNAME;
const proxyPassword = process.env.PROXY_PASSWORD;
const proxyServer = `${proxyHost}:${proxyPort}`;
const proxyUrl = `http://${proxyUsername}:${proxyPassword}@${proxyHost}:${proxyPort}`;
const proxyAgent = new HttpsProxyAgent(proxyUrl);

// Single browser instance
let browser;

async function ensureBrowser(req, res, next) {
  try {
    if (!browser || !browser.isConnected()) {
      console.log("[INFO] Initializing browser with proxy...");
      browser = await puppeteerExtra.launch({
        headless: true,
        executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
        args: [
          "--no-sandbox",
          "--disable-setuid-sandbox",
          "--disable-dev-shm-usage",
          "--disable-gpu",
          "--disable-web-security",
          "--disable-features=IsolateOrigins,site-per-process",
          "--enable-unsafe-swiftshader",
          "--window-size=1920,1080",
          `--proxy-server=${proxyServer}`,
          "--lang=pt-BR,pt",
          "--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36"
        ],
        ignoreHTTPSErrors: true,
        defaultViewport: { width: 1920, height: 1080 }
      });
      console.log("[INFO] Browser initialized successfully");
      browser.on('disconnected', () => { console.warn('[WARN] Browser disconnected'); browser = null; });
      // teste de IP do proxy
      const resp = await fetch('https://icanhazip.com', { agent: proxyAgent });
      console.log('[INFO] Proxy IP:', (await resp.text()).trim());
    }
    next();
  } catch (err) {
    console.error('[ERROR] Failed to initialize browser:', err.message);
    res.status(500).json({ error: 'Failed to initialize browser', details: err.message });
  }
}

// Configura rota e autenticação
const router = express.Router();

router.get('/status', (req, res) => {
  res.json({ status: 'online', browser: browser?.isConnected() ? 'connected' : 'not connected', timestamp: new Date().toISOString() });
});

router.post('/auth', ensureBrowser, async (req, res) => {
  const { linkedinUsername, linkedinPassword, emailUsername, emailPassword, emailHost, emailPort, captchaApiKey } = req.body;
  if (!linkedinUsername || !linkedinPassword) return res.status(400).json({ error: 'linkedinUsername and linkedinPassword are required' });
  try {
    const authManager = new LinkedInAuthManager();
    const li_at = await authManager.loginWithVerificationAndCaptcha(
      linkedinUsername, linkedinPassword, emailUsername, emailPassword, emailHost, emailPort, captchaApiKey || process.env.TWOCAPTCHA_API_KEY
    );
    res.json({ message: 'Auth successful', li_at, timestamp: new Date().toISOString() });
  } catch (err) {
    console.error('[ERROR] Auth failed:', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.post('/scrape-jobs', ensureBrowser, async (req, res) => {
  const { searchTerm, location, li_at, maxJobs = 100 } = req.body;
  if (!searchTerm || !location || !li_at) return res.status(400).json({ error: 'searchTerm, location, and li_at are required' });
  try {
    const results = await getJobListings(browser, searchTerm, location, li_at, maxJobs);
    res.json({ ...results, timestamp: new Date().toISOString() });
  } catch (err) {
    console.error('[ERROR] scrape-jobs failed:', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.post('/job-details', ensureBrowser, async (req, res) => {
  const { jobUrl, li_at } = req.body;
  if (!jobUrl || !li_at) return res.status(400).json({ error: 'jobUrl and li_at are required' });
  try {
    const details = await getJobDetails(browser, jobUrl, li_at);
    res.json({ ...details, timestamp: new Date().toISOString() });
  } catch (err) {
    console.error('[ERROR] job-details failed:', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.get('/health', (req, res) => res.send('OK'));
router.post('/reset-browser', async (req, res) => { await browser?.close(); browser = null; res.json({ message: 'Browser reset', timestamp: new Date().toISOString() }); });

app.use('/', router);
app.use('/jobs', router);
app.use('*', (req, res) => res.status(404).json({ error: 'Route not found', path: req.originalUrl, timestamp: new Date().toISOString() }));

process.on('uncaughtException', err => console.error('[CRITICAL] UncaughtException', err));
process.on('unhandledRejection', (reason, p) => console.error('[CRITICAL] UnhandledRejection', reason));

function gracefulShutdown() { console.log('[INFO] Shutdown'); browser?.close(); process.exit(); }
process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

const PORT = process.env.PORT || 8080;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`[INFO] Server running on port ${PORT}`);
});

module.exports = app;
