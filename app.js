const puppeteer = require("puppeteer");
const express = require("express");
const getJobListings = require("./jobs/scrape-jobs");
const getJobDetails = require("./jobs/job-details");
const LinkedInAuthManager = require("./auth/linkedinAuth");

const app = express();
app.use(express.json());

// Autenticação e obtenção do cookie li_at
const authManager = new LinkedInAuthManager();

app.post("/auth", async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).send({ error: "Parâmetros 'username' e 'password' são obrigatórios." });
  }

  try {
    const cookie = await authManager.getCookie(username, password);
    res.status(200).send({ message: "Autenticação realizada com sucesso!", li_at: cookie });
  } catch (error) {
    console.error("[ERROR] Erro durante a autenticação:", error);
    res.status(500).send({ error: error.message });
  }
});

// Endpoint para obter a lista de vagas
app.post("/scrape-jobs", async (req, res) => {
  const { searchTerm, location, li_at, maxJobs = 50, username, password } = req.body;

  if (!searchTerm || !location) {
    return res.status(400).send({ error: "Parâmetros 'searchTerm' e 'location' são obrigatórios." });
  }

  let browser;
  let cookie = li_at;

  try {
    // Autenticar caso o cookie li_at não seja fornecido
    if (!cookie) {
      if (!username || !password) {
        return res.status(400).send({ error: "Parâmetros 'username' e 'password' são obrigatórios para autenticação automática." });
      }
      console.log("[AUTH] Tentando autenticação automática para obter li_at...");
      cookie = await authManager.getCookie(username, password);
    }

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

    const jobs = await getJobListings(browser, searchTerm, location, cookie, maxJobs);
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
  const { jobUrl, li_at, username, password } = req.body;

  if (!jobUrl) {
    return res.status(400).send({ error: "Parâmetro 'jobUrl' é obrigatório." });
  }

  let browser;
  let cookie = li_at;

  try {
    // Autenticar caso o cookie li_at não seja fornecido
    if (!cookie) {
      if (!username || !password) {
        return res.status(400).send({ error: "Parâmetros 'username' e 'password' são obrigatórios para autenticação automática." });
      }
      console.log("[AUTH] Tentando autenticação automática para obter li_at...");
      cookie = await authManager.getCookie(username, password);
    }

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

    const jobDetails = await getJobDetails(browser, jobUrl, cookie);
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
app.listen(PORT, () => {
  console.log(`Servidor rodando em http://localhost:${PORT}`);
});

module.exports = { authManager, getJobListings, getJobDetails };
