const puppeteer = require("puppeteer");
const axios = require("axios");

async function getJobListings(browser, searchTerm, location, li_at) {
  let allJobs = [];
  const baseUrl = `https://www.linkedin.com/jobs/search?keywords=${encodeURIComponent(
    searchTerm
  )}&location=${encodeURIComponent(
    location
  )}&geoId=106057199&f_TPR=r86400`;

  console.log(`[INFO] Acessando a URL inicial: ${baseUrl}`);

  if (!browser || typeof browser.newPage !== "function") {
    throw new Error("Navegador Puppeteer não inicializado corretamente.");
  }

  const page = await browser.newPage();

  // Define o cookie `li_at` com o valor fornecido
  const cookies = [
    {
      name: "li_at",
      value: li_at,
      domain: ".linkedin.com",
    },
  ];
  await page.setCookie(...cookies);

  // Define o User-Agent para simular um navegador comum
  await page.setUserAgent(
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/85.0.4183.83 Safari/537.36"
  );

  try {
    await page.goto(baseUrl, { waitUntil: "domcontentloaded", timeout: 90000 });

    // Descobrir o número total de páginas
    let totalPages = 1;
    try {
      totalPages = await page.$eval(
        ".artdeco-pagination__pages li:last-child button",
        (el) => parseInt(el.innerText.trim())
      );
      console.info(`[INFO] Número total de páginas: ${totalPages}`);
    } catch (error) {
      console.warn(
        "[WARN] Não foi possível obter o número total de páginas, continuando com uma página."
      );
    }

    // Iterar sobre cada página de 1 até o total de páginas
    for (let currentPage = 1; currentPage <= totalPages; currentPage++) {
      console.info(
        `[INFO] Scraping página ${currentPage} de ${totalPages}...`
      );

      // Navegar para a página específica
      const pageURL = `${baseUrl}&start=${(currentPage - 1) * 25}`;
      await page.goto(pageURL, {
        waitUntil: "domcontentloaded",
        timeout: 90000,
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
            .replace(/\n/g, " "); // Remover quebras de linha

          const company = job
            .querySelector(".job-card-container__primary-description")
            ?.innerText.trim();

          const location = job
            .querySelector(".job-card-container__metadata-item")
            ?.innerText.trim();

          const link = job.querySelector("a")?.href;

          const format = job
            .querySelector(".job-card-container__workplace-type")
            ?.innerText.trim();

          const cargahoraria = job
            .querySelector(".job-card-container__employment-status")
            ?.innerText.trim();

          return {
            vaga: title || "",
            empresa: company || "",
            local: location || "",
            formato: format || "",
            cargahoraria: cargahoraria || "",
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

    console.log(`[INFO] Total de vagas coletadas: ${allJobs.length}`);

    return allJobs;
  } catch (error) {
    console.error("[ERROR] Erro ao realizar scraping:", error);
    throw new Error("Erro durante o scraping.");
  } finally {
    await page.close();
  }
}

(async () => {
  let browser;
  try {
    browser = await puppeteer.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });

    // Defina as variáveis conforme necessário
    const searchTerm = "growth marketing";
    const location = "Brasil";
    const li_at = "SEU_COOKIE_AQUI";

    // Usando a função getJobListings
    const jobs = await getJobListings(browser, searchTerm, location, li_at);

    // Exemplo de como você pode manipular as vagas obtidas
    console.log(jobs);
  } catch (error) {
    console.error("[ERROR] Ocorreu um erro:", error);
  } finally {
    if (browser) {
      await browser.close();
    }
  }
})();

module.exports = getJobListings;
