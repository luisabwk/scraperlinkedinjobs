// jobs/scrape-jobs.js
const puppeteer = require("puppeteer");

async function waitForNetworkIdle(page, timeout = 10000, maxInflightRequests = 0) {
  try {
    await page.waitForNetworkIdle({ idleTime: 500, timeout, maxInflightRequests });
  } catch (error) {
    console.warn('[WARN] Network idle timeout reached, continuing anyway');
  }
}

/**
 * Faz scraping da listagem de vagas no LinkedIn usando Puppeteer e proxy autenticado.
 * @param {import('puppeteer').Browser} browser - Instância do browser lançado com proxy.
 * @param {string} searchTerm - Termo de busca (e.g. "marketing").
 * @param {string} location - Localização (e.g. "Brasil").
 * @param {string} li_at - Cookie de sessão do LinkedIn.
 * @param {number} maxJobs - Número máximo de vagas a extrair.
 * @returns {Promise<{ totalVagas: number, vagas: any[] }>} Objetos extraídos.
 */
async function getJobListings(browser, searchTerm, location, li_at, maxJobs) {
  console.log("[DEBUG] Iniciando o processo de getJobListings...");
  const baseUrl = `https://www.linkedin.com/jobs/search/?keywords=${encodeURIComponent(searchTerm)}&location=${encodeURIComponent(location)}`;
  console.log(`[INFO] Acessando a URL inicial: ${baseUrl}`);

  let page;
  try {
    // Cria nova página e autentica proxy
    page = await browser.newPage();
    await page.authenticate({
      username: process.env.PROXY_USERNAME,
      password: process.env.PROXY_PASSWORD
    });

    // Configurações iniciais
    await page.setViewport({ width: 1920, height: 1080 });
    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/90.0.4430.212 Safari/537.36"
    );
    await page.setCookie({ name: "li_at", value: li_at, domain: ".linkedin.com" });

    // Navegação e scraping
    await page.goto(baseUrl, { waitUntil: 'networkidle2' });
    await waitForNetworkIdle(page);

    // Implementar rolagem e coleta de resultados até maxJobs
    const results = [];
    while (results.length < maxJobs) {
      const newJobs = await page.evaluate(() => {
        // Extrair dados de vagas da página
        const cards = Array.from(document.querySelectorAll('ul.jobs-search__results-list li'));
        return cards.map(card => ({
          title: card.querySelector('h3')?.innerText.trim(),
          company: card.querySelector('h4')?.innerText.trim(),
          location: card.querySelector('.job-search-card__location')?.innerText.trim(),
          link: card.querySelector('a')?.href,
        }));
      });
      for (const job of newJobs) {
        if (results.length >= maxJobs) break;
        if (!results.find(j => j.link === job.link)) {
          results.push(job);
        }
      }

      // Tenta rolar mais
      await page.evaluate('window.scrollBy(0, window.innerHeight)');
      await waitForNetworkIdle(page, 5000);
      if (newJobs.length === 0) break;
    }

    return { totalVagas: results.length, vagas: results };
  } catch (error) {
    console.error("[ERROR] Erro ao realizar scraping:", error);
    throw new Error(error.message);
  } finally {
    if (page) await page.close();
  }
}

module.exports = getJobListings;
