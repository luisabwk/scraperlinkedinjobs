// Carregando variáveis de ambiente no início
require('dotenv').config({ path: __dirname + '/.env' });

const express = require("express");
const cors = require("cors");
const puppeteerExtra = require("puppeteer-extra");
const LinkedInAuthManager = require("./auth/linkedinAuth");
const getJobListings = require("./jobs/scrape-jobs");
const getJobDetails = require("./jobs/job-details");

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
      
      // Configurando o proxy rotativo do IPRoyal
      const proxyUrl = `http://${process.env.PROXY_HOST}:${process.env.PROXY_PORT}`;
      console.log(`[INFO] Using proxy: ${proxyUrl}`);
      
      browser = await puppeteerExtra.launch({
        headless: true,
        args: [
          "--no-sandbox",
          "--disable-setuid-sandbox",
          "--disable-dev-shm-usage",
          "--disable-gpu",
          "--no-zygote",
          "--single-process",
          `--proxy-server=${proxyUrl}`
        ],
      });
      
      // Verificar se o browser foi inicializado corretamente
      if (!browser) {
        throw new Error("Failed to create browser instance");
      }
      
      // Log de confirmação
      console.log("[INFO] Browser initialized successfully with proxy configuration");
    }
    next();
  } catch (error) {
    console.error("[ERROR] Failed to initialize browser:", error.message);
    res.status(500).json({ error: "Failed to initialize browser", details: error.message });
  }
}

// Criar um router Express para as rotas da API
const router = express.Router();

// Status endpoint
router.get("/status", (req, res) => {
  res.status(200).json({ 
    status: "online", 
    message: "API is running",
    environment: process.env.NODE_ENV,
    proxyConfigured: !!process.env.PROXY_HOST && !!process.env.PROXY_PORT
  });
});

// Auth endpoint
router.post("/auth", ensureBrowser, async (req, res) => {
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

// Scrape jobs endpoint
router.post("/scrape-jobs", ensureBrowser, async (req, res) => {
  const { searchTerm, location, li_at, maxJobs } = req.body;
  try {
    const results = await getJobListings(browser, searchTerm, location, li_at, maxJobs);
    res.status(200).json(results);
  } catch (error) {
    console.error("[ERROR] Failed to scrape jobs:", error.message);
    res.status(500).json({ error: error.message });
  }
});

// Job details endpoint
router.post("/job-details", ensureBrowser, async (req, res) => {
  const { jobUrl, li_at } = req.body;
  try {
    const details = await getJobDetails(browser, jobUrl, li_at);
    res.status(200).json(details);
  } catch (error) {
    console.error("[ERROR] Failed to fetch job details:", error.message);
    res.status(500).json({ error: error.message });
  }
});

// Montar o router duas vezes:
// 1. Na raiz para suportar requisições sem prefixo
app.use('/', router);

// 2. No prefixo /jobs para suportar requisições com o prefixo
app.use('/jobs', router);

// Rota de catchall para depuração de URLs não encontradas
app.use('*', (req, res) => {
  console.log(`[ERROR] Rota não encontrada: ${req.method} ${req.originalUrl}`);
  res.status(404).send(`Rota não encontrada: ${req.method} ${req.originalUrl}. Verifique o caminho da URL.`);
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, '0.0.0.0', () => { // Listen em todas as interfaces de rede
  console.log(`[INFO] Server running on port ${PORT}`);
  console.log(`[INFO] Environment: ${process.env.NODE_ENV}`);
  console.log(`[INFO] Proxy configured: ${!!process.env.PROXY_HOST && !!process.env.PROXY_PORT}`);
  if (process.env.PROXY_HOST && process.env.PROXY_PORT) {
    console.log(`[INFO] Proxy host: ${process.env.PROXY_HOST}`);
    console.log(`[INFO] Proxy port: ${process.env.PROXY_PORT}`);
  }
});