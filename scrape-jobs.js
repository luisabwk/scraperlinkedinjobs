const puppeteer = require("puppeteer");

async function scrapeJobs(searchTerm, location, li_at) {
  let allJobs = [];
  let currentPage = 1;

  const baseUrl = `https://www.linkedin.com/jobs/search?keywords=${encodeURIComponent(
    searchTerm
  )}&location=${encodeURIComponent(
    location
  )}&geoId=106057199&f_TPR=r86400`;

  console.log(`[INFO] Acessando a URL inicial: ${baseUrl}`);

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

    // Acessar a URL inicial para obter o total de páginas
    await page.goto(baseUrl, { waitUntil: "domcontentloaded", timeout: 60000 });

    let totalPages = 1;
    try {
      totalPages = await page.$eval(
        ".results-context-header__job-count",
        (el) => Math.ceil(parseInt(el.innerText.replace(/[^\d]/g, "")) / 25)
      );
    } catch (error) {
      console.log("[INFO] Não foi possível determinar o número total de páginas. Continuando com uma página.");
    }

    while (currentPage <= totalPages) {
      console.log(`[INFO] Coletando dados da página ${currentPage} de ${totalPages}`);
      const jobsResult = await page.evaluate(() => {
        return Array.from(document.querySelectorAll(".result-card")).map((job) => {
          const title = job.querySelector(".result-card__title")?.innerText;
          const company = job.querySelector(".result-card__subtitle")?.innerText;
          const location = job.querySelector(".result-card__meta")?.innerText;
          const link = job.querySelector("a.result-card__full-card-link")?.href;

          return {
            titulo: title || "",
            empresa: company || "",
            local: location || "",
            formato: "", // Aqui é um campo adicional que você pediu
            cargaHoraria: "", // Outro campo adicional
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

      // Verifica se há uma próxima página e navega para ela
      if (currentPage < totalPages) {
        const nextPageUrl = `${baseUrl}&start=${currentPage * 25}`;
        await page.goto(nextPageUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
      }
      currentPage++;
    }

    console.log(`[INFO] Total de vagas coletadas: ${allJobs.length}`);
  } catch (error) {
    console.error("[ERROR] Erro ao carregar a página inicial:", error);
    throw new Error("Erro ao carregar a página inicial.");
  } finally {
    if (browser) {
      console.log("[INFO] Fechando o navegador do Puppeteer...");
      await browser.close();
    }
  }

  return allJobs;
}

module.exports = scrapeJobs;
