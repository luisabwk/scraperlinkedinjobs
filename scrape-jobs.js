const express = require("express");
const puppeteer = require("puppeteer");
const axios = require("axios");

const app = express();
app.use(express.json());

app.post("/scrape", async (req, res) => {
  const { searchTerm, location } = req.body;

  if (!searchTerm || !location) {
    return res.status(400).json({ error: "Parâmetros 'searchTerm' e 'location' são obrigatórios." });
  }

  let browser;
  try {
    browser = await puppeteer.launch({
      executablePath:
        "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      headless: false,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });

    const page = await browser.newPage();
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
      value: "COOKIE AQUI",
      domain: ".linkedin.com",
    });

    // Define o User-Agent para simular um navegador comum
    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/85.0.4183.83 Safari/537.36"
    );

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
      console.log(`[INFO] Acessando URL da página: ${pageURL}`);
      await page.goto(pageURL, { waitUntil: "domcontentloaded", timeout: 60000 });

      await page.waitForTimeout(2000); // Espera para garantir que a página foi carregada corretamente

      const jobsResult = await page.evaluate(() => {
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
    }

    console.log(`[INFO] Total de vagas coletadas: ${allJobs.length}`);
    res.status(200).json({ jobs: allJobs });
  } catch (error) {
    console.error("[ERROR] Ocorreu um erro:", error);
    res.status(500).json({ error: "Erro ao executar o scraping." });
  } finally {
    if (browser) {
      await browser.close();
    }
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});
