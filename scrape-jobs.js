const express = require("express");
const puppeteer = require("puppeteer");
const router = express.Router();

async function getJobListings(li_at, searchTerm, location, maxJobs) {
  // (a função getJobListings permanece inalterada)
}

router.post("/scrape-jobs", async (req, res) => {
  const { li_at, searchTerm, location, webhook, maxJobs } = req.body;

  if (!li_at || !searchTerm || !location) {
    return res.status(400).send({ error: "Parâmetros 'li_at', 'searchTerm' e 'location' são obrigatórios." });
  }

  const maxJobsCount = maxJobs || 50;

  try {
    const jobs = await getJobListings(li_at, searchTerm, location, maxJobsCount);

    // (enviar para webhook se fornecido)
    if (webhook) {
      console.log("[INFO] Enviando dados para o webhook...");
      // webhook logic
    }

    res.status(200).send({ message: "Scraping realizado com sucesso!", jobs });
  } catch (error) {
    console.error("[ERROR] Falha durante a requisição:", error.message);
    res.status(500).send({ error: error.message });
  }
});

module.exports = router;
