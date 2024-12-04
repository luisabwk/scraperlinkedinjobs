const express = require("express");
const puppeteer = require("puppeteer");
const cors = require("cors");
const getJobListings = require("./jobs/scrape-jobs");
const getJobDetails = require("./jobs/job-details");

// Aplicação para o endpoint `/scrape-jobs`
const appJobs = express();
appJobs.use(express.json());
appJobs.use(cors());

appJobs.post("/scrape-jobs", async (req, res) => {
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

// Aplicação para o endpoint `/job-details`
const appDetails = express();
appDetails.use(express.json());
appDetails.use(cors());

appDetails.post("/job-details", async (req, res) => {
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

// Inicializar o servidor `/scrape-jobs` na porta 8080
const PORT_JOBS = process.env.PORT_JOBS || 8080;
let serverJobs;

const startServerJobs = (port) => {
  serverJobs = appJobs.listen(port, () => {
    console.log(`Servidor de Jobs rodando em http://localhost:${port}/scrape-jobs`);
  }).on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.log(`[WARN] Porta ${port} já está em uso. Tentando a próxima porta...`);
      const newPort = parseInt(port) + 1;
      if (newPort < 65536) {
        startServerJobs(newPort);
      } else {
        console.error(`[ERROR] Nenhuma porta disponível para iniciar o servidor.`);
        process.exit(1);
      }
    } else {
      console.error(`[ERROR] Ocorreu um erro ao iniciar o servidor de Jobs: ${err}`);
      process.exit(1);
    }
  });
};

// Inicializar o servidor `/job-details` na porta 8081
const PORT_DETAILS = process.env.PORT_DETAILS || 8081;
let serverDetails;

const startServerDetails = (port) => {
  serverDetails = appDetails.listen(port, () => {
    console.log(`Servidor de Detalhes rodando em http://localhost:${port}/job-details`);
  }).on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.log(`[WARN] Porta ${port} já está em uso. Tentando a próxima porta...`);
      const newPort = parseInt(port) + 1;
      if (newPort < 65536) {
        startServerDetails(newPort);
      } else {
        console.error(`[ERROR] Nenhuma porta disponível para iniciar o servidor.`);
        process.exit(1);
      }
    } else {
      console.error(`[ERROR] Ocorreu um erro ao iniciar o servidor de Detalhes: ${err}`);
      process.exit(1);
    }
  });
};

// Iniciar os dois servidores
startServerJobs(PORT_JOBS);
startServerDetails(PORT_DETAILS);

// Capturar sinais de encerramento para fechar os servidores adequadamente
const gracefulShutdown = () => {
  console.log("Encerrando servidores...");
  if (serverJobs) {
    serverJobs.close(() => {
      console.log("Servidor de Jobs encerrado.");
    });
  }
  if (serverDetails) {
    serverDetails.close(() => {
      console.log("Servidor de Detalhes encerrado.");
    });
  }
  process.exit(0);
};

process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

module.exports = { getJobListings, getJobDetails };
