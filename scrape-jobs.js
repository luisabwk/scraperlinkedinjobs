const puppeteer = require("puppeteer");
const axios = require("axios");

async function getJobListings(page, searchTerm, location, liAtCookie, maxJobs) {
  let allJobs = [];
  let currentPage = 1;

  const baseUrl = `https://www.linkedin.com/jobs/search?keywords=${encodeURIComponent(
    searchTerm
  )}&location=${encodeURIComponent(
    location
  )}&geoId=106057199&f_TPR=r86400`;

  console.log(`[INFO] Acessando a URL inicial: ${baseUrl}`);

  // Define o cookie `li_at` com o valor fornecido na chamada de API
  await page.setCookie({
    name: "li_at",
    value: liAtCookie, // Recebido como parâmetro da função
    domain: ".linkedin.com",
  });

  // Define o User-Agent para simular um navegador comum
  await page.setUserAgent(
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/85.0.4183.83 Safari/537.36"
  );

  try {
    // Acessa a URL inicial para obter informações gerais, como total de páginas
    await page.goto(baseUrl, { waitUntil: "domcontentloaded", timeout: 60000 });

    let totalPages = 1;
    try {
      totalPages = await page.$eval(
        ".artdeco-pagination__pages li:last-child button",
        (el) => parseInt(el.innerText.trim())
      );
    } catch (error) {
      console.warn("[WARN] Não foi possível obter o número total de páginas, continuando com uma página.");
    }

    console.info(`[INFO] Número total de páginas: ${totalPages}`);

    for (let currentPage = 1; currentPage <= totalPages; currentPage++) {
      console.info(`[INFO] Scraping página ${currentPage} de ${totalPages}...`);

      const pageURL = `${baseUrl}&start=${(currentPage - 1) * 25}`;
      await page.goto(pageURL, { waitUntil: "domcontentloaded", timeout: 60000 });

      const jobsResult = await page.evaluate(() => {
        const jobElements = Array.from(
          document.querySelectorAll(".jobs-search-results__list-item")
        );

        return jobElements.map((job) => {
          const title = job
            .querySelector(".job-card-list__title")
            ?.innerText.trim()
            .replace(/\n/g, ' '); // Remover quebras de linha

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
            link: link || "",
          };
        });
      });

      jobsResult.forEach((job) => {
        if (job.link && allJobs.length < maxJobs) {
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

      // Verifica se o limite de vagas foi alcançado
      if (allJobs.length >= maxJobs) {
        console.info(`[INFO] Limite de ${maxJobs} vagas alcançado.`);
        break;
      }
    }

    console.log(`[INFO] Total de vagas coletadas: ${allJobs.length}`);
    return allJobs;
  } catch (error) {
    console.error("[ERROR] Erro ao carregar a página inicial:", error);
    throw error;
  }
}

// Exporta a função para que possa ser usada em outros arquivos
module.exports = { getJobListings };
