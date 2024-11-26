const express = require("express");
const puppeteer = require("puppeteer");
const getJobListings = require("./scrape-jobs"); // Importe a função do arquivo scrape-jobs.js

const app = express();
app.use(express.json());

// Endpoint da API para scraping
app.post("/scrape-jobs", async (req, res) => {
  const { li_at, searchTerm, location, webhook } = req.body;

  if (!li_at || !searchTerm || !location) {
    return res.status(400).send({ error: "Parâmetros 'li_at', 'searchTerm' e 'location' são obrigatórios." });
  }

  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  const page = await browser.newPage();

  try {
    // Usando a função getJobListings
    const jobs = await getJobListings(page, searchTerm, location, li_at);

    // Enviar os resultados para o webhook se ele for fornecido
    if (webhook) {
      console.log("[INFO] Enviando dados para o webhook...");
      await axios
        .post(webhook, { jobs })
        .then((response) => {
          console.log("[SUCCESS] Webhook acionado com sucesso:", response.status);
        })
        .catch((error) => {
          console.error(
            "[ERROR] Erro ao acionar o webhook:",
            error.response?.status,
            error.response?.data
          );
        });
    }

    res.status(200).send({ message: "Scraping realizado com sucesso!", jobs });
  } catch (error) {
    console.error("[ERROR] Falha durante a requisição:", error.message);
    res.status(500).send({ error: error.message });
  } finally {
    await browser.close();
  }
});

// Inicializar o servidor na porta 3000
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor rodando em http://localhost:${PORT}`);
});
