// jobs/scrape-jobs-v2.js
const puppeteer = require("puppeteer");
const fs = require("fs").promises;
const path = require("path");

async function autoScroll(page) {
  console.log("[DEBUG] Starting autoScroll...");
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
  console.log("[DEBUG] Completed autoScroll");
}

async function waitForNetworkIdle(page, timeout = 20000, maxInflightRequests = 0) {
  console.log(`[DEBUG] Waiting for network idle: timeout=${timeout}ms, maxInflightRequests=${maxInflightRequests}`);
  try {
    await page.waitForNetworkIdle({ idleTime: 1000, timeout, maxInflightRequests });
    console.log("[DEBUG] Network idle reached");
  } catch (err) {
    console.warn("[WARN] Network idle timeout reached, continuing. Error:", err.message);
  }
}

/**
 * Faz scraping da listagem de vagas no LinkedIn usando Puppeteer com proxy.
 */
async function getJobListings(browser, searchTerm, location, li_at, maxJobs = 100) {
  console.log("[DEBUG] Iniciando getJobListings...");
  const screenshotDir = path.join(__dirname, '../screenshots');
  await fs.mkdir(screenshotDir, { recursive: true });

  const baseUrl = `https://www.linkedin.com/jobs/search/?keywords=${encodeURIComponent(searchTerm)}&location=${encodeURIComponent(location)}&geoId=106057199&f_TPR=r604800`;
  console.log(`[INFO] Base URL: ${baseUrl}`);

  const cookies = [
    { name: 'li_at', value: li_at, domain: '.linkedin.com' },
    { name: 'lang', value: 'pt_BR', domain: '.linkedin.com' },
    { name: 'JSESSIONID', value: `ajax:${Math.random().toString(36).slice(2)}`, domain: '.linkedin.com' }
  ];

  let page;
  try {
    page = await browser.newPage();
    console.log('[DEBUG] New page created');
    page.setDefaultNavigationTimeout(60000);
    console.log('[DEBUG] Set default navigation timeout to 60000ms');

    await page.setViewport({ width: 1280, height: 800 });
    console.log('[DEBUG] Viewport set to 1280x800');
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/122.0.0.0 Safari/537.36');
    console.log('[DEBUG] User agent set');
    await page.setExtraHTTPHeaders({ 'Accept-Language': 'pt-BR,pt;q=0.9' });
    console.log('[DEBUG] Extra HTTP headers set');
    await page.setCookie(...cookies);
    console.log('[INFO] Cookies set');

    console.log(`[INFO] Navigating to ${baseUrl}`);
    const response = await page.goto(baseUrl, { waitUntil: 'networkidle2', timeout: 60000 });
    console.log(`[INFO] Page.goto completed - status: ${response && response.status ? response.status() : 'no response object'}`);

    await waitForNetworkIdle(page, 30000);

    const results = [];
    let iteration = 0;
    while (results.length < maxJobs) {
      iteration++;
      console.log(`[DEBUG] Loop iteration ${iteration}: current results ${results.length}`);

      // before extract, capture count of list container elements
      const containerExists = await page.$('ul.jobs-search__results-list');
      console.log('[DEBUG] jobs-search__results-list exists:', Boolean(containerExists));

      const newJobs = await page.evaluate(() => {
        const cards = Array.from(document.querySelectorAll('ul.jobs-search__results-list li'));
        return cards.map(card => ({
          title: card.querySelector('h3')?.innerText.trim(),
          company: card.querySelector('h4')?.innerText.trim(),
          location: card.querySelector('.job-search-card__location')?.innerText.trim(),
          link: card.querySelector('a')?.href
        }));
      });
      console.log(`[DEBUG] Extracted ${newJobs.length} jobs in iteration ${iteration}`);

      if (!newJobs.length) {
        console.warn('[WARN] No job cards found on page, possible page structure change');
        // capture screenshot for analysis
        const screenshotPath = path.join(screenshotDir, `error_iter${iteration}.png`);
        await page.screenshot({ path: screenshotPath, fullPage: true });
        console.log('[INFO] Screenshot saved to', screenshotPath);
      }

      for (const job of newJobs) {
        if (results.length >= maxJobs) break;
        if (!results.find(j => j.link === job.link)) {
          results.push(job);
          console.log(`[DEBUG] Added job: ${job.title} - ${job.link}`);
        }
      }

      if (results.length >= maxJobs || newJobs.length === 0) {
        console.log('[DEBUG] No more jobs to extract or reached maxJobs');
        break;
      }

      console.log('[DEBUG] Scrolling for more jobs');
      await autoScroll(page);
      await waitForNetworkIdle(page, 30000);
    }

    console.log(`[INFO] Scraping finished: total jobs found ${results.length}`);
    return { totalVagas: results.length, vagas: results };
  } catch (err) {
    console.error('[ERROR] scraping error:', err);
    // capture screenshot on failure
    if (page) {
      const screenshotPath = path.join(path.dirname(__dirname), 'screenshots', `error_exception.png`);
      await page.screenshot({ path: screenshotPath, fullPage: true });
      console.log('[INFO] Exception screenshot saved to', screenshotPath);
    }
    throw err;
  } finally {
    if (page) {
      console.log('[DEBUG] Closing page');
      await page.close();
    }
  }
}

module.exports = getJobListings;
