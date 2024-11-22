const puppeteer = require("puppeteer");
const axios = require("axios");

// Função para obter a lista de vagas
async function getJobListings(li_at, searchTerm, location, maxJobs = 50) {
  let allJobs = [];
  let currentPage = 1;

  console.log("[INFO] Iniciando o navegador do Puppeteer...");

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

    const baseUrl = `https://www.linkedin.com/jobs/search?keywords=${encodeURIComponent(
      searchTerm
    )}&location=${encodeURIComponent(
      location
    )}&geoId=106057199&f_TPR=r86400`;

    console.log(`[INFO] Acessando a URL inicial: ${baseUrl}`);

    try {
      // Acessa a URL inicial para obter informações gerais, como total de páginas
      await page.goto(baseUrl, { waitUntil: "domcontentloaded", timeout: 90000 });

      // Extrair o número total de páginas de resultados
      let totalPages = 1;
      try {
        await page.waitForSelector(".artdeco-pagination__pages", { timeout: 20000 });
        totalPages = await page.$eval(
          ".artdeco-pagination__pages li:last-child button",
          (el) => parseInt(el.innerText.trim())
        );
      } catch (error) {
        console.warn("[WARN] Não foi possível obter o número total de páginas, continuando com uma página.");
      }

      console.info(`[INFO] Número total de páginas: ${totalPages}`);

      // Iterar sobre cada página de 1 até o total de páginas
      for (let currentPage = 1; currentPage <= totalPages; currentPage++) {
        console.info(`[INFO] Scraping página ${currentPage} de ${totalPages}...`);

        // Navegar para a página específica
        const pageURL = `${baseUrl}&start=${(currentPage - 1) * 25}`;
        await page.goto(pageURL, { waitUntil: "domcontentloaded", timeout: 60000 });

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

            return {
              vaga: title || "",
              empresa: company || "",
              local: location || "",
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

        // Verificar se já coletamos o número máximo de vagas solicitado
        if (allJobs.length >= maxJobs) {
          console.log(`[INFO] Número máximo de vagas (${maxJobs}) alcançado.`);
          break;
        }
      }

      console.log(`[INFO] Total de vagas coletadas: ${allJobs.length}`);
    } catch (error) {
      console.error("[ERROR] Erro durante o processo de scraping:", error);
      throw new Error("Erro durante o processo de scraping.");
    }
  } catch (error) {
    console.error("[ERROR] Erro ao iniciar o Puppeteer ou configurar o navegador:", error);
    throw new Error("Erro ao iniciar o Puppeteer ou configurar o navegador.");
  } finally {
    if (browser) {
      console.log("[INFO] Fechando o navegador do Puppeteer...");
      await browser.close();
    }
  }

  return allJobs.slice(0, maxJobs); // Retorna apenas o número máximo de vagas solicitado
}

module.exports = { getJobListings };
