const express = require("express");
const puppeteer = require("puppeteer");

const app = express();
app.use(express.json());

// Função para obter os detalhes individuais de uma vaga
async function getJobDetails(jobUrl, li_at) {
  console.log(`[INFO] Acessando detalhes da vaga: ${jobUrl}`);

  let browser;
  try {
    browser = await puppeteer.launch({
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
        "--disable-software-rasterizer",
      ],
    });

    const page = await browser.newPage();
    // Configurar o cookie 'li_at' para autenticação no LinkedIn
    const cookies = [{ name: "li_at", value: li_at, domain: ".linkedin.com" }];
    await page.setCookie(...cookies);

    // Definir um User-Agent para simular um navegador comum
    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/85.0.4183.83 Safari/537.36"
    );

    // Acessar a página da vaga
    await page.goto(jobUrl, { waitUntil: "domcontentloaded", timeout: 120000 });

    // Extrair detalhes da vaga
    const jobDetails = await page.evaluate(() => {
      const title = document.querySelector(".job-details-jobs-unified-top-card__job-title")?.innerText.trim() || "";
      const company = document.querySelector(".job-details-jobs-unified-top-card__company-name")?.innerText.trim() || "";
      const locationData = document.querySelector(".job-details-jobs-unified-top-card__primary-description-container")?.innerText.trim() || "";
      const description = document.querySelector("#job-details")?.innerText.trim() || "";

      // Extrair apenas a informação antes do primeiro caractere '·'
      const locationMatch = locationData.match(/^(.*?)(?= ·|$)/);
      const location = locationMatch ? locationMatch[0].trim() : "";

      return {
        title,
        company,
        location,
        description,
      };
    });

    console.log(`[INFO] Detalhes da vaga extraídos com sucesso para: ${jobUrl}`);
    return jobDetails;
  } catch (error) {
    console.error(`[ERROR] Falha ao obter detalhes da vaga: ${error.message}`);
    throw new Error("Erro ao obter detalhes da vaga.");
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

// Novo endpoint para obter os detalhes de uma vaga individual
app.post("/job-details", async (req, res) => {
  const { jobUrl, li_at } = req.body;

  if (!jobUrl || !li_at) {
    return res.status(400).send({ error: "Parâmetros 'jobUrl' e 'li_at' são obrigatórios." });
  }

  try {
    const jobDetails = await getJobDetails(jobUrl, li_at);
    res.status(200).send({ message: "Detalhes da vaga obtidos com sucesso!", jobDetails });
  } catch (error) {
    console.error("[ERROR] Ocorreu um erro ao obter os detalhes da vaga:", error);
    res.status(500).send({ error: error.message });
  }
});

// Inicializar o servidor na porta 3001
const PORT = process.env.PORT || 3001;
const server = app.listen(PORT, () => {
  console.log(`Servidor rodando em http://localhost:${PORT}`);
});

// Capturar sinais de encerramento para fechar o servidor adequadamente
process.on('SIGTERM', () => {
  console.log("Encerrando servidor...");
  server.close(() => {
    console.log("Servidor encerrado.");
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log("Encerrando servidor...");
  server.close(() => {
    console.log("Servidor encerrado.");
    process.exit(0);
  });
});

module.exports = getJobDetails;
