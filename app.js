const express = require("express");
const cors = require("cors");
const puppeteer = require("puppeteer");
const getJobListings = require("./jobs/scrape-jobs");
const getJobDetails = require("./jobs/job-details");
const LinkedInAuthManager = require('./auth/linkedinAuth');

const app = express();
app.use(cors());
app.use(express.json());

const authManager = new LinkedInAuthManager();

app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

app.get("/", (req, res) => {
  res.status(200).json({
    status: "ok",
    message: "API está funcionando"
  });
});

app.post("/scrape-jobs", async (req, res) => {
  const { searchTerm, location, username, password, maxJobs = 50 } = req.body;
  
  if (!searchTerm || !location || !username || !password) {
    return res.status(400).json({
      error: "Parâmetros 'searchTerm', 'location', 'username' e 'password' são obrigatórios."
    });
  }

  let browser;
  try {
    browser = await puppeteer.launch({
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
        "--disable-software-rasterizer",
      ]
    });

    const li_at = await authManager.getCookie(username, password);
    const jobs = await getJobListings(browser, searchTerm, location, li_at, maxJobs);
    
    res.status(200).json({
      message: "Scraping realizado com sucesso!",
      totalVagas: jobs.totalVagas,
      jobs: jobs.vagas
    });
  } catch (error) {
    console.error("[ERROR] Erro no /scrape-jobs:", error);
    res.status(500).json({ 
      error: "Erro durante o scraping",
      details: error.message 
    });
  } finally {
    if (browser) {
      await browser.close().catch(console.error);
    }
  }
});

app.post("/job-details", async (req, res) => {
  const { jobUrl, username, password } = req.body;
  
  if (!jobUrl || !username || !password) {
    return res.status(400).json({
      error: "Parâmetros 'jobUrl', 'username' e 'password' são obrigatórios."
    });
  }

  let browser;
  try {
    browser = await puppeteer.launch({
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
        "--disable-software-rasterizer",
      ]
    });

    const li_at = await authManager.getCookie(username, password);
    const jobDetails = await getJobDetails(browser, jobUrl, li_at);
    
    res.status(200).json({
      message: "Detalhes da vaga obtidos com sucesso!",
      jobDetails
    });
  } catch (error) {
    console.error("[ERROR] Erro no /job-details:", error);
    res.status(500).json({ 
      error: "Erro ao obter detalhes da vaga",
      details: error.message 
    });
  } finally {
    if (browser) {
      await browser.close().catch(console.error);
    }
  }
});

app.use((req, res) => {
  console.log(`[WARN] Rota não encontrada: ${req.method} ${req.path}`);
  res.status(404).json({ error: "Endpoint não encontrado" });
});

const PORT = process.env.PORT || 3000;

const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`[${new Date().toISOString()}] Servidor rodando na porta ${PORT}`);
});

server.on('error', (error) => {
  console.error('[ERROR] Erro no servidor:', error);
  if (error.code === 'EADDRINUSE') {
    console.log(`[WARN] Porta ${PORT} em uso`);
    process.exit(1);
  }
});

process.on('SIGTERM', () => {
  console.log('[INFO] SIGTERM recebido. Encerrando...');
  server.close(() => process.exit(0));
});

process.on('SIGINT', () => {
  console.log('[INFO] SIGINT recebido. Encerrando...');
  server.close(() => process.exit(0));
});

module.exports = app;
