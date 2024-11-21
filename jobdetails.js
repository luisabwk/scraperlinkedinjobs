const express = require("express");
const puppeteer = require("puppeteer");

const router = express.Router();

// Função para obter os detalhes da vaga
async function getJobDetails(li_at, jobLink) {
  console.log("[INFO] Iniciando o navegador do Puppeteer...");

  let browser;
  let jobDetails = {
    vaga: "",
    empresa: "",
    local: "",
    formato_trabalho: "",
    carga_horaria: "",
    nivel_experiencia: "",
    descricao: "",
    url_candidatura: "",
  };

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

    await page.setDefaultNavigationTimeout(180000);
    await page.setDefaultTimeout(180000);

    await page.setCookie({
      name: "li_at",
      value: li_at,
      domain: ".linkedin.com",
    });
    console.log("[INFO] Cookie 'li_at' configurado com sucesso.");

    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/85.0.4183.83 Safari/537.36"
    );

    console.log(`[INFO] Acessando a vaga: ${jobLink}`);
    await page.goto(jobLink, { waitUntil: "domcontentloaded", timeout: 90000 });

    if (await page.$("input#session_key")) {
      throw new Error("Página de login detectada. O cookie 'li_at' pode estar inválido ou expirado.");
    }

    jobDetails.vaga = await page.$eval(
      ".topcard__title",
      (el) => el.innerText.trim()
    );

    jobDetails.empresa = await page.$eval(
      ".topcard__flavor",
      (el) => el.innerText.trim()
    );

    jobDetails.local = await page.$eval(
      ".topcard__flavor--bullet",
      (el) => el.innerText.trim()
    );

    const jobDescriptionElement = await page.$("#job-details, .mt4");
    if (jobDescriptionElement) {
      jobDetails.descricao = await page.evaluate(
        (el) => el.innerText.trim(),
        jobDescriptionElement
      );
    } else {
      jobDetails.descricao = "Descrição não encontrada";
    }

    console.log("[INFO] Detalhes da vaga obtidos com sucesso.");
  } catch (error) {
    console.error("[ERROR] Falha ao obter detalhes da vaga:", error);
    throw new Error("Erro ao obter detalhes da vaga.");
  } finally {
    if (browser) {
      console.log("[INFO] Fechando o navegador do Puppeteer...");
      await browser.close();
    }
  }

  return jobDetails;
}

// Endpoint para obter detalhes da vaga
router.post("/jobdetails", async (req, res) => {
  const { li_at, jobLink } = req.body;

  if (!li_at || !jobLink) {
    return res
      .status(400)
      .send({ error: "Parâmetros 'li_at' e 'jobLink' são obrigatórios." });
  }

  try {
    const jobDetails = await getJobDetails(li_at, jobLink);
    res.status(200).send({ message: "Detalhes da vaga obtidos com sucesso!", jobDetails });
  } catch (error) {
    console.error("[ERROR] Falha durante a requisição:", error.message);
    res.status(500).send({ error: error.message });
  }
});

module.exports = router;
