#!/bin/bash

# Script para atualizar o proxy rotativo do IPRoyal
# Autor: Claude
# Data: 11/04/2025

# Definir cores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
NC='\033[0m' # No Color

# Diretório da aplicação
APP_DIR="/apps/scraperlinkedinjobs"

echo -e "${YELLOW}Iniciando atualização do proxy rotativo IPRoyal...${NC}"

# Verificar se o diretório existe
if [ ! -d "$APP_DIR" ]; then
    echo -e "${RED}Erro: Diretório $APP_DIR não encontrado.${NC}"
    echo -e "${YELLOW}Verifique o caminho correto da aplicação e tente novamente.${NC}"
    exit 1
fi

# Navegar até o diretório da aplicação
cd "$APP_DIR"
echo -e "${GREEN}Diretório da aplicação encontrado.${NC}"

# Backup dos arquivos originais
echo -e "${YELLOW}Criando backup dos arquivos originais...${NC}"
BACKUP_DIR="$APP_DIR/backup_$(date +%Y%m%d%H%M%S)"
mkdir -p "$BACKUP_DIR"

cp .env "$BACKUP_DIR/" 2>/dev/null || echo -e "${YELLOW}Arquivo .env não encontrado para backup.${NC}"
cp app.js "$BACKUP_DIR/" || echo -e "${RED}Erro ao fazer backup do app.js${NC}"
cp auth/linkedinAuth.js "$BACKUP_DIR/" || echo -e "${RED}Erro ao fazer backup do linkedinAuth.js${NC}"
cp jobs/job-details.js "$BACKUP_DIR/" || echo -e "${RED}Erro ao fazer backup do job-details.js${NC}"
cp jobs/scrape-jobs.js "$BACKUP_DIR/" || echo -e "${RED}Erro ao fazer backup do scrape-jobs.js${NC}"

echo -e "${GREEN}Backup concluído em $BACKUP_DIR${NC}"

# Atualizar o arquivo .env
echo -e "${YELLOW}Atualizando arquivo .env...${NC}"
cat > .env << EOL
RAILWAY_TIMEOUT=60
RAILWAY_MEMORY_MB=2048
PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

# Configuração do proxy residencial rotativo
PROXY_HOST=geo.iproyal.com
PROXY_PORT=12321
PROXY_USERNAME=d4Xzafgb5TJfSLpI
PROXY_PASSWORD=YQhSnyw789HDtj4u_streaming-1
PROXY_URL=http://geo.iproyal.com:12321
EOL

echo -e "${GREEN}Arquivo .env atualizado com sucesso.${NC}"

# Atualizar os arquivos de código
echo -e "${YELLOW}Atualizando auth/linkedinAuth.js...${NC}"
cat > auth/linkedinAuth.js << 'EOL'
const puppeteer = require("puppeteer");
const { ProxyAgent } = require("undici");
const fetch = require("node-fetch");
require('dotenv').config();

