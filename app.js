const express = require("express");
const scrapeJobs = require("./scrape-jobs");

const app = express();
app.use(express.json());

// Endpoint para scraping de vagas
app.post("/scrape-jobs", scrapeJobs);

// Inicializar o servidor na porta 3000
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor rodando em http://localhost:${PORT}`);
});
