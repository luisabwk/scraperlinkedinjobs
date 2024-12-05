const express = require("express");
const cors = require("cors");
const puppeteer = require("puppeteer");
const getJobListings = require("./jobs/scrape-jobs");
const getJobDetails = require("./jobs/job-details");

const app = express();

// Configurações básicas
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Log de todas as requisições
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// Rota de healthcheck
app.get("/", (req, res) => {
  res.status(200).json({
    status: "ok",
    message: "API está funcionando",
    port: process.env.PORT || 'default'
  });
});

// Endpoint /scrape-jobs
app.post("/scrape-jobs", async (req, res) => {
  console.log("[INFO] Recebida requisição POST /scrape-jobs");
  console.log("[DEBUG] Body:", JSON.stringify(req.body));
  
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
        "--disable-gpu"
      ]
    });

    const jobs = await getJobListings(browser, searchTerm, location, li_at, maxJobs);
    
    res.status(200).json({
      message: "Scraping realizado com sucesso!",
      totalVagas: jobs.totalVagas,
      jobs: jobs.vagas
    });
  } catch (error) {
    console.error("[ERROR] Erro no scraping:", error);
    res.status(500).json({ error: error.message });
  } finally {
    if (browser) {
      await browser.close().catch(console.error);
    }
  }
});

// As demais rotas permanecem as mesmas...

// Configuração simplificada do servidor
const PORT = process.env.PORT || 3000; // Mudando para porta 3000 como default

const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});

// Tratamento de erros do servidor
server.on('error', (error) => {
  console.error('Erro no servidor:', error);
  if (error.code === 'EADDRINUSE') {
    console.log(`Porta ${PORT} em uso, tentando próxima porta...`);
    server.close();
    const newPort = parseInt(PORT) + 1;
    app.listen(newPort, '0.0.0.0', () => {
      console.log(`Servidor rodando na porta ${newPort}`);
    });
  }
});

// Handlers para graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM recebido. Encerrando servidor...');
  server.close(() => {
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('SIGINT recebido. Encerrando servidor...');
  server.close(() => {
    process.exit(0);
  });
});
