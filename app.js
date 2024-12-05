const express = require("express");
const cors = require("cors");
const puppeteer = require("puppeteer");
const getJobListings = require("./jobs/scrape-jobs");
const getJobDetails = require("./jobs/job-details");

const app = express();

// Middlewares
app.use(cors());
app.use(express.json());

// Rotas da API (mantidas as mesmas)
app.get("/", (req, res) => {
  res.status(200).json({
    status: "ok",
    message: "API está funcionando"
  });
});

// ... outros endpoints permanecem iguais ...

// Função para tentar iniciar o servidor em diferentes portas
async function startServer(initialPort, maxRetries = 10) {
  let currentPort = initialPort;
  let retries = 0;

  const tryPort = (port) => {
    return new Promise((resolve, reject) => {
      const server = app.listen(port, () => {
        console.log(`✅ Servidor iniciado com sucesso na porta ${port}`);
        
        // Configurar handlers de cleanup
        const cleanup = () => {
          server.close(() => {
            console.log('Servidor encerrado graciosamente');
            process.exit(0);
          });
        };

        process.on('SIGTERM', cleanup);
        process.on('SIGINT', cleanup);

        resolve(server);
      });

      server.on('error', (error) => {
        if (error.code === 'EADDRINUSE') {
          console.log(`⚠️ Porta ${port} está em uso`);
          server.close();
          reject(error);
        } else {
          console.error('❌ Erro ao iniciar servidor:', error);
          reject(error);
        }
      });
    });
  };

  while (retries < maxRetries) {
    try {
      const server = await tryPort(currentPort);
      return server; // Retorna o servidor se iniciado com sucesso
    } catch (error) {
      if (error.code === 'EADDRINUSE') {
        retries++;
        currentPort++;
        console.log(`Tentativa ${retries} de ${maxRetries}: Tentando porta ${currentPort}`);
      } else {
        throw error; // Re-throw outros tipos de erro
      }
    }
  }

  throw new Error(`Não foi possível encontrar uma porta disponível após ${maxRetries} tentativas`);
}

// Iniciar o servidor
const PORT = parseInt(process.env.PORT) || 8080;

startServer(PORT)
  .catch((error) => {
    console.error('❌ Erro fatal ao iniciar servidor:', error);
    process.exit(1);
  });

// Handler para erros não tratados
process.on('uncaughtException', (error) => {
  console.error('❌ Erro não tratado:', error);
  process.exit(1);
});

process.on('unhandledRejection', (error) => {
  console.error('❌ Promise rejection não tratada:', error);
  process.exit(1);
});
