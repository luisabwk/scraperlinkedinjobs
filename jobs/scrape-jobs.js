// jobs/scrape-jobs.js
const puppeteer = require("puppeteer");
const fs = require("fs").promises;
const path = require("path");
require('dotenv').config();

async function autoScroll(page) {
  await page.evaluate(async () => {
    await new Promise((resolve) => {
      let totalHeight = 0;
      const distance = 300;
      const timer = setInterval(() => {
        const scrollHeight = document.body.scrollHeight;
        window.scrollBy(0, distance);
        totalHeight += distance;

        if (totalHeight >= scrollHeight - window.innerHeight) {
          clearInterval(timer);
          resolve();
        }
      }, 100 + Math.floor(Math.random() * 150));
    });
  });
}

async function waitForNetworkIdle(page, timeout = 15000, maxInflightRequests = 0) {
  try {
    await page.waitForNetworkIdle({ idleTime: 1000, timeout, maxInflightRequests });
    return true;
  } catch {
    console.warn('[WARN] Network idle timeout');
    return false;
  }
}

async function getJobListings(browser, searchTerm, location, li_at, maxJobs = 100) {
  console.log("[DEBUG] Iniciando getJobListings...");
  const screenshotDir = path.join(__dirname, "../screenshots");
  await fs.mkdir(screenshotDir, { recursive: true });

  const baseUrl = `https://www.linkedin.com/jobs/search/?keywords=${encodeURIComponent(searchTerm)}&location=${encodeURIComponent(location)}&geoId=106057199&f_TPR=r604800`;
  console.log(`[INFO] Accessing: ${baseUrl}`);

  const proxyUsername = process.env.PROXY_USERNAME;
  const proxyPassword = process.env.PROXY_PASSWORD;

  const cookies = [
    { name: "li_at", value: li_at, domain: ".linkedin.com" },
    { name: "lang", value: "pt_BR", domain: ".linkedin.com" },
    { name: "JSESSIONID", value: `ajax:${Math.random().toString(36).slice(2)}`, domain: ".linkedin.com" }
  ];

  let page;
  try {
    page = await browser.newPage();
    if (proxyUsername && proxyPassword) {
      await page.authenticate({ username: proxyUsername, password: proxyPassword });
      console.log('[INFO] Proxy authenticated');
    }
    await page.setViewport({ width: 1280, height: 800 });
    await page.setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/122.0.0.0 Safari/537.36");
    await page.setExtraHTTPHeaders({ 'Accept-Language': 'pt-BR,pt;q=0.9' });
    await page.setCookie(...cookies);
    console.log('[INFO] Cookies set');

    await page.goto(baseUrl, { waitUntil: 'networkidle2' });
    await waitForNetworkIdle(page);

    const results = [];
    while (results.length < maxJobs) {
      const newJobs = await page.evaluate(() => {
        const cards = Array.from(document.querySelectorAll('ul.jobs-search__results-list li'));
        return cards.map(card => ({
          title: card.querySelector('h3')?.innerText.trim(),
          company: card.querySelector('h4')?.innerText.trim(),
          location: card.querySelector('.job-search-card__location')?.innerText.trim(),
          link: card.querySelector('a')?.href
        }));
      });
      newJobs.forEach(job => {
        if (results.length < maxJobs && !results.find(j => j.link === job.link)) {
          results.push(job);
        }
      });
      if (results.length >= maxJobs) break;
      await autoScroll(page);
      await waitForNetworkIdle(page, 5000);
      if (!newJobs.length) break;
    }

    console.log(`[INFO] Total jobs: ${results.length}`);
    return { totalVagas: results.length, vagas: results };
  } catch (err) {
    console.error("[ERROR] scraping error:", err.message);
    throw new Error(err.message);
  } finally {
    if (page) await page.close();
  }
}

module.exports = getJobListings;