class LinkedInAuthManager {
  async loginWithVerificationAndCaptcha(
    linkedinUsername,
    linkedinPassword,
    emailUsername,
    emailPassword,
    emailHost,
    emailPort,
    captchaApiKey
  ) {
    // Usando variáveis de ambiente para as credenciais do proxy rotativo
    const proxyHost = process.env.PROXY_HOST;
    const proxyPort = process.env.PROXY_PORT;
    const username = process.env.PROXY_USERNAME;
    const password = process.env.PROXY_PASSWORD;
    const proxyUrl = `http://${proxyHost}:${proxyPort}`;

    try {
      console.log("[INFO] Testing proxy with LinkedIn login page...");
      const proxyAgent = new ProxyAgent(proxyUrl, {
        headers: {
          "Proxy-Authorization": `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`,
        },
      });

      const response = await fetch("https://www.linkedin.com/login", {
        dispatcher: proxyAgent,
        timeout: 120000,
      });

      if (!response.ok) {
        throw new Error(`Proxy test failed with status ${response.status}`);
      }

      console.log("[INFO] Proxy test successful. Launching Puppeteer...");
      const browser = await puppeteer.launch({
        headless: true,
        args: [
          "--no-sandbox",
          "--disable-setuid-sandbox",
          `--proxy-server=${proxyUrl}`,
        ],
        protocolTimeout: 120000, // Timeout global para Puppeteer
        dumpio: true, // Habilita logs detalhados
      });

      const page = await browser.newPage();
      await page.authenticate({ username, password });
      await page.setUserAgent(
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/109.0.0.0 Safari/537.36"
      );

      console.log("[INFO] Navigating to LinkedIn login page...");
      await page.goto("https://www.linkedin.com/login", { waitUntil: "networkidle2", timeout: 120000 });

      console.log("[INFO] Filling login credentials...");
      await page.waitForSelector("#username", { timeout: 60000 });
      await page.type("#username", linkedinUsername);
      await page.type("#password", linkedinPassword);

      console.log("[INFO] Attempting to login...");
      await page.click(".btn__primary--large.from__button--floating");

      try {
        console.log("[INFO] Waiting for navigation to complete...");
        await page.waitForSelector(".global-nav__primary-link", { timeout: 120000 });
        console.log("[INFO] Successfully logged in and reached the homepage.");
      } catch (error) {
        console.error("[ERROR] Navigation timeout. Capturing screenshot...");
        await page.screenshot({ path: "login_failed.png" });
        throw new Error("Timeout ao navegar para a página inicial após o login.");
      }

      const cookies = await page.cookies();
      const li_at = cookies.find((cookie) => cookie.name === "li_at")?.value;

      if (!li_at) {
        throw new Error("Failed to retrieve li_at cookie.");
      }

      console.log("[INFO] Authentication successful. Returning li_at cookie.");
      await browser.close();
      return li_at;
    } catch (error) {
      console.error("[ERROR] LinkedIn login failed:", error);
      throw error;
    }
  }
}

module.exports = LinkedInAuthManager;
EOL

echo -e "${GREEN}auth/linkedinAuth.js atualizado com sucesso.${NC}"

echo -e "${YELLOW}Atualizando jobs/job-details.js...${NC}"
cat > jobs/job-details.js << 'EOL'
const puppeteer = require("puppeteer");
require('dotenv').config();

