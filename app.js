const express = require("express");

const app = express();
app.use(express.json());

// Importar os módulos de scraping
const { getJobListings } = require("./scrape-jobs");
const { getJobDetails } = require("./jobdetails");

// Endpoint da API para scraping das vagas
app.post("/scrape-jobs", async (req, res) => {
  const { li_at, searchTerm, location, maxJobs } = req.body;

  if (!li_at || !searchTerm || !location) {
    return res.status(400).send({ error: "Parâmetros 'li_at', 'searchTerm' e 'location' são obrigatórios." });
  }

  const maxJobsCount = maxJobs || 50; // Define um limite padrão de 50 vagas, caso não seja especificado

  try {
    const jobs = await getJobListings(li_at, searchTerm, location, maxJobsCount);

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

// Inicializar o servidor na porta 3000 ou em uma porta definida pela variável de ambiente
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor rodando em http://localhost:${PORT}`);
});
