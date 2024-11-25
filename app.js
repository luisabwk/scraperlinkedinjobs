const express = require('express');
const app = express();

// Exemplo problemático:
// app.post('/endpoint', { invalid: "object" }); // Isto gera erro

// Solução: Passe uma função como callback
app.post('/scrape-jobs', (req, res) => {
  res.send('Callback funcionando!');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});
