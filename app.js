const express = require("express");
const puppeteer = require("puppeteer");
const getJobListings = require("./jobs/scrape-jobs");
const getJobDetails = require("./jobs/job-details");

const app = express();
app.use(express.json());

app.post("/scrape-jobs", async (req, res) => {
  const { searchTerm, location, li_at, maxJobs = 50 } = req.body;

  if (!li_at || !searchTerm || !location) {
    console.error("[ERROR] Parâmetros obrigatórios ausentes: 'li_at', 'searchTerm', 'location'");
    return res.status(400).send({ error: "Parâmetros 'li_at', 'searchTerm' e 'location' são obrigatórios." });
  }

  let browser;
  try {
    console.log("[INFO] Iniciando navegador Puppeteer para scraping de vagas...");
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

    console.log("[INFO] Chamando getJobListings...");
    const jobs = await getJobListings(browser, searchTerm, location, li_at, maxJobs);
    console.log("[INFO] Scraping realizado com sucesso! Total de vagas: ", jobs.totalVagas);
    res.status(200).send({ message: "Scraping realizado com sucesso!", totalVagas: jobs.totalVagas, jobs: jobs.vagas });
  } catch (error) {
    console.error("[ERROR] Ocorreu um erro durante a requisição /scrape-jobs:", error);
    res.status(500).send({ error: error.message });
  } finally {
    if (browser) {
      await browser.close();
      console.log("[INFO] Navegador fechado.");
    }
  }
});

app.post("/job-details", async (req, res) => {
  const { jobUrl, li_at } = req.body;

  if (!jobUrl || !li_at) {
    console.error("[ERROR] Parâmetros obrigatórios ausentes: 'jobUrl', 'li_at'");
    return res.status(400).send({ error: "Parâmetros 'jobUrl' e 'li_at' são obrigatórios." });
  }

  try {
    console.log("[INFO] Chamando getJobDetails...");
    const jobDetails = await getJobDetails(jobUrl, li_at);
    console.log("[INFO] Detalhes da vaga obtidos com sucesso para URL:", jobUrl);
    res.status(200).send({ message: "Detalhes da vaga obtidos com sucesso!", jobDetails });
  } catch (error) {
    console.error("[ERROR] Ocorreu um erro ao obter os detalhes da vaga:", error);
    res.status(500).send({ error: error.message });
  }
});

// Inicializar o servidor na porta 8080, ou na primeira porta livre a partir de 8080
const PORT = process.env.PORT || 8080;

const startServer = (port) => {
  const server = app.listen(port, () => {
    console.log(`Servidor rodando em http://localhost:${port}`);
  });

  server.on("error", (err) => {
    if (err.code === "EADDRINUSE") {
      console.warn(`[WARN] Porta ${port} já está em uso. Tentando a próxima porta...`);
      startServer(port + 1);
    } else {
      console.error("[ERROR] Erro no servidor:", err);
    }
  });
};

startServer(PORT);

module.exports = app;
