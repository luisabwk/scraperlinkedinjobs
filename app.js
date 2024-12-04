const express = require("express");
const cors = require("cors");
const puppeteer = require("puppeteer");
const getJobListings = require("./jobs/scrape-jobs");
const getJobDetails = require("./jobs/job-details");

const app = express();

// Configurações básicas
app.use(cors());
app.use(express.json());

// Rota de healthcheck
app.get("/", (req, res) => {
  res.status(200).send({
    status: "ok",
    message: "API está funcionando"
  });
});

// ... resto do seu código dos endpoints aqui ...

// Configuração da porta para o Railway
const PORT = process.env.PORT || 8080;

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});
