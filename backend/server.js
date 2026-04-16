const express = require('express');
const dotenv = require('dotenv');
const cors = require('cors');

dotenv.config();

const app = express();

app.use(cors({
  origin: ['http://localhost:1100', 'https://scrapscan-1.onrender.com']
}));

app.use(express.json());

app.post('/api/chat', async (req, res) => {
  try {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.OPENROUTER_KEY}`
      },
      body: JSON.stringify(req.body)
    });

    const data = await response.json();
    res.json(data);

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log('Server running on port ' + PORT);
});