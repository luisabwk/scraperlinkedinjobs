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
    message: "API está funcionando"
  });
});

// Endpoint para obter a lista de vagas
app.post("/scrape-jobs", async (req, res) => {
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
    console.error("[ERROR] Ocorreu um erro:", error);
    res.status(500).json({ error: error.message });
  } finally {
    if (browser) {
      await browser.close();
    }
  }
});

// Endpoint para obter os detalhes de uma vaga individual
app.post("/job-details", async (req, res) => {
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
        "--disable-gpu"
      ]
    });
    const jobDetails = await getJobDetails(browser, jobUrl, li_at);
    res.status(200).json({
      message: "Detalhes da vaga obtidos com sucesso!",
      jobDetails
    });
  } catch (error) {
    console.error("[ERROR] Ocorreu um erro ao obter os detalhes da vaga:", error);
    res.status(500).json({ error: error.message });
  } finally {
    if (browser) {
      await browser.close();
    }
  }
});

// Middleware para rotas não encontradas
app.use((req, res) => {
  res.status(404).json({ error: "Endpoint não encontrado" });
});

// Middleware de erro global
app.use((error, req, res, next) => {
  console.error("[ERROR] Erro global:", error);
  res.status(500).json({
    error: "Erro interno do servidor",
    details: error.message
  });
});

// Configuração da porta para o Railway
const port = process.env.PORT || 8080;

// Inicialização do servidor
const server = app.listen(port, () => {
  console.log(`Servidor rodando na porta ${port}`);
});

// Tratamento de erros do servidor
server.on("error", (error) => {
  if (error.code === "EADDRINUSE") {
    console.error(`Porta ${port} já está em uso`);
    process.exit(1);
  } else {
    console.error("Erro no servidor:", error);
  }
});

// Tratamento de sinais de encerramento
process.on("SIGTERM", () => {
  console.log("Recebido sinal SIGTERM. Encerrando servidor...");
  server.close(() => {
    console.log("Servidor encerrado");
    process.exit(0);
  });
});

process.on("SIGINT", () => {
  console.log("Recebido sinal SIGINT. Encerrando servidor...");
  server.close(() => {
    console.log("Servidor encerrado");
    process.exit(0);
  });
});
