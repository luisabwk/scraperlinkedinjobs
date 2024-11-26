const puppeteer = require("puppeteer");
const axios = require("axios");

async function discoverPaginations(page, searchURL) {
  let allJobs = [];
  console.log(`[INFO] Acessando a URL inicial: ${searchURL}`);

  await page.goto(searchURL, { waitUntil: "domcontentloaded", timeout: 60000 });

  // Prevenir pop-ups ou outros elementos indesejados
  await page.waitForNetworkIdle();

  // Tentar extrair o número total de páginas de forma robusta
  let totalPages = 1;
  try {
    totalPages = await page.$eval(
      ".artdeco-pagination__pages li:last-child button",
      (el) => parseInt(el.innerText.trim())
    );
    console.info(`[INFO] Número total de páginas: ${totalPages}`);
  } catch (error) {
    console.warn("[WARN] Não foi possível obter o número total de páginas, continuando com uma página.");
    // Alternativa para determinar se há mais de uma página
    const hasNextPage = await page.$(".artdeco-pagination__button--next");
    if (hasNextPage) {
      totalPages = 2; // Se houver botão de "Próximo", há pelo menos duas páginas.
      console.info("[INFO] Ajustando número de páginas para pelo menos 2.");
    }
  }

  // Iterar sobre cada página de 1 até o total de páginas
  for (let currentPage = 1; currentPage <= totalPages; currentPage++) {
    console.info(`[INFO] Scraping página ${currentPage} de ${totalPages}...`);

    // Navegar para a página específica
    const pageURL = `${searchURL}&start=${(currentPage - 1) * 25}`;
    await page.goto(pageURL, {
      timeout: 60000,
      waitUntil: "domcontentloaded",
    });

    // Captura os dados das vagas na página atual
    const jobsResult = await page.evaluate(() => {
      const jobElements = Array.from(
        document.querySelectorAll(".jobs-search-results__list-item")
      );

      return jobElements.map((job) => {
        const title = job
          .querySelector(".job-card-list__title")
          ?.innerText.trim()
          .replace(/\n/g, " ");

        const company = job
          .querySelector(".job-card-container__primary-description")
          ?.innerText.trim();

        const location = job
          .querySelector(".job-card-container__metadata-item")
          ?.innerText.trim();

        const link = job.querySelector("a")?.href;

        return {
          vaga: title || "",
          empresa: company || "",
          local: location || "",
          formato: "", // Campo extra que você solicitou
          cargaHoraria: "", // Campo extra que você solicitou
          link: link || "",
        };
      });
    });

    // Adiciona os resultados ao array geral, removendo duplicados com base no ID do link
    jobsResult.forEach((job) => {
      if (job.link) {
        const jobIdMatch = job.link.match(/(\d+)/);
        if (jobIdMatch) {
          const jobId = jobIdMatch[0];
          if (!allJobs.some((j) => j.link.includes(jobId))) {
            allJobs.push(job);
          }
        }
      }
    });

    console.log(`[INFO] Total de vagas coletadas até agora: ${allJobs.length}`);
  }

  return allJobs;
}

async function scrapeJobs(searchTerm, location, li_at) {
  const baseUrl = `https://www.linkedin.com/jobs/search?keywords=${encodeURIComponent(
    searchTerm
  )}&location=${encodeURIComponent(
    location
  )}&geoId=106057199&f_TPR=r86400`;

  const browser = await puppeteer.launch({
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-extensions",
      "--disable-gpu",
    ],
  });

  let allJobs = [];
  try {
    const page = await browser.newPage();

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

    // Usando a função de paginação para descobrir e coletar as vagas
    allJobs = await discoverPaginations(page, baseUrl);
  } catch (error) {
    console.error("[ERROR] Erro durante o scraping:", error);
    throw new Error("Erro durante o scraping.");
  } finally {
    if (browser) {
      console.log("[INFO] Fechando o navegador do Puppeteer...");
      await browser.close();
    }
  }

  return allJobs;
}

module.exports = scrapeJobs;
