const puppeteer = require("puppeteer");
const express = require("express");
const axios = require("axios");

const app = express();
app.use(express.json());

async function getJobListings(browser, searchTerm, location, li_at, maxJobs) {
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

  try {
    // Define o cookie `li_at` com o valor fornecido
    const cookies = [
      {
        name: "li_at",
        value: li_at,
        domain: ".linkedin.com",
      },
    ];
    await page.setCookie(...cookies);
    console.log("[INFO] Cookie 'li_at' configurado com sucesso.");

    // Define o User-Agent para simular um navegador comum
    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/85.0.4183.83 Safari/537.36"
    );

    // Acessar a URL inicial
    await page.goto(baseUrl, { waitUntil: "domcontentloaded", timeout: 120000 });
    console.log("[INFO] Página inicial acessada com sucesso.");

    // Descobrir o número total de páginas
    let totalPages = 1;
    try {
      await page.waitForSelector(".artdeco-pagination__pages.artdeco-pagination__pages--number", { timeout: 20000 });
      totalPages = await page.$$eval(
        ".artdeco-pagination__pages.artdeco-pagination__pages--number li button",
        (buttons) => Math.max(...buttons.map((el) => parseInt(el.innerText.trim())).filter(n => !isNaN(n)))
      );
      console.info(`[INFO] Número total de páginas: ${totalPages}`);
    } catch (error) {
      console.warn(
        "[WARN] Não foi possível obter o número total de páginas, continuando com uma página."
      );
    }

    // Iterar sobre cada página de 1 até o total de páginas ou até atingir maxJobs
    for (let currentPage = 1; currentPage <= totalPages; currentPage++) {
      console.info(
        `[INFO] Scraping página ${currentPage} de ${totalPages}...`
      );

      // Navegar para a página específica
      const pageURL = `${baseUrl}&start=${(currentPage - 1) * 25}`;
      await page.goto(pageURL, {
        waitUntil: "domcontentloaded",
        timeout: 120000,
      });

      // Garantir que estamos focando na área correta das vagas
      await page.waitForSelector('.scaffold-layout__list', { timeout: 10000 });

      // Captura os dados das vagas na página atual
      const jobsResult = await page.evaluate(() => {
        const jobElements = Array.from(
          document.querySelectorAll(".job-card-container--clickable")
        );

        return jobElements.map((job) => {
          const title = job
            .querySelector(".job-card-list__title--link")
            ?.innerText.trim()
            .replace(/\n/g, " "); // Remover quebras de linha

          const company = job
            .querySelector(".artdeco-entity-lockup__subtitle")
            ?.innerText.trim();

          const locationData = job
            .querySelector(".job-card-container__metadata-wrapper")
            ?.innerText.trim();

          let location = "";
          let formato = "";

          if (locationData) {
            // Usando expressão regular para extrair a parte entre parênteses como formato
            const formatMatch = locationData.match(/\(([^)]+)\)/);
            if (formatMatch) {
              formato = formatMatch[1].trim(); // Extraímos o que está dentro dos parênteses
            }
            // Remover a parte dos parênteses e definir o restante como localização
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

      // Verificar se o número máximo de vagas foi alcançado
      if (allJobs.length >= maxJobs) {
        console.info(`[INFO] Número máximo de vagas (${maxJobs}) alcançado.`);
        break;
      }
    }

    console.log(`[INFO] Total de vagas coletadas: ${allJobs.length}`);

    return {
      totalVagas: allJobs.length,
      vagas: allJobs.slice(0, maxJobs),
    };
  } catch (error) {
    console.error("[ERROR] Erro ao realizar scraping:", error);
    throw new Error("Erro durante o scraping.");
  } finally {
    await page.close();
  }
}

app.post("/scrape-jobs", async (req, res) => {
  const { searchTerm, location, li_at, maxJobs = 50 } = req.body;

  if (!li_at || !searchTerm || !location) {
    return res.status(400).send({ error: "Parâmetros 'li_at', 'searchTerm' e 'location' são obrigatórios." });
  }

  let browser;
  try {
    browser = await puppeteer.launch({
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
        "--disable-software-rasterizer",
      ],
    });

    const jobs = await getJobListings(browser, searchTerm, location, li_at, maxJobs);
    res.status(200).send({ message: "Scraping realizado com sucesso!", totalVagas: jobs.totalVagas, jobs: jobs.vagas });
  } catch (error) {
    console.error("[ERROR] Ocorreu um erro:", error);
    res.status(500).send({ error: error.message });
  } finally {
    if (browser) {
      await browser.close();
    }
  }
});

// Inicializar o servidor na porta 3000
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor rodando em http://localhost:${PORT}`);
});

module.exports = getJobListings;
