const express = require("express");
const scrapeJobs = require("./scrape-jobs");

const app = express();
app.use(express.json());

// Endpoint da API para scraping de vagas
app.post("/scrape-jobs", async (req, res) => {
  const { li_at, searchTerm, location } = req.body;

  if (!li_at || !searchTerm || !location) {
    return res.status(400).send({ error: "Parâmetros 'li_at', 'searchTerm' e 'location' são obrigatórios." });
  }

  try {
    const jobs = await scrapeJobs(searchTerm, location, li_at);
    res.status(200).send({ message: "Scraping realizado com sucesso!", jobs });
  } catch (error) {
    console.error("[ERROR] Falha durante a requisição:", error.message);
    res.status(500).send({ error: error.message });
  }
});

// Inicializar o servidor na porta 8080
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`Servidor rodando em http://localhost:${PORT}`);
});
