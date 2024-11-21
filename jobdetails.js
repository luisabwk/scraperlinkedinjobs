const express = require("express");
const puppeteer = require("puppeteer");

const router = express.Router();

// Função para obter detalhes de uma vaga específica
async function getJobDetails(li_at, jobLink) {
  let browser;
  let jobDetails = {};

  console.log(`[INFO] Iniciando o navegador do Puppeteer para detalhar a vaga: ${jobLink}`);

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
    console.log("[INFO] Navegador iniciado com sucesso para detalhes da vaga.");

    // Define o cookie `li_at` com o valor fornecido
    await page.setCookie({
      name: "li_at",
      value: li_at,
      domain: ".linkedin.com",
    });
    console.log("[INFO] Cookie 'li_at' configurado com sucesso para detalhes da vaga.");

    // Define o User-Agent
    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/85.0.4183.83 Safari/537.36"
    );

    // Navega até a página da vaga
    await page.goto(jobLink, { waitUntil: "domcontentloaded", timeout: 90000 });

    // Extrai os detalhes da vaga
    jobDetails = await page.evaluate(() => {
      const title = document.querySelector(".t-24")?.innerText.trim() || "";
      const company = document.querySelector(".job-details-jobs-unified-top-card__company-name")?.innerText.trim() || "";
      let location = document.querySelector(".job-details-jobs-unified-top-card__primary-description-container")?.innerText.trim() || "";
      if (location) {
        const match = location.match(/^([^·]*)/);
        location = match ? match[1].trim() : location;
      }
      const jobType = document.querySelector(".job-details-jobs-unified-top-card__job-insight.job-details-jobs-unified-top-card__job-insight--highlight")?.innerText.trim() || "";
      let formatoTrabalho = "";
      let cargaHoraria = "";
      let nivelExperiencia = "";
      if (jobType) {
        const parts = jobType.split(/\s{2,}/);
        formatoTrabalho = parts[0] || "";
        cargaHoraria = parts[1] || "";
        nivelExperiencia = parts[2] || "";
      }
      const descriptionElement = document.querySelector(".jobs-box__html-content.jobs-description-content__text.t-14.t-normal.jobs-description-content__text--stretch");
      let jobDescription = "Descrição não encontrada";
      if (descriptionElement) {
        const h2Element = descriptionElement.querySelector("h2");
        if (h2Element) {
          h2Element.remove();
        }
        jobDescription = descriptionElement.innerText.trim();
      }

      return {
        vaga: title,
        empresa: company,
        local: location,
        formato_trabalho: formatoTrabalho,
        carga_horaria: cargaHoraria,
        nivel_experiencia: nivelExperiencia,
        descricao: jobDescription,
      };
    });
    console.log(`[INFO] Detalhes da vaga obtidos com sucesso: ${jobLink}`);
  } catch (error) {
    console.error(`[ERROR] Erro ao obter detalhes da vaga ${jobLink}:`, error);
    throw new Error(`Erro ao obter detalhes da vaga: ${jobLink}`);
  } finally {
    if (browser) {
      console.log("[INFO] Fechando o navegador do Puppeteer após obter detalhes da vaga...");
      await browser.close();
    }
  }

  return jobDetails;
}

// Endpoint da API para obter detalhes de uma vaga específica
router.post("/jobdetails", async (req, res) => {
  const { li_at, jobLink } = req.body;

  if (!li_at || !jobLink) {
    return res.status(400).send({ error: "Parâmetros 'li_at' e 'jobLink' são obrigatórios." });
  }

  try {
    const jobDetails = await getJobDetails(li_at, jobLink);
    res.status(200).send({ message: "Detalhes da vaga obtidos com sucesso!", jobDetails });
  } catch (error) {
    console.error("[ERROR] Falha ao obter detalhes da vaga:", error.message);
    res.status(500).send({ error: error.message });
  }
});

module.exports = router;
