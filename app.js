const express = require("express");
const scrapeJobs = require("./scrape-jobs");

const app = express();
app.use(express.json());

// Endpoint da API para scraping de vagas
app.post("/scrape-jobs", async (req, res) => {
  const { li_at, searchTerm, location, webhook, maxJobs } = req.body;

  if (!li_at || !searchTerm || !location) {
    return res.status(400).send({ error: "Parâmetros 'li_at', 'searchTerm' e 'location' são obrigatórios." });
  }

  try {
    const jobs = await scrapeJobs(li_at, searchTerm, location, maxJobs);

    // Enviar o resultado ao webhook, caso tenha sido fornecido
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
  }
});

// Inicializar o servidor na porta 3000
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor rodando em http://localhost:${PORT}`);
});
