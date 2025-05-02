// jobs/job-details-v2.js
const puppeteer = require("puppeteer");

/**
 * Extrai detalhes de uma vaga específica no LinkedIn usando Puppeteer com proxy.
 * @param {import('puppeteer').Browser} browser
 * @param {string} jobUrl
 * @param {string} li_at
 */
async function getJobDetails(browser, jobUrl, li_at) {
  console.log(`[INFO] Accessing job details: ${jobUrl}`);
  let page;
  try {
    page = await browser.newPage();
    await page.setViewport({ width: 1920, height: 1080 });
    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/90.0.4430.212 Safari/537.36"
    );
    await page.setCookie({ name: "li_at", value: li_at, domain: ".linkedin.com" });

    await page.goto(jobUrl, { waitUntil: 'networkidle2' });
    await page.waitForSelector('.jobs-details__main-content');

    const jobDetails = await page.evaluate(() => {
      const title = document.querySelector('.jobs-details-top-card__job-title')?.innerText.trim();
      const company = document.querySelector('.jobs-details-top-card__company-url')?.innerText.trim();
      const location = document.querySelector('.jobs-details-top-card__bullet')?.innerText.trim();
      const description = document.querySelector('.jobs-description__container')?.innerText.trim();
      return { title, company, location, description };
    });

    return jobDetails;
  } catch (error) {
    console.error("[ERROR] getJobDetails failed:", error.message);
    throw new Error(error.message);
  } finally {
    if (page) await page.close();
  }
}

module.exports = getJobDetails;
