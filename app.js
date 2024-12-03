const express = require("express");
const puppeteer = require("puppeteer");
const getJobListings = require("./jobs/scrape-jobs");
const getJobDetails = require("./jobs/job-details");

const app = express();
app.use(express.json());

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

app.post("/job-details", async (req, res) => {
  const { jobUrl, li_at } = req.body;

  if (!jobUrl || !li_at) {
    return res.status(400).send({ error: "Parâmetros 'jobUrl' e 'li_at' são obrigatórios." });
  }

  try {
    const jobDetails = await getJobDetails(jobUrl, li_at);
    res.status(200).send({ message: "Detalhes da vaga obtidos com sucesso!", jobDetails });
  } catch (error) {
    console.error("[ERROR] Ocorreu um erro ao obter os detalhes da vaga:", error);
    res.status(500).send({ error: error.message });
  }
});

// Inicializar o servidor na porta 8080, com fallback para uma alternativa se a porta estiver em uso
const PORT = process.env.PORT || 8080;

function startServer(port) {
  const server = app.listen(port, () => {
    console.log(`Servidor rodando em http://localhost:${port}`);
  });

  server.on("error", (error) => {
    if (error.code === "EADDRINUSE") {
      console.warn(`[WARN] Porta ${port} já está em uso. Tentando a próxima porta...`);
      startServer(Number(port) + 1); // Incrementar para próxima porta
    } else {
      console.error("[ERROR] Erro ao iniciar o servidor:", error);
    }
  });

  // Capturar sinais de encerramento para fechar o servidor adequadamente
  process.on('SIGTERM', () => {
    console.log("Encerrando servidor...");
    server.close(() => {
      console.log("Servidor encerrado.");
      process.exit(0);
    });
  });

  process.on('SIGINT', () => {
    console.log("Encerrando servidor...");
    server.close(() => {
      console.log("Servidor encerrado.");
      process.exit(0);
    });
  });
}

startServer(PORT);

module.exports = { getJobListings, getJobDetails };
