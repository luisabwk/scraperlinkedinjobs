const express = require("express");
const scrapeJobsRouter = require("./scrapeJobs"); // Importando o roteador scrapeJobs
const jobDetailsRouter = require("./jobDetails"); // Importando o roteador jobDetails

const app = express();
app.use(express.json());

// Usando o router do scrapeJobs
app.use("/", scrapeJobsRouter);

// Usando o router do jobDetails
app.use("/", jobDetailsRouter);

// Inicializar o servidor na porta 3000
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor rodando em http://localhost:${PORT}`);
});
