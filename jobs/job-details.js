// jobs/job-details.js
const puppeteer = require("puppeteer");

/**
 * Extrai detalhes de uma vaga específica no LinkedIn.
 * @param {import('puppeteer').Browser} browser - Instância do browser lançado com proxy.
 * @param {string} jobUrl - URL completa da vaga.
 * @param {string} li_at - Cookie de sessão do LinkedIn.
 * @returns {Promise<any>} Objeto com detalhes da vaga.
 */
async function getJobDetails(browser, jobUrl, li_at) {
  console.log(`[INFO] Accessing job details: ${jobUrl}`);
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

    // Carrega a página de detalhes
    await page.goto(jobUrl, { waitUntil: 'networkidle2' });

    // Aguarda elementos-chave
    await page.waitForSelector('.jobs-details__main-content');

    // Extrai dados
    const jobDetails = await page.evaluate(() => {
      const title = document.querySelector('.jobs-details-top-card__job-title')?.innerText.trim();
      const company = document.querySelector('.jobs-details-top-card__company-url')?.innerText.trim();
      const location = document.querySelector('.jobs-details-top-card__bullet')?.innerText.trim();
      const description = document.querySelector('.jobs-description__container')?.innerText.trim();
      return { title, company, location, description };
    });

    return jobDetails;
  } catch (error) {
    console.error("[ERROR] Failed to fetch job details:", error);
    throw new Error(error.message);
  } finally {
    if (page) await page.close();
  }
}

module.exports = getJobDetails;
