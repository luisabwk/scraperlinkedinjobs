const puppeteer = require("puppeteer");

// Função de scraping para ser usada no app.js
const getJobListings = async (page, searchTerm, location, liAtCookie, maxJobs) => {
  let allJobs = [];
  let currentPage = 1;

  const baseUrl = `https://www.linkedin.com/jobs/search?keywords=${encodeURIComponent(
    searchTerm
  )}&location=${encodeURIComponent(
    location
  )}&geoId=106057199&f_TPR=r86400`;

  console.log(`[INFO] Acessando a URL inicial: ${baseUrl}`);

  // Define o cookie `li_at` com o valor fornecido
  await page.setCookie({
    name: "li_at",
    value: liAtCookie,
    domain: ".linkedin.com",
  });

  // Define o User-Agent para simular um navegador comum
  await page.setUserAgent(
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/85.0.4183.83 Safari/537.36"
  );

  // Função para tentar várias vezes em caso de erro
  const tryWithRetries = async (fn, retries = 3, delay = 3000) => {
    for (let i = 0; i < retries; i++) {
      try {
        return await fn();
      } catch (error) {
        if (i < retries - 1) {
          console.warn(`[WARN] Tentativa ${i + 1} falhou, tentando novamente em ${delay}ms...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        } else {
          throw error;
        }
      }
    }
  };

  // Acessa a URL inicial para obter informações gerais, como total de páginas
  await tryWithRetries(() => page.goto(baseUrl, { waitUntil: "domcontentloaded", timeout: 120000 }));

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

  while (allJobs.length < maxJobs && currentPage <= totalPages) {
    console.info(`[INFO] Scraping página ${currentPage} de ${totalPages}...`);

    const pageURL = `${baseUrl}&start=${(currentPage - 1) * 25}`;
    console.log(`[INFO] Acessando URL da página: ${pageURL}`);
    await tryWithRetries(() => page.goto(pageURL, { waitUntil: "domcontentloaded", timeout: 120000 }));

    await page.waitForTimeout(3000); // Espera para garantir que a página foi carregada corretamente

    const jobsResult = await tryWithRetries(() => page.evaluate(() => {
      const jobElements = Array.from(
        document.querySelectorAll(".jobs-search-results__list-item")
      );

      return jobElements.map((job) => {
        const title = job
          .querySelector(".job-card-list__title")
          ?.innerText.trim()
          .replace(/\n/g, ' ');

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
    }), 3, 3000);

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
    currentPage++;
  }

  console.log(`[INFO] Total de vagas coletadas: ${allJobs.length}`);
  return allJobs;
};

module.exports = { getJobListings };
