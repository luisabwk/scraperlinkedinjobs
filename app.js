const express = require("express");
const scrapeJobsRouter = require("./scrape-jobs");
const jobDetailsRouter = require("./jobdetails");

const app = express();
app.use(express.json());

// Rotas importadas
app.use(scrapeJobsRouter);
app.use(jobDetailsRouter);

// Inicializar o servidor na porta 3000
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor rodando em http://localhost:${PORT}`);
});
