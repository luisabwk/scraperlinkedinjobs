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
          `--proxy-server=${proxyUrl}`,
          "--lang=pt-BR,pt",
          "--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36"
        ],
        ignoreHTTPSErrors: true,
        defaultViewport: {
          width: 1920,
          height: 1080,
          deviceScaleFactor: 1,
          hasTouch: false,
          isLandscape: true,
          isMobile: false
        },
        timeout: 180000
      });
      
      // Verificar se o browser foi inicializado corretamente
      if (!browser) {
        throw new Error("Failed to create browser instance");
      }
      
      // Log de confirmação
      console.log("[INFO] Browser initialized successfully with proxy configuration");
      
      // Configurar evento para lidar com desconexões inesperadas
      browser.on('disconnected', () => {
        console.warn('[WARN] Browser was disconnected unexpectedly');
        browser = null; // Permitir que seja recriado na próxima solicitação
      });
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
  let browserStatus = "not initialized";
  if (browser) {
    browserStatus = browser.isConnected() ? "connected" : "disconnected";
  }
  
  res.status(200).json({ 
    status: "online", 
    message: "API is running",
    environment: process.env.NODE_ENV || "development",
    browserStatus: browserStatus,
    proxyConfigured: !!process.env.PROXY_HOST && !!process.env.PROXY_PORT,
    timestamp: new Date().toISOString()
  });
});

// Auth endpoint
router.post("/auth", ensureBrowser, async (req, res) => {
  const { linkedinUsername, linkedinPassword, emailUsername, emailPassword, emailHost, emailPort, captchaApiKey } = req.body;
  
  // Validação básica
  if (!linkedinUsername || !linkedinPassword) {
    return res.status(400).json({ 
      error: "Missing required parameters", 
      details: "linkedinUsername and linkedinPassword are required" 
    });
  }
  
  try {
    console.log(`[INFO] Starting authentication process for user: ${linkedinUsername.substring(0, 3)}...`);
    
    const authManager = new LinkedInAuthManager();
    const li_at = await authManager.loginWithVerificationAndCaptcha(
      linkedinUsername, linkedinPassword, emailUsername, emailPassword, emailHost, emailPort, captchaApiKey
    );
    
    console.log(`[SUCCESS] Authentication successful for user: ${linkedinUsername.substring(0, 3)}...`);
    res.status(200).json({ 
      message: "Authentication successful", 
      li_at, 
      timestamp: new Date().toISOString() 
    });
  } catch (error) {
    console.error("[ERROR] Authentication failed:", error.message);
    res.status(500).json({ 
      error: "Authentication failed", 
      details: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Scrape jobs endpoint
router.post("/scrape-jobs", ensureBrowser, async (req, res) => {
  const { searchTerm, location, li_at, maxJobs = 100 } = req.body;
  
  // Validação básica
  if (!searchTerm || !location || !li_at) {
    return res.status(400).json({ 
      error: "Missing required parameters", 
      details: "searchTerm, location, and li_at are required" 
    });
  }
  
  try {
    console.log(`[INFO] Starting job scraping for "${searchTerm}" in "${location}"`);
    
    const results = await getJobListings(browser, searchTerm, location, li_at, maxJobs);
    
    console.log(`[SUCCESS] Found ${results.totalVagas} jobs for "${searchTerm}" in "${location}"`);
    res.status(200).json({
      ...results,
      timestamp: new Date().toISOString(),
      query: { searchTerm, location, maxJobs }
    });
  } catch (error) {
    console.error("[ERROR] Failed to scrape jobs:", error.message);
    res.status(500).json({ 
      error: "Failed to scrape jobs", 
      details: error.message,
      query: { searchTerm, location, maxJobs },
      timestamp: new Date().toISOString()
    });
  }
});

// Job details endpoint
router.post("/job-details", ensureBrowser, async (req, res) => {
  const { jobUrl, li_at } = req.body;
  
  // Validação básica
  if (!jobUrl || !li_at) {
    return res.status(400).json({ 
      error: "Missing required parameters", 
      details: "jobUrl and li_at are required" 
    });
  }
  
  try {
    console.log(`[INFO] Fetching details for job: ${jobUrl}`);
    
    const details = await getJobDetails(browser, jobUrl, li_at);
    
    console.log(`[SUCCESS] Retrieved details for job at ${jobUrl}`);
    res.status(200).json({
      ...details,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error("[ERROR] Failed to fetch job details:", error.message);
    res.status(500).json({ 
      error: "Failed to fetch job details", 
      details: error.message,
      jobUrl,
      timestamp: new Date().toISOString()
    });
  }
});

// Endpoint de healthcheck simples
router.get("/health", (req, res) => {
  res.status(200).send("OK");
});

// Endpoint para limpar o browser (útil para depuração)
router.post("/reset-browser", async (req, res) => {
  try {
    if (browser) {
      console.log("[INFO] Closing browser instance for reset");
      await browser.close();
      browser = null;
    }
    res.status(200).json({ 
      message: "Browser instance reset successfully",
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error("[ERROR] Failed to reset browser:", error.message);
    res.status(500).json({ 
      error: "Failed to reset browser", 
      details: error.message,
      timestamp: new Date().toISOString()
    });
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
  res.status(404).send({
    error: "Route not found",
    path: `${req.method} ${req.originalUrl}`,
    message: "Verifique o caminho da URL e tente novamente.",
    timestamp: new Date().toISOString()
  });
});

// Capturar erros não tratados
process.on('uncaughtException', (error) => {
  console.error('[CRITICAL] Uncaught exception:', error);
  // Em produção, você pode querer notificar um administrador ou reiniciar o serviço
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('[CRITICAL] Unhandled rejection at:', promise, 'reason:', reason);
});

// Função para garantir a limpeza ao encerrar o processo
function gracefulShutdown() {
  console.log('[INFO] Received shutdown signal, closing browser and server...');
  if (browser) {
    browser.close().catch(err => console.error('[ERROR] Error closing browser:', err));
  }
  process.exit(0);
}

// Registrar listeners para sinais de encerramento
process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

const PORT = process.env.PORT || 8080;
app.listen(PORT, '0.0.0.0', () => { // Listen em todas as interfaces de rede
  console.log(`[INFO] Server running on port ${PORT}`);
  console.log(`[INFO] Environment: ${process.env.NODE_ENV || "development"}`);
  console.log(`[INFO] Proxy configured: ${!!process.env.PROXY_HOST && !!process.env.PROXY_PORT}`);
  if (process.env.PROXY_HOST && process.env.PROXY_PORT) {
    console.log(`[INFO] Proxy host: ${process.env.PROXY_HOST}`);
    console.log(`[INFO] Proxy port: ${process.env.PROXY_PORT}`);
  }
});