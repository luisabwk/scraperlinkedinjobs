const express = require("express");
const scrapeJobsRouter = require("./scrape-jobs");
const jobDetailsRouter = require("./jobdetails");

const app = express();
app.use(express.json());

// Adicionando as rotas
app.use("/api", scrapeJobsRouter);  // /api/scrape-jobs
app.use("/api", jobDetailsRouter);  // /api/jobdetails

// Inicializar o servidor na porta 3000
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor rodando em http://localhost:${PORT}`);
});
