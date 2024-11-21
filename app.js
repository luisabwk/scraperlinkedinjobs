const express = require("express");
const { getJobListings } = require("./scrape-jobs");
const { getJobDetails } = require("./jobdetails");

const app = express();
app.use(express.json());

// Endpoint da API para scraping de vagas
app.post("/scrape-jobs", async (req, res) => {
  const { li_at, searchTerm, location, webhook, maxJobs } = req.body;

  if (!li_at || !searchTerm || !location) {
    return res.status(400).send({ error: "Parâmetros 'li_at', 'searchTerm' e 'location' são obrigatórios." });
  }

  const maxJobsCount = maxJobs || 50; // Limite padrão de 50 vagas

  try {
    const jobs = await getJobListings(li_at, searchTerm, location, maxJobsCount);

    // Enviar o resultado ao webhook, se fornecido
    if (webhook) {
      console.log("[INFO] Enviando dados para o webhook...");
      await axios
        .post(webhook, { jobs })
        .then((response) => {
          console.log("[SUCCESS] Webhook acionado com sucesso:", response.status);
        })
        .catch((error) => {
          console.error("[ERROR] Erro ao acionar o webhook:", error.response?.status, error.response?.data);
        });
    }

    res.status(200).send({ message: "Scraping realizado com sucesso!", jobs });
  } catch (error) {
    console.error("[ERROR] Falha durante a requisição:", error.message);
    res.status(500).send({ error: error.message });
  }
});

// Endpoint da API para obter detalhes de uma vaga específica
app.post("/jobdetails", async (req, res) => {
  const { li_at, jobLink } = req.body;

  if (!li_at || !jobLink) {
    return res.status(400).send({ error: "Parâmetros 'li_at' e 'jobLink' são obrigatórios." });
  }

  try {
    const jobDetails = await getJobDetails(li_at, jobLink);
    res.status(200).send({ message: "Detalhes da vaga obtidos com sucesso!", jobDetails });
  } catch (error) {
    console.error("[ERROR] Falha ao obter os detalhes da vaga:", error.message);
    res.status(500).send({ error: error.message });
  }
});

// Inicializar o servidor na porta 3000
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor rodando em http://localhost:${PORT}`);
});
