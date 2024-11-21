const express = require("express");
const puppeteer = require("puppeteer");
const axios = require("axios");

const router = express.Router();

// Função para obter as vagas
async function getJobListings(li_at, searchTerm, location, maxJobs) {
  // ... (a função completa conforme mostrado no documento anterior)
}

// Endpoint da API para scraping
router.post("/scrape-jobs", async (req, res) => {
  const { li_at, searchTerm, location, webhook, maxJobs } = req.body;

  if (!li_at || !searchTerm || !location) {
    return res.status(400).send({ error: "Parâmetros 'li_at', 'searchTerm' e 'location' são obrigatórios." });
  }

  try {
    const jobs = await getJobListings(li_at, searchTerm, location, maxJobs || 50);

    // Enviar o resultado ao webhook, caso tenha sido fornecido
    if (webhook) {
      await axios.post(webhook, { jobs });
    }

    res.status(200).send({ message: "Scraping realizado com sucesso!", jobs });
  } catch (error) {
    console.error("[ERROR] Falha durante a requisição:", error.message);
    res.status(500).send({ error: error.message });
  }
});

module.exports = router;
