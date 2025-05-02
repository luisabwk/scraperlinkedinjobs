// jobs/scrape-jobsv3.js
const puppeteer = require("puppeteer");
const fs = require("fs").promises;
const path = require("path");

async function autoScroll(page) {
  await page.evaluate(async () => {
    await new Promise(resolve => {
      let totalHeight = 0;
      const distance = 300;
      const timer = setInterval(() => {
        window.scrollBy(0, distance);
        totalHeight += distance;
        if (totalHeight >= document.body.scrollHeight - window.innerHeight) {
          clearInterval(timer);
          resolve();
        }
      }, 100 + Math.random() * 150);
    });
  });
}

async function waitForNetworkIdle(page, timeout = 20000, maxInflightRequests = 0) {
  try {
    await page.waitForNetworkIdle({ idleTime: 1000, timeout, maxInflightRequests });
  } catch {
    // continue even if idle timeout
  }
}

/**
 * Faz scraping da listagem de vagas no LinkedIn usando Puppeteer com proxy.
 */
async function getJobListings(browser, searchTerm, location, li_at, maxJobs = 100) {
  const screenshotDir = path.join(__dirname, '../screenshots');
  await fs.mkdir(screenshotDir, { recursive: true });

  const url = `https://www.linkedin.com/jobs/search/?keywords=${encodeURIComponent(searchTerm)}&location=${encodeURIComponent(location)}`;
  const cookies = [{ name: 'li_at', value: li_at, domain: '.linkedin.com' }];

  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64)');
  await page.setCookie(...cookies);

  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
    console.log('[DEBUG] Page.goto completed (domcontentloaded)');
    try {
      const listSelector = 'ul.jobs-search__results-list, ul.jobs-search-results__list';
      await page.waitForSelector(listSelector, { timeout: 30000 });
      console.log('[DEBUG] List container found with selector:', listSelector);
    } catch (err) {
      console.error('[ERROR] List container not found:', err.message);
      const screenshotPath = path.join(screenshotDir, 'no_container.png');
      await page.screenshot({ path: screenshotPath, fullPage: true });
      console.log('[INFO] Screenshot saved to', screenshotPath);
    }
  await waitForNetworkIdle(page);

  const results = [];
  while (results.length < maxJobs) {
    const cards = await page.$$('.jobs-search-results__list li');
    for (const card of cards) {
      if (results.length >= maxJobs) break;
      const titleEl = await card.$('.artdeco-entity-lockup--size-4 .artdeco-entity-lockup__title');
      const linkEl = await card.$('.job-card-list__title--link');
      const companyEl = await card.$('.artdeco-entity-lockup__subtitle.ember-view');
      const detailsEl = await card.$('.job-card-container__metadata-wrapper');

      const title = titleEl ? (await page.evaluate(el => el.innerText.trim(), titleEl)) : null;
      const link = linkEl ? (await page.evaluate(el => el.href, linkEl)) : null;
      const company = companyEl ? (await page.evaluate(el => el.innerText.trim(), companyEl)) : null;
      const snippet = detailsEl ? (await page.evaluate(el => el.innerText.trim(), detailsEl)) : null;

      if (title && link) {
        results.push({ title, company, snippet, link });
      }
    }
    if (results.length >= maxJobs) break;
    await autoScroll(page);
    await waitForNetworkIdle(page);
  }

  await page.close();
  return { totalVagas: results.length, vagas: results };
}

module.exports = getJobListings;
