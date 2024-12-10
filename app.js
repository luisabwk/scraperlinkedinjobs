const puppeteer = require("puppeteer");
const express = require("express");
const { authenticateLinkedIn } = require("./auth/linkedinAuth");
const getJobListings = require("./jobs/scrape-jobs");
const getJobDetails = require("./jobs/job-details");

const app = express();
app.use(express.json());

app.post("/auth", async (req, res) => {
  const { username, password, emailConfig } = req.body;

  if (!username || !password || !emailConfig) {
    return res.status(400).send({ error: "Parâmetros 'username', 'password' e 'emailConfig' são obrigatórios." });
  }

  try {
    const liAtCookie = await authenticateLinkedIn(emailConfig, username, password);
    res.status(200).send({ message: "Autenticação realizada com sucesso!", li_at: liAtCookie });
  } catch (error) {
    console.error("[ERROR] Erro durante a autenticação:", error.message);
    res.status(500).send({ error: error.message });
  }
});

app.post("/scrape-jobs", async (req, res) => {
  const { searchTerm, location, li_at, maxJobs = 50 } = req.body;

  if (!searchTerm || !location || !li_at) {
    return res.status(400).send({ 