async function getJobDetails(browser, jobUrl, li_at) {
  console.log(`[INFO] Accessing job details: ${jobUrl}`);
  let page = null;
  let jobDetails = {};

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
    
    await page.setViewport({ width: 1920, height: 1080 });
    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36"
    );

    const cookies = [{ name: "li_at", value: li_at, domain: ".linkedin.com" }];
    await page.setCookie(...cookies);

    // Intercept window.open
    await page.evaluateOnNewDocument(() => {
      const originalOpen = window.open;
      window.open = function (...args) {
        window.__NEW_TAB_URL__ = args[0];
        return originalOpen.apply(window, args);
      };
    });

    await page.goto(jobUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
    console.log("[INFO] Job page loaded successfully.");

    const seeMoreButtonSelector = ".jobs-description__footer-button";
    const applyButtonSelector = ".jobs-apply-button--top-card";

    // Expand full job description
    try {
      await page.waitForSelector(seeMoreButtonSelector, { timeout: 5000 });
      await page.click(seeMoreButtonSelector);
      console.log("[INFO] 'See more' button clicked.");
    } catch {
      console.warn("[WARN] 'See more' button not found or clickable.");
    }

    // Extract main job details
    jobDetails = await page.evaluate(() => {
      const title = document.querySelector(".job-details-jobs-unified-top-card__job-title")?.innerText.trim() || "";
      const company = document.querySelector(".job-details-jobs-unified-top-card__company-name")?.innerText.trim() || "";
      const locationData = document.querySelector(".job-details-jobs-unified-top-card__primary-description-container")?.innerText.trim() || "";
      const description = document.querySelector("#job-details")?.innerText.trim() || "";

      return {
        title,
        company,
        location: locationData.split(" ·")[0].trim() || "",
        description,
        applyUrl: null
      };
    });

    console.log("[INFO] Checking application URL...");

    // Handle the apply button
    try {
      const applyButton = await page.$(applyButtonSelector);
      if (applyButton) {
        const buttonText = await page.evaluate(button => button.textContent.trim(), applyButton);

        if (buttonText.includes("Candidatura simplificada")) {
          console.log("[INFO] 'Candidatura simplificada' detected. Using jobUrl as applyUrl.");
          jobDetails.applyUrl = jobUrl;
        } else if (buttonText.includes("Candidatar-se")) {
          console.log("[INFO] 'Candidatar-se' detected. Clicking apply button...");
          await applyButton.click();

          // Wait for potential redirection or new tab
          await new Promise(resolve => setTimeout(resolve, 3000));

          const possibleNewTabUrl = await page.evaluate(() => window.__NEW_TAB_URL__);
          if (possibleNewTabUrl) {
            jobDetails.applyUrl = possibleNewTabUrl;
            console.log("[INFO] Application URL detected via window.open:", possibleNewTabUrl);
          } else {
            console.log("[INFO] No valid URL detected via window.open. Checking new tab...");
            const newPagePromise = new Promise(resolve => browser.once('targetcreated', target => resolve(target.page())));
            const newPage = await newPagePromise;

            if (newPage) {
              const applyUrl = newPage.url();
              jobDetails.applyUrl = applyUrl;
              console.log("[INFO] Application URL detected in new tab:", applyUrl);
              await newPage.close();
            } else {
              console.log("[WARN] No valid application URL detected. Using jobUrl as fallback.");
              jobDetails.applyUrl = jobUrl;
            }
          }
        } else {
          console.log("[INFO] External application detected. Using jobUrl as fallback.");
          jobDetails.applyUrl = jobUrl;
        }
      } else {
        console.warn("[WARN] Apply button not found.");
        jobDetails.applyUrl = jobUrl;
      }
    } catch (error) {
      console.error("[ERROR] Error while processing application URL:", error.message);
      jobDetails.applyUrl = jobUrl;
    }

    return jobDetails;
  } catch (error) {
    console.error("[ERROR] Failed to get job details:", error.message);
    throw new Error(`Error getting job details: ${error.message}`);
  } finally {
    if (page) {
      await page.close();
      console.log("[INFO] Page closed successfully.");
    }
  }
}

module.exports = getJobDetails;
EOL

echo -e "${GREEN}jobs/job-details.js atualizado com sucesso.${NC}"

echo -e "${YELLOW}Atualizando jobs/scrape-jobs.js...${NC}"
cat > jobs/scrape-jobs.js << 'EOL'
const puppeteer = require("puppeteer");
require('dotenv').config();

async function waitForNetworkIdle(page, timeout = 10000, maxInflightRequests = 0) {
  try {
    await page.waitForNetworkIdle({ 
      idleTime: 500, 
      timeout: timeout,
      maxInflightRequests: maxInflightRequests 
    });
  } catch (error) {
    console.warn('[WARN] Network idle timeout reached, continuing anyway');
  }
}

