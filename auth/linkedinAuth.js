const puppeteer = require("puppeteer");

class LinkedInAuthManager {
  constructor(username, password) {
    this.username = username;
    this.password = password;
    this.currentCookie = null;
    this.lastUpdateTime = null;
    this.isRefreshing = false;
    this.COOKIE_MAX_AGE = 12 * 60 * 60 * 1000; // 12 horas
  }

  async refreshCookie(retryCount = 0) {
    if (this.isRefreshing) {
      console.log("[AUTH] Atualização de cookie já em andamento");
      return this.currentCookie;
    }

    this.isRefreshing = true;
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
      console.log("[AUTH] Iniciando processo de login no LinkedIn");
      await page.goto('https://www.linkedin.com/login', { waitUntil: 'networkidle0' });
      
      await page.type('#username', this.username);
      await page.type('#password', this.password);
      
      await Promise.all([
        page.waitForNavigation({ waitUntil: 'networkidle0' }),
        page.click('[type="submit"]')
      ]);

      const url = page.url();
      if (url.includes('/login') || url.includes('/checkpoint')) {
        throw new Error('Login falhou - possível desafio de segurança');
      }

      const cookies = await page.cookies();
      const li_at = cookies.find(cookie => cookie.name === 'li_at');

      if (!li_at) {
        throw new Error('Cookie li_at não encontrado após login');
      }

      this.currentCookie = li_at.value;
      this.lastUpdateTime = Date.now();
      console.log("[AUTH] Cookie atualizado com sucesso");
      
      return this.currentCookie;

    } catch (error) {
      console.error(`[AUTH] Erro ao atualizar cookie: ${error.message}`);
      
      if (retryCount < maxRetries) {
        const delay = Math.pow(2, retryCount) * 1000;
        console.log(`[AUTH] Tentando novamente em ${delay/1000} segundos...`);
        await new Promise(r => setTimeout(r, delay));
        return this.refreshCookie(retryCount + 1);
      }
      
      throw error;
    } finally {
      this.isRefreshing = false;
      await browser.close();
    }
  }

  async getCookie() {
    try {
      if (!this.currentCookie || !this.lastUpdateTime || 
          Date.now() - this.lastUpdateTime > this.COOKIE_MAX_AGE) {
        await this.refreshCookie();
      }
      return this.currentCookie;
    } catch (error) {
      console.error("[AUTH] Erro ao obter cookie:", error);
      throw error;
    }
  }

  async validateCookie(browser) {
    if (!this.currentCookie) return false;

    const page = await browser.newPage();
    try {
      await page.setCookie({
        name: 'li_at',
        value: this.currentCookie,
        domain: '.linkedin.com'
      });

      const response = await page.goto('https://www.linkedin.com/feed/', {
        waitUntil: 'networkidle0',
        timeout: 30000
      });

      return !response.url().includes('linkedin.com/login');
    } catch (error) {
      console.warn("[AUTH] Erro ao validar cookie:", error.message);
      return false;
    } finally {
      await page.close();
    }
  }
}

module.exports = LinkedInAuthManager;
