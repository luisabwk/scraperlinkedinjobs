const express = require("express");
const puppeteer = require("puppeteer");
const axios = require("axios");

const app = express();
app.use(express.json());

// Função para obter os detalhes da vaga
async function getJobDetails(li_at, jobLink) {
  console.log("[INFO] Iniciando o navegador do Puppeteer para detalhes da vaga...");

  let browser;
  try {
    browser = await puppeteer.launch({
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-extensions",
        "--disable-gpu",
        "--single-process",
        "--no-zygote",
      ],
    });

    const page = await browser.newPage();
    console.log("[INFO] Navegador iniciado com sucesso.");

    // Define o cookie `li_at` com o valor fornecido
    await page.setCookie({
      name: "li_at",
      value: li_at,
      domain: ".linkedin.com",
    });

    // Define o User-Agent para simular um navegador comum
    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/85.0.4183.83 Safari/537.36"
    );

    console.log(`[INFO] Acessando o link da vaga: ${jobLink}`);
    await page.goto(jobLink, { waitUntil: "networkidle2", timeout: 120000 });

    // Captura os detalhes da vaga
    const jobDetails = await page.evaluate(() => {
      const vaga = document.querySelector("h1")?.innerText.trim() || "Título não encontrado";
      const empresa = document.querySelector(".topcard__org-name-link")?.innerText.trim() ||
                      document.querySelector(".job-details-jobs-unified-top-card__company-name")?.innerText.trim() ||
                      "Empresa não encontrada";
      const local = document.querySelector(".topcard__flavor--bullet")?.innerText.trim().split(" · ")[0] ||
                    document.querySelector(".job-details-jobs-unified-top-card__primary-description-container")?.innerText.trim().split(" · ")[0] ||
                    "Localização não encontrada";
      const descricao = document.querySelector("#job-details .jobs-box__html-content.jobs-description-content__text")?.innerText.trim() ||
                       document.querySelector(".jobs-description__content.jobs-description__content--condensed")?.innerText.trim() ||
                       document.querySelector(".jobs-box__html-content.jobs-description-content__text.t-14.t-normal.jobs-description-content__text--stretch")?.innerText.trim() ||
                       document.querySelector(".jobs-description__container p")?.innerText.trim() ||
                       "Descrição não encontrada";

      return {
        vaga,
        empresa,
        local,
        descricao,
      };
    });

    console.log("[INFO] Detalhes da vaga obtidos com sucesso:", jobDetails);
    return jobDetails;
  } catch (error) {
    console.error("[ERROR] Erro ao obter detalhes da vaga:", error);
    throw new Error("Erro ao obter detalhes da vaga.");
  } finally {
    if (browser) {
      console.log("[INFO] Fechando o navegador do Puppeteer...");
      await browser.close();
    }
  }
}

module.exports = { getJobDetails };

// Endpoint da API para obter detalhes de uma vaga específica
// app.post("/jobdetails", async (req, res) => {
//   const { li_at, jobLink } = req.body;

//   if (!li_at || !jobLink) {
//     return res.status(400).send({ error: "Parâmetros 'li_at' e 'jobLink' são obrigatórios." });
//   }

//   try {
//     const jobDetails = await getJobDetails(li_at, jobLink);
//     res.status(200).send({ message: "Detalhes da vaga obtidos com sucesso!", jobDetails });
//   } catch (error) {
//     console.error("[ERROR] Falha ao obter os detalhes da vaga:", error.message);
//     res.status(500).send({ error: error.message });
//   }
// });

// Inicializar o servidor na porta 3000 ou em uma porta definida pela variável de ambiente
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor rodando em http://localhost:${PORT}`);
});