async function getJobListings(browser, searchTerm, location, li_at, maxJobs) {
  console.log("[DEBUG] Iniciando o processo de getJobListings...");
  let allJobs = [];
  const baseUrl = `https://www.linkedin.com/jobs/search?keywords=${encodeURIComponent(searchTerm)}&location=${encodeURIComponent(location)}&geoId=106057199&f_TPR=r86400`;

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
    
    await page.setViewport({ width: 1920, height: 1080 });
    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36"
    );

    const cookies = [
      {
        name: "li_at",
        value: li_at,
        domain: ".linkedin.com",
      },
    ];
    await page.setCookie(...cookies);
    console.log("[INFO] Cookie 'li_at' configurado com sucesso.");

    await page.setRequestInterception(true);
    page.on('request', (req) => {
      const resourceType = req.resourceType();
      if (resourceType === 'image' || resourceType === 'media' || resourceType === 'font' || resourceType === 'stylesheet') {
        req.abort();
      } else {
        req.continue();
      }
    });

    let maxRetries = 3;
    let currentRetry = 0;
    let success = false;

    while (currentRetry < maxRetries && !success) {
      try {
        console.log(`[INFO] Navigation attempt ${currentRetry + 1} of ${maxRetries}`);
        
        await Promise.race([
          page.goto(baseUrl, { 
            waitUntil: "domcontentloaded",
            timeout: 120000
          }),
          new Promise((resolve, reject) => {
            setTimeout(() => {
              reject(new Error('Individual navigation timeout of 120000ms exceeded'));
            }, 120000);
          })
        ]);

        // Wait for job listings container
        await Promise.race([
          page.waitForSelector('.scaffold-layout__list', { timeout: 30000 }),
          new Promise(resolve => setTimeout(resolve, 30000))
        ]);

        await waitForNetworkIdle(page, 10000);
        success = true;
        console.log('[INFO] Navigation successful');
      } catch (error) {
        currentRetry++;
        console.warn(`[WARN] Navigation attempt ${currentRetry} failed:`, error.message);
        
        if (currentRetry === maxRetries) {
          throw new Error(`All navigation attempts failed: ${error.message}`);
        }
        
        // Clear memory and wait before retry
        await page.evaluate(() => window.stop());
        await new Promise(resolve => setTimeout(resolve, 5000));
      }
    }

    console.log("[INFO] Página inicial acessada com sucesso.");

    let totalPages = 1;
    try {
      await page.waitForSelector(".artdeco-pagination__pages.artdeco-pagination__pages--number", { timeout: 20000 });
      totalPages = await page.$eval(
        ".artdeco-pagination__pages.artdeco-pagination__pages--number li button",
        (buttons) => Math.max(...buttons.map((el) => parseInt(el.innerText.trim())).filter(n => !isNaN(n)))
      );
      console.info(`[INFO] Número total de páginas: ${totalPages}`);
    } catch (error) {
      console.warn("[WARN] Não foi possível obter o número total de páginas, continuando com uma página.");
    }

    for (let currentPage = 1; currentPage <= totalPages; currentPage++) {
      console.info(`[INFO] Scraping página ${currentPage} de ${totalPages}...`);

      if (currentPage > 1) {
        const pageURL = `${baseUrl}&start=${(currentPage - 1) * 25}`;
        
        let pageSuccess = false;
        let pageRetries = 3;
        
        while (!pageSuccess && pageRetries > 0) {
          try {
            await page.goto(pageURL, { 
              waitUntil: "domcontentloaded",
              timeout: 60000 
            });
            await page.waitForSelector('.scaffold-layout__list', { timeout: 30000 });
            pageSuccess = true;
          } catch (error) {
            pageRetries--;
            console.warn(`[WARN] Failed to load page ${currentPage}, retries left: ${pageRetries}`);
            if (pageRetries === 0) throw error;
            await new Promise(resolve => setTimeout(resolve, 5000));
          }
        }
      }

      const jobsResult = await page.evaluate(() => {
        const jobElements = Array.from(document.querySelectorAll(".job-card-container--clickable"));
        return jobElements.map((job) => {
          const title = job.querySelector(".job-card-list__title--link")?.innerText.trim().replace(/\n/g, " ");
          const company = job.querySelector(".artdeco-entity-lockup__subtitle")?.innerText.trim();
          const locationData = job.querySelector(".job-card-container__metadata-wrapper")?.innerText.trim();

          let location = "";
          let formato = "";

          if (locationData) {
            const formatMatch = locationData.match(/\(([^)]+)\)/);
            if (formatMatch) {
              formato = formatMatch[1].trim();
            }
            location = locationData.replace(/\(.*?\)/, "").trim();
          }

          const link = job.querySelector("a")?.href;

          return {
            vaga: title || "",
            empresa: company || "",
            local: location || "",
            formato: formato || "",
            link: link || "",
          };
        });
      });

      console.log(`[INFO] Found ${jobsResult.length} jobs on page ${currentPage}`);

      jobsResult.forEach((job) => {
        if (job.link) {
          const jobIdMatch = job.link.match(/(\d+)/);
          if (jobIdMatch) {
            const jobId = jobIdMatch[0];
            if (!allJobs.some((j) => j.link.includes(jobId))) {
              allJobs.push(job);
            }
          }
        }
      });

      console.log(`[INFO] Total de vagas coletadas até agora: ${allJobs.length}`);

      if (allJobs.length >= maxJobs) {
        console.info(`[INFO] Número máximo de vagas (${maxJobs}) alcançado.`);
        break;
      }

      // Wait between pages to avoid rate limiting
      if (currentPage < totalPages) {
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }

    console.log(`[INFO] Total de vagas coletadas: ${allJobs.length}`);
    return { totalVagas: allJobs.length, vagas: allJobs.slice(0, maxJobs) };
  } catch (error) {
    console.error("[ERROR] Erro ao realizar scraping:", error);
    throw new Error(`Erro durante o scraping: ${error.message}`);
  } finally {
    if (page) {
      try {
        await page.close();
        console.log("[INFO] Page closed successfully");
      } catch (closeError) {
        console.error("[ERROR] Error closing page:", closeError);
      }
    }
  }
}

