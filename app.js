const express = require("express");
const cors = require("cors");
const puppeteer = require("puppeteer");
const getJobListings = require("./jobs/scrape-jobs");
const getJobDetails = require("./jobs/job-details");

const app = express();

// Configurações básicas
app.use(cors());
app.use(express.json());

// Log de requisições
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// Rota de healthcheck
app.get("/", (req, res) => {
  res.status(200).json({
    status: "ok",
    message: "API está funcionando"
  });
});

// Endpoint para scraping de vagas
app.post("/scrape-jobs", async (req, res) => {
  console.log("[INFO] Iniciando /scrape-jobs");
  console.log("[DEBUG] Request body:", JSON.stringify(req.body));
  
  const { searchTerm, location, li_at, maxJobs = 50 } = req.body;
  
  if (!li_at || !searchTerm || !location) {
    return res.status(400).json({
      error: "Parâmetros 'li_at', 'searchTerm' e 'location' são obrigatórios."
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

// Endpoint para detalhes da vaga
app.post("/job-details", async (req, res) => {
  console.log("[INFO] Iniciando /job-details");
  console.log("[DEBUG] Request body:", JSON.stringify(req.body));
  
  const { jobUrl, li_at } = req.body;
  
  if (!jobUrl || !li_at) {
    return res.status(400).json({
      error: "Parâmetros 'jobUrl' e 'li_at' são obrigatórios."
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

// Middleware para rotas não encontradas
app.use((req, res) => {
  console.log(`[WARN] Rota não encontrada: ${req.method} ${req.path}`);
  res.status(404).json({ error: "Endpoint não encontrado" });
});

// Inicialização do servidor
const PORT = process.env.PORT || 3000;

const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`[${new Date().toISOString()}] Servidor rodando na porta ${PORT}`);
});

// Tratamento de erros do servidor
server.on('error', (error) => {
  console.error('[ERROR] Erro no servidor:', error);
  if (error.code === 'EADDRINUSE') {
    console.log(`[WARN] Porta ${PORT} em uso`);
    process.exit(1);
  }
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('[INFO] SIGTERM recebido. Encerrando...');
  server.close(() => process.exit(0));
});

process.on('SIGINT', () => {
  console.log('[INFO] SIGINT recebido. Encerrando...');
  server.close(() => process.exit(0));
});

module.exports = app;
