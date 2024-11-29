const puppeteer = require("puppeteer");
const express = require("express");
const axios = require("axios");

const app = express();
app.use(express.json());

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

    // Tentar acessar a página com controle de redirecionamentos
    const maxRedirects = 5;
    let redirectCount = 0;
    let response;

    while (redirectCount < maxRedirects) {
      response = await page.goto(baseUrl, { waitUntil: "domcontentloaded", timeout: 120000 });
      if (response && response.status() >= 300 && response.status() < 400) {
        // Se for um redirecionamento, aumentar o contador e tentar novamente
        const redirectUrl = response.headers().location;
        console.log(`[INFO] Redirecionado para: ${redirectUrl}`);
        await page.goto(redirectUrl, { waitUntil: "domcontentloaded", timeout: 120000 });
        redirectCount++;
      } else {
        break;
      }
    }

    if (redirectCount >= maxRedirects) {
      throw new Error("Too many redirects. Verifique o cookie 'li_at' ou a URL de destino.");
    }

    console.log("[INFO] Página inicial acessada com sucesso.");

    // Verificar o conteúdo da página para depuração
    const pageContent = await page.content();
    console.log("[DEBUG] HTML da página carregada: ", pageContent.slice(0, 500)); // Mostra os primeiros 500 caracteres do HTML

    // Descobrir o número total de páginas
    let totalPages = 1;
    try {
      await page.waitForSelector(".artdeco-pagination__pages", { timeout: 20000 });
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
        timeout: 120000,
      });

      await page.waitForTimeout(5000); // Aumentar a espera para garantir que os elementos sejam carregados

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

app.post("/scrape-jobs", async (req, res) => {
  const { searchTerm, location, li_at } = req.body;

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

    const jobs = await getJobListings(browser, searchTerm, location, li_at);
    res.status(200).send({ message: "Scraping realizado com sucesso!", jobs });
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
