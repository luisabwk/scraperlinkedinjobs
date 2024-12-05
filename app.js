const express = require("express");
const cors = require("cors");
const puppeteer = require("puppeteer");
const getJobListings = require("./jobs/scrape-jobs");
const getJobDetails = require("./jobs/job-details");

const app = express();

// Middlewares
app.use(cors());
app.use(express.json());

// Rota de healthcheck
app.get("/", (req, res) => {
  res.status(200).json({
    status: "ok",
    message: "API está funcionando",
    timestamp: new Date().toISOString()
  });
});

// Endpoint /scrape-jobs
app.post("/scrape-jobs", async (req, res) => {
  console.log("[INFO] Recebida requisição POST /scrape-jobs");
  console.log("[DEBUG] Body:", req.body);
  
  const { searchTerm, location, li_at, maxJobs = 50 } = req.body;
  
  if (!li_at || !searchTerm || !location) {
    console.log("[ERROR] Parâmetros obrigatórios faltando");
    return res.status(400).json({
      error: "Parâmetros 'li_at', 'searchTerm' e 'location' são obrigatórios."
    });
  }

  let browser;
  try {
    console.log("[INFO] Iniciando browser");
    browser = await puppeteer.launch({
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu"
      ]
    });

    console.log("[INFO] Iniciando scraping");
    const jobs = await getJobListings(browser, searchTerm, location, li_at, maxJobs);
    
    console.log("[INFO] Scraping concluído com sucesso");
    res.status(200).json({
      message: "Scraping realizado com sucesso!",
      totalVagas: jobs.totalVagas,
      jobs: jobs.vagas
    });
  } catch (error) {
    console.error("[ERROR] Erro no endpoint /scrape-jobs:", error);
    res.status(500).json({ 
      error: "Erro ao realizar scraping",
      details: error.message 
    });
  } finally {
    if (browser) {
      console.log("[INFO] Fechando browser");
      await browser.close();
    }
  }
});

// Endpoint /job-details
app.post("/job-details", async (req, res) => {
  console.log("[INFO] Recebida requisição POST /job-details");
  console.log("[DEBUG] Body:", req.body);
  
  const { jobUrl, li_at } = req.body;
  
  if (!jobUrl || !li_at) {
    console.log("[ERROR] Parâmetros obrigatórios faltando");
    return res.status(400).json({
      error: "Parâmetros 'jobUrl' e 'li_at' são obrigatórios."
    });
  }

  let browser;
  try {
    console.log("[INFO] Iniciando browser");
    browser = await puppeteer.launch({
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu"
      ]
    });

    console.log("[INFO] Obtendo detalhes da vaga");
    const jobDetails = await getJobDetails(browser, jobUrl, li_at);
    
    console.log("[INFO] Detalhes obtidos com sucesso");
    res.status(200).json({
      message: "Detalhes da vaga obtidos com sucesso!",
      jobDetails
    });
  } catch (error) {
    console.error("[ERROR] Erro no endpoint /job-details:", error);
    res.status(500).json({ 
      error: "Erro ao obter detalhes da vaga",
      details: error.message 
    });
  } finally {
    if (browser) {
      console.log("[INFO] Fechando browser");
      await browser.close();
    }
  }
});

// Middleware para rotas não encontradas
app.use((req, res) => {
  console.log(`[WARN] Rota não encontrada: ${req.method} ${req.path}`);
  res.status(404).json({ 
    error: "Endpoint não encontrado",
    path: req.path,
    method: req.method
  });
});

// Sistema de portas dinâmicas
async function startServer(initialPort, maxRetries = 10) {
  let currentPort = initialPort;
  let retries = 0;

  const tryPort = (port) => {
    return new Promise((resolve, reject) => {
      const server = app.listen(port, '0.0.0.0', () => {
        console.log(`✅ Servidor iniciado com sucesso na porta ${port}`);
        resolve(server);
      });

      server.on('error', (error) => {
        if (error.code === 'EADDRINUSE') {
          console.log(`⚠️ Porta ${port} está em uso`);
          server.close();
          reject(error);
        } else {
          console.error('❌ Erro ao iniciar servidor:', error);
          reject(error);
        }
      });
    });
  };

  while (retries < maxRetries) {
    try {
      const server = await tryPort(currentPort);
      
      // Configurar handlers de cleanup
      const cleanup = () => {
        server.close(() => {
          console.log('Servidor encerrado graciosamente');
          process.exit(0);
        });
      };

      process.on('SIGTERM', cleanup);
      process.on('SIGINT', cleanup);
      
      return server;
    } catch (error) {
      if (error.code === 'EADDRINUSE') {
        retries++;
        currentPort++;
        console.log(`Tentativa ${retries} de ${maxRetries}: Tentando porta ${currentPort}`);
      } else {
        throw error;
      }
    }
  }

  throw new Error(`Não foi possível encontrar uma porta disponível após ${maxRetries} tentativas`);
}

// Inicialização do servidor
const PORT = parseInt(process.env.PORT) || 8080;

startServer(PORT)
  .catch((error) => {
    console.error('❌ Erro fatal ao iniciar servidor:', error);
    process.exit(1);
  });

// Tratamento de erros não capturados
process.on('uncaughtException', (error) => {
  console.error('❌ Erro não tratado:', error);
  process.exit(1);
});

process.on('unhandledRejection', (error) => {
  console.error('❌ Promise rejection não tratada:', error);
  process.exit(1);
});
