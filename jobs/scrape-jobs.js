const puppeteer = require("puppeteer");

async function getJobListings(browser, searchTerm, location, li_at, maxJobs) {
  console.log("[DEBUG] Iniciando o processo de getJobListings...");
  let allJobs = [];
  const baseUrl = `https://www.linkedin.com/jobs/search?keywords=${encodeURIComponent(searchTerm)}&location=${encodeURIComponent(location)}&geoId=106057199&f_TPR=r86400`;

  console.log(`[INFO] Acessando a URL inicial: ${baseUrl}`);

  if (!browser || typeof browser.newPage !== "function") {
    throw new Error("Navegador Puppeteer não inicializado corretamente.");
  }

  const page = await browser.newPage();
  await page.setViewport({ width: 1920, height: 1080 });
  await page.setUserAgent(
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36"
  );

  try {
    const cookies = [
      {
        name: "li_at",
        value: li_at,
        domain: ".linkedin.com",
      },
    ];
    await page.setCookie(...cookies);
    console.log("[INFO] Cookie 'li_at' configurado com sucesso.");

    await page.setRequestInterception(true);
    page.on('request', (req) => {
      const resourceType = req.resourceType();
      if (resourceType === 'image' || resourceType === 'media' || resourceType === 'font') {
        req.abort();
      } else {
        req.continue();
      }
    });

    await page.goto(baseUrl, { 
      waitUntil: "networkidle0",
      timeout: 60000 
    });
    console.log("[INFO] Página inicial acessada com sucesso.");

    let totalPages = 1;
    try {
      await page.waitForSelector(".artdeco-pagination__pages.artdeco-pagination__pages--number", { timeout: 20000 });
      totalPages = await page.$$eval(
        ".artdeco-pagination__pages.artdeco-pagination__pages--number li button",
        (buttons) => Math.max(...buttons.map((el) => parseInt(el.innerText.trim())).filter(n => !isNaN(n)))
      );
      console.info(`[INFO] Número total de páginas: ${totalPages}`);
    } catch (error) {
      console.warn("[WARN] Não foi possível obter o número total de páginas, continuando com uma página.");
    }

    for (let currentPage = 1; currentPage <= totalPages; currentPage++) {
      console.info(`[INFO] Scraping página ${currentPage} de ${totalPages}...`);

      if (currentPage > 1) {
        const pageURL = `${baseUrl}&start=${(currentPage - 1) * 25}`;
        await page.goto(pageURL, { 
          waitUntil: "networkidle0",
          timeout: 60000 
        });
      }

      await page.waitForSelector('.scaffold-layout__list', { timeout: 10000 });

      const jobsResult = await page.evaluate(() => {
        const jobElements = Array.from(document.querySelectorAll(".job-card-container--clickable"));
        return jobElements.map((job) => {
          const title = job.querySelector(".job-card-list__title--link")?.innerText.trim().replace(/\n/g, " ");
          const company = job.querySelector(".artdeco-entity-lockup__subtitle")?.innerText.trim();
          const locationData = job.querySelector(".job-card-container__metadata-wrapper")?.innerText.trim();

          let location = "";
          let formato = "";

          if (locationData) {
            const formatMatch = locationData.match(/\(([^)]+)\)/);
            if (formatMatch) {
              formato = formatMatch[1].trim();
            }
            location = locationData.replace(/\(.*?\)/, "").trim();
          }

          const link = job.querySelector("a")?.href;

          return {
            vaga: title || "",
            empresa: company || "",
            local: location || "",
            formato: formato || "",
            link: link || "",
          };
        });
      });

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

      if (allJobs.length >= maxJobs) {
        console.info(`[INFO] Número máximo de vagas (${maxJobs}) alcançado.`);
        break;
      }
    }

    console.log(`[INFO] Total de vagas coletadas: ${allJobs.length}`);
    return { totalVagas: allJobs.length, vagas: allJobs.slice(0, maxJobs) };
  } catch (error) {
    console.error("[ERROR] Erro ao realizar scraping:", error);
    throw new Error(`Erro durante o scraping: ${error.message}`);
  } finally {
    await page.close();
  }
}

module.exports = getJobListings;
