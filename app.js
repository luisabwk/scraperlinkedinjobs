const express = require("express");

// Importa os roteadores
const scrapeJobsRouter = require("./scrape-jobs");
const jobDetailsRouter = require("./jobdetails");

const app = express();
app.use(express.json());

// Usa os roteadores para definir as rotas
app.use("/api", scrapeJobsRouter);  // Rota para scrape-jobs
app.use("/api", jobDetailsRouter);  // Rota para jobdetails

// Inicializar o servidor na porta 3000
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor rodando em http://localhost:${PORT}`);
});
