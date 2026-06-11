const express = require('express');
const path = require('path');

const app = express();
const port = Number(process.env.PORT || 5173);
const distDir = path.join(__dirname, 'dist');

app.use(express.static(distDir));
app.get('*', (_req, res) => {
  res.sendFile(path.join(distDir, 'index.html'));
});

app.listen(port, '0.0.0.0', () => {
  console.log(`Frontend dist server listening on http://localhost:${port}`);
});
