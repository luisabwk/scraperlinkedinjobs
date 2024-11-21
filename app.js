const express = require("express");
const scrapeJobsRouter = require("./scrape-jobs");
const jobDetailsRouter = require("./jobdetails");

const app = express();
app.use(express.json());

// Importando e utilizando os routers
app.use("/api", scrapeJobsRouter);
app.use("/api", jobDetailsRouter);

// Inicializar o servidor na porta 3000
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor rodando em http://localhost:${PORT}`);
});
