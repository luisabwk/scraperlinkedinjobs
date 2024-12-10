const puppeteer = require("puppeteer");
const express = require("express");
const { authenticateLinkedIn } = require("./auth/linkedinAuth");
const getJobListings = require("./jobs/scrape-jobs");
const getJobDetails = require("./jobs/job-details");

const app = express();
app.use(express.json());

app.post("/auth", async (req, res) => {
  const { username, password, emailConfig } = req.body;

  if (!username || !password || !emailConfig) {
    return res.status(400).send({ error: "Parâmetros 'username', 'password' e 'emailConfig' são obrigatórios." });
  }

  try {
    const liAtCookie = await authenticateLinkedIn(emailConfig, username, password);
    res.status(200).send({ message: "Autenticação realizada com sucesso!", li_at: liAtCookie });
  } catch (error) {
    console.error("[ERROR] Erro durante a autenticação:", error.message);
    res.status(500).send({ error: error.message });
  }
});

app.post("/scrape-jobs", async (req, res) => {
  const { searchTerm, location, li_at, maxJobs = 50 } = req.body;

  if (!searchTerm || !location || !li_at) {
    return res.status(400).send({ error: "Parâmetros 'searchTerm', 'location' e 'li_at' são obrigatórios." });
  }

  let browser;
  try {
    browser = await puppeteer.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });

    const jobs = await getJobListings(browser, searchTerm, location, li_at, maxJobs);
    res.status(200).send({ message: "Scraping realizado com sucesso!", totalVagas: jobs.totalVagas, jobs: jobs.vagas });
  } catch (error) {
    console.error("[ERROR] Ocorreu um erro:", error.message);
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

  let browser;
  try {
    browser = await puppeteer.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });

    const jobDetails = await getJobDetails(browser, jobUrl, li_at);
    res.status(200).send({ message: "Detalhes da vaga obtidos com sucesso!", jobDetails });
  } catch (error) {
    console.error("[ERROR] Ocorreu um erro ao obter os detalhes da vaga:", error.message);
    res.status(500).send({ error: error.message });
  } finally {
    if (browser) {
      await browser.close();
    }
  }
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`Servidor rodando em http://localhost:${PORT}`);
});

module.exports = app;
