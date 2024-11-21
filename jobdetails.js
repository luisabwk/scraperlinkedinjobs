const puppeteer = require("puppeteer");

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
        "--single-process", // Evita multiprocessamento, útil em ambientes limitados
        "--no-zygote",      // Desativa processos zygote, reduzindo o consumo de recursos
      ],
    });

    const page = await browser.newPage();
    console.log("[INFO] Navegador iniciado com sucesso.");

    await page.setDefaultNavigationTimeout(180000); // 3 minutos
    await page.setDefaultTimeout(180000); // 3 minutos

    console.log(`[INFO] Acessando o link da vaga: ${jobLink}`);

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

    // Navegar para o link da vaga com retries
    await page.goto(jobLink, { waitUntil: "domcontentloaded", timeout: 60000 });

    // Captura os detalhes da vaga
    const jobDetails = await page.evaluate(() => {
      const vaga = document.querySelector("h1")?.innerText.trim() || "Título não encontrado";
      const empresa = document.querySelector(".topcard__org-name-link")?.innerText.trim() || "Empresa não encontrada";
      const local = document.querySelector(".topcard__flavor--bullet")?.innerText.trim() || "Localização não encontrada";
      const descricao = document.querySelector("#job-details")?.innerText.trim() || "Descrição não encontrada";

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
