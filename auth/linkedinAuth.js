const puppeteer = require("puppeteer");

class LinkedInAuthManager {
  constructor() {
    this.cookieCache = new Map();
    this.COOKIE_MAX_AGE = 12 * 60 * 60 * 1000;
  }

  async getCookie(username, password) {
    const cached = this.cookieCache.get(username);
    if (cached && Date.now() - cached.timestamp < this.COOKIE_MAX_AGE) {
      return cached.value;
    }
    return this.refreshCookie(username, password);
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
      
      // Configurar viewport e user agent
      await page.setViewport({ width: 1920, height: 1080 });
      await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36');

      // Navegar para página de login
      await page.goto('https://www.linkedin.com/login', { 
        waitUntil: 'networkidle0',
        timeout: 60000 
      });

      // Verificar se os campos de login estão presentes
      await page.waitForSelector('#username', { timeout: 10000 });
      await page.waitForSelector('#password', { timeout: 10000 });
      
      // Digitar credenciais
      await page.type('#username', username);
      await page.type('#password', password);
      
      // Clicar no botão de login e aguardar navegação
      await Promise.all([
        page.waitForNavigation({ 
          waitUntil: 'networkidle0',
          timeout: 60000 
        }),
        page.click('[type="submit"]')
      ]);

      // Aguardar redirecionamento
      await new Promise(r => setTimeout(r, 5000));

      // Verificar se o login foi bem sucedido
      const currentUrl = page.url();
      if (currentUrl.includes('/login')) {
        throw new Error('Login falhou - credenciais inválidas');
      }
      if (currentUrl.includes('/checkpoint')) {
        throw new Error('Login requer verificação adicional');
      }

      // Tentar obter o cookie várias vezes
      let li_at = null;
      for (let i = 0; i < 3; i++) {
        const cookies = await page.cookies();
        li_at = cookies.find(cookie => cookie.name === 'li_at');
        if (li_at) break;
        await new Promise(r => setTimeout(r, 2000));
      }

      if (!li_at) {
        throw new Error('Cookie não encontrado após login');
      }

      // Verificar se o cookie é válido
      const isValid = await this.validateCookie(browser, li_at.value);
      if (!isValid) {
        throw new Error('Cookie obtido é inválido');
      }

      // Armazenar no cache
      this.cookieCache.set(username, {
        value: li_at.value,
        timestamp: Date.now()
      });
      
      console.log("[AUTH] Login realizado com sucesso");
      return li_at.value;

    } catch (error) {
      console.error(`[AUTH] Erro no login: ${error.message}`);
      
      if (retryCount < maxRetries) {
        const delay = Math.pow(2, retryCount) * 1000;
        console.log(`[AUTH] Tentando novamente em ${delay/1000} segundos...`);
        await new Promise(r => setTimeout(r, delay));
        return this.refreshCookie(username, password, retryCount + 1);
      }
      throw error;
    } finally {
      if (page) await page.close().catch(() => {});
      if (browser) await browser.close().catch(() => {});
    }
  }

  async validateCookie(browser, li_at) {
    if (!browser || !li_at) return false;

    const page = await browser.newPage();
    try {
      await page.setViewport({ width: 1920, height: 1080 });
      await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36');
      
      await page.setCookie({
        name: 'li_at',
        value: li_at,
        domain: '.linkedin.com'
      });

      const response = await page.goto('https://www.linkedin.com/feed/', {
        waitUntil: 'networkidle0',
        timeout: 30000
      });

      const url = response.url();
      return !url.includes('linkedin.com/login');
    } catch (error) {
      console.error("[AUTH] Erro ao validar cookie:", error.message);
      return false;
    } finally {
      if (page) await page.close().catch(() => {});
    }
  }
}

module.exports = LinkedInAuthManager;
