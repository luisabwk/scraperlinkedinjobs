const express = require("express");
const cors = require("cors");
const puppeteer = require("puppeteer");
const getJobListings = require("./jobs/scrape-jobs");
const getJobDetails = require("./jobs/job-details");

const app = express();
app.use(express.json());
app.use(cors()); // Ativando CORS no Express

app.post("/scrape-jobs", async (req, res) => {
  // Código para lidar com a rota scrape-jobs
});

app.post("/job-details", async (req, res) => {
  // Código para lidar com a rota job-details
});

// Inicializar o servidor na porta 8080
const PORT = parseInt(process.env.PORT) || 8080;

const startServer = (port, maxAttempts = 10) => {
  if (port >= 65535) {
    console.error("[ERROR] Todas as portas disponíveis foram usadas. A aplicação não pôde ser iniciada.");
    process.exit(1);
  }

  if (maxAttempts <= 0) {
    console.error("[ERROR] Limite de tentativas para encontrar uma porta livre atingido.");
    process.exit(1);
  }

  const server = app.listen(port, () => {
    console.log(`Servidor rodando em http://localhost:${port}`);
  });

  server.on("error", (err) => {
    if (err.code === "EADDRINUSE") {
      console.warn(`[WARN] Porta ${port} já está em uso. Tentando a próxima porta...`);
      startServer(port + 1, maxAttempts - 1);
    } else {
      console.error("[ERROR] Erro no servidor:", err);
      process.exit(1);
    }
  });
};

startServer(PORT);

module.exports = app;
