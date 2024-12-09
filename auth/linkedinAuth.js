const puppeteer = require("puppeteer");

class LinkedInAuthManager {
  constructor() {
    this.cookieCache = new Map();
    this.COOKIE_MAX_AGE = 12 * 60 * 60 * 1000;
  }

  async refreshCookie(username, password, retryCount = 0) {
    const maxRetries = 3;
    const browser = await puppeteer.launch({
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
        "--disable-software-rasterizer",
      ]
    });

    const page = await browser.newPage();

    try {
      console.log("[AUTH] Iniciando login no LinkedIn");
      await page.goto('https://www.linkedin.com/login', { waitUntil: 'networkidle0' });
      
      await page.type('#username', username);
      await page.type('#password', password);
      
      await Promise.all([
        page.waitForNavigation({ waitUntil: 'networkidle0' }),
        page.click('[type="submit"]')
      ]);

      if (page.url().includes('/login')) {
        throw new Error('Login falhou');
      }

      const cookies = await page.cookies();
      const li_at = cookies.find(cookie => cookie.name === 'li_at');

      if (!li_at) {
        throw new Error('Cookie não encontrado após login');
      }

      this.cookieCache.set(username, {
        value: li_at.value,
        timestamp: Date.now()
      });
      
      return li_at.value;

    } catch (error) {
      if (retryCount < maxRetries) {
        const delay = Math.pow(2, retryCount) * 1000;
        await new Promise(r => setTimeout(r, delay));
        return this.refreshCookie(username, password, retryCount + 1);
      }
      throw error;
    } finally {
      await browser.close();
    }
  }

  async getCookie(username, password) {
    const cached = this.cookieCache.get(username);
    
    if (cached && Date.now() - cached.timestamp < this.COOKIE_MAX_AGE) {
      return cached.value;
    }

    return this.refreshCookie(username, password);
  }

  async validateCookie(browser, li_at) {
    const page = await browser.newPage();
    try {
      await page.setCookie({
        name: 'li_at',
        value: li_at,
        domain: '.linkedin.com'
      });

      const response = await page.goto('https://www.linkedin.com/feed/');
      return !response.url().includes('linkedin.com/login');
    } finally {
      await page.close();
    }
  }
}

module.exports = LinkedInAuthManager;
