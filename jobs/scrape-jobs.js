const puppeteer = require("puppeteer");
const fs = require("fs").promises;
const path = require("path");
require('dotenv').config();

// Cria diretório para screenshots se não existir
async function ensureScreenshotDir() {
  const dir = path.join(__dirname, "../screenshots");
  try {
    await fs.mkdir(dir, { recursive: true });
    return dir;
  } catch (error) {
    console.error("[ERROR] Falha ao criar diretório de screenshots:", error);
    return null;
  }
}

// Função melhorada para esperar pelo carregamento da rede
async function waitForNetworkIdle(page, timeout = 15000, maxInflightRequests = 0) {
  try {
    await page.waitForNetworkIdle({ 
      idleTime: 1000, 
      timeout: timeout,
      maxInflightRequests: maxInflightRequests 
    });
    return true;
  } catch (error) {
    console.warn('[WARN] Network idle timeout reached, continuing anyway');
    return false;
  }
}

// Função principal para raspagem de vagas
async function getJobListings(browser, searchTerm, location, li_at, maxJobs = 100) {
  console.log("[DEBUG] Iniciando o processo de getJobListings...");
  let allJobs = [];
  const baseUrl = `https://www.linkedin.com/jobs/search?keywords=${encodeURIComponent(searchTerm)}&location=${encodeURIComponent(location)}&geoId=106057199&f_TPR=r86400`;
  const screenshotDir = await ensureScreenshotDir();

  console.log(`[INFO] Acessando a URL inicial: ${baseUrl}`);

  if (!browser || typeof browser.newPage !== "function") {
    throw new Error("Navegador Puppeteer não inicializado corretamente.");
  }

  let page = null;

  try {
    page = await browser.newPage();
    
    // Configurar proxy rotativo do IPRoyal
    const proxyUsername = process.env.PROXY_USERNAME;
    const proxyPassword = process.env.PROXY_PASSWORD;
    
    if (proxyUsername && proxyPassword) {
      console.log("[INFO] Configurando proxy rotativo do IPRoyal...");
      await page.authenticate({
        username: proxyUsername,
        password: proxyPassword
      });
    } else {
      console.warn("[WARN] Credenciais de proxy não encontradas nas variáveis de ambiente.");
    }
    
    // Configuração avançada do navegador
    await page.setViewport({ width: 1920, height: 1080 });
    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36"
    );
    await page.setExtraHTTPHeaders({
      'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7'
    });

    // Configurar cookies
    const cookies = [
      {
        name: "li_at",
        value: li_at,
        domain: ".linkedin.com",
      },
      //
