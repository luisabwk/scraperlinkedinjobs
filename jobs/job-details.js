// jobs/job-details.js
const puppeteer = require("puppeteer");
require('dotenv').config();

async function getJobDetails(browser, jobUrl, li_at) {
  console.log(`[INFO] Accessing job details: ${jobUrl}`);
  let page;
  try {
    page = await browser.newPage();
    const proxyUsername = process.env.PROXY_USERNAME;
    const proxyPassword = process.env.PROXY_PASSWORD;
    if (proxyUsername && proxyPassword) {
      await page.authenticate({ username: proxyUsername, password: proxyPassword });
      console.log('[INFO] Proxy authenticated');
    }
    await page.setViewport({ width: 1920, height: 1080 });
    await page.setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/119.0.0.0 Safari/537.36");
    await page.setCookie({ name: "li_at", value: li_at, domain: ".linkedin.com" });

    await page.goto(jobUrl, { waitUntil: 'domcontentloaded' });
    // Expand description
    const seeMore = '.jobs-description__footer-button';
    if (await page.$(seeMore)) {
      await page.click(seeMore);
      console.log('[INFO] Expanded description');
    }

    const details = await page.evaluate(() => ({
      title: document.querySelector('.jobs-details-jobs-unified-top-card__job-title')?.innerText.trim(),
      company: document.querySelector('.jobs-details-jobs-unified-top-card__company-name')?.innerText.trim(),
      location: document.querySelector('.jobs-details-jobs-unified-top-card__primary-description-container')?.innerText.split(' ·')[0].trim(),
      description: document.querySelector('#job-details')?.innerText.trim(),
    }));

    // Handle apply URL
    const applyBtn = await page.$('.jobs-apply-button--top-card');
    if (applyBtn) {
      const text = await page.evaluate(el => el.textContent.trim(), applyBtn);
      if (text.includes('Candidatar-se')) {
        await applyBtn.click();
        await page.waitForTimeout(3000);
        const newUrl = await page.evaluate(() => window.__NEW_TAB_URL__ || '');
        details.applyUrl = newUrl || jobUrl;
      } else {
        details.applyUrl = jobUrl;
      }
    } else {
      details.applyUrl = jobUrl;
    }

    return details;
  } catch (err) {
    console.error('[ERROR] getJobDetails:', err.message);
    throw new Error(err.message);
  } finally {
    if (page) await page.close();
  }
}

module.exports = getJobDetails;
