const express = require('express');
const puppeteer = require('puppeteer');
const { getJobListings } = require('./scrape-jobs'); // Importa a função de scraping do arquivo scraper-jobs.js

const app = express();

app.use(express.json());

app.post('/scrape-jobs', async (req, res) => {
  const { searchTerm, location, liAtCookie, maxJobs } = req.body;

  if (!searchTerm || !location || !liAtCookie || !maxJobs) {
    return res.status(400).send('Todos os campos (searchTerm, location, liAtCookie, maxJobs) são obrigatórios.');
  }

  try {
    const browser = await puppeteer.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });

    const page = await browser.newPage();
    const jobs = await getJobListings(page, searchTerm, location, liAtCookie, parseInt(maxJobs, 10));

    await browser.close();
    res.status(200).json(jobs); // Retorna a lista de vagas extraídas na resposta
  } catch (error) {
    res.status(500).send(`Erro ao realizar scraping: ${error.message}`);
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});
