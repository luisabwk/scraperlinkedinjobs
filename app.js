const express = require("express");
const puppeteer = require("puppeteer");
const cors = require("cors");
const getJobListings = require("./jobs/scrape-jobs");
const getJobDetails = require("./jobs/job-details");

const app = express();
app.use(express.json());
app.use(cors());

// Endpoint para obter a lista de vagas
app.post("/scrape-jobs", async (req, res) => {
  const { searchTerm, location, li_at, maxJobs = 50 } = req.body;

  if (!li_at || !searchTerm || !location) {
    return res.status(400).send({ error: "Parâmetros 'li_at', 'searchTerm' e 'location' são obrigatórios." });
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
      ],
    });

    const jobs = await getJobListings(browser, searchTerm, location, li_at, maxJobs);
    res.status(200).send({ message: "Scraping realizado com sucesso!", totalVagas: jobs.totalVagas, jobs: jobs.vagas });
  } catch (error) {
    console.error("[ERROR] Ocorreu um erro:", error);
    res.status(500).send({ error: error.message });
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
    return res.status(400).send({ error: "Parâmetros 'jobUrl' e 'li_at' são obrigatórios." });
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
      ],
    });

    const jobDetails = await getJobDetails(browser, jobUrl, li_at);
    res.status(200).send({ message: "Detalhes da vaga obtidos com sucesso!", jobDetails });
  } catch (error) {
    console.error("[ERROR] Ocorreu um erro ao obter os detalhes da vaga:", error);
    res.status(500).send({ error: error.message });
  } finally {
    if (browser) {
      await browser.close();
    }
  }
});

// Inicializar o servidor na porta 8080
const PORT = process.env.PORT || 8080;

const startServer = () => {
  app.listen(PORT, () => {
    console.log(`Servidor rodando em http://localhost:${PORT}`);
  }).on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.log(`[WARN] Porta ${PORT} já está em uso.`);
      process.exit(1);
    } else {
      console.error(`[ERROR] Ocorreu um erro ao iniciar o servidor: ${err}`);
      process.exit(1);
    }
  });
};

startServer();

// Capturar sinais de encerramento para fechar o servidor adequadamente
const gracefulShutdown = () => {
  console.log("Encerrando servidor...");
  process.exit(0);
};

process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

module.exports = { getJobListings, getJobDetails };