module.exports = getJobListings;
EOL

echo -e "${GREEN}jobs/scrape-jobs.js atualizado com sucesso.${NC}"

echo -e "${YELLOW}Atualizando app.js...${NC}"
cat > app.js << 'EOL'
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

// Status endpoint - Rota original
app.get("/status", (req, res) => {
  res.status(200).json({ 
    status: "online", 
    message: "API is running",
    environment: process.env.NODE_ENV,
    proxyConfigured: !!process.env.PROXY_HOST && !!process.env.PROXY_PORT
  });
});

// Status endpoint - Com prefixo /jobs
app.get("/jobs/status", (req, res) => {
  res.status(200).json({ 
    status: "online", 
    message: "API is running",
    environment: process.env.NODE_ENV,
    proxyConfigured: !!process.env.PROXY_HOST && !!process.env.PROXY_PORT
  });
});

// Auth endpoint - Rota original
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

// Auth endpoint - Com prefixo /jobs
app.post("/jobs/auth", ensureBrowser, async (req, res) => {
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

// Scrape jobs endpoint - Rota original
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

// Scrape jobs endpoint - Com prefixo /jobs
app.post("/jobs/scrape-jobs", ensureBrowser, async (req, res) => {
  const { searchTerm, location, li_at, maxJobs } = req.body;
  try {
    const results = await getJobListings(browser, searchTerm, location, li_at, maxJobs);
    res.status(200).json(results);
  } catch (error) {
    console.error("[ERROR] Failed to scrape jobs:", error.message);
    res.status(500).json({ error: error.message });
  }
});

// Job details endpoint - Rota original
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

// Job details endpoint - Com prefixo /jobs
app.post("/jobs/job-details", ensureBrowser, async (req, res) => {
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
  console.log(`[INFO] Environment: ${process.env.NODE_ENV}`);
  console.log(`[INFO] Proxy configured: ${!!process.env.PROXY_HOST && !!process.env.PROXY_PORT}`);
  if (process.env.PROXY_HOST && process.env.PROXY_PORT) {
    console.log(`[INFO] Proxy host: ${process.env.PROXY_HOST}`);
    console.log(`[INFO] Proxy port: ${process.env.PROXY_PORT}`);
  }
});
EOL

echo -e "${GREEN}app.js atualizado com sucesso.${NC}"

# Reiniciar o serviço com o PM2
echo -e "${YELLOW}Reiniciando o serviço com PM2...${NC}"
pm2 reload linkedin-scraper || pm2 restart linkedin-scraper || pm2 start app.js --name "linkedin-scraper"

# Verificar se o serviço está funcionando
echo -e "${YELLOW}Verificando status do serviço...${NC}"
pm2 status linkedin-scraper

echo -e "${GREEN}==================================================${NC}"
echo -e "${GREEN}Atualização do proxy rotativo IPRoyal concluída!${NC}"
echo -e "${GREEN}==================================================${NC}"
echo
echo -e "${YELLOW}Instruções adicionais:${NC}"
echo -e "1. Verifique os logs com: ${GREEN}pm2 logs linkedin-scraper${NC}"
echo -e "2. Se encontrar problemas, restaure o backup com: ${GREEN}cp $BACKUP_DIR/* . -r${NC}"
echo -e "3. Logs de erro podem ser encontrados em: ${GREEN}~/.pm2/logs/linkedin-scraper-error.log${NC}"
echo
echo -e "${GREEN}Obrigado por usar o script de atualização!${NC}"