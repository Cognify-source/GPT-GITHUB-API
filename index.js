const express = require("express");
const axios = require("axios");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 3000;
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;

if (!GITHUB_TOKEN) {
  console.error("Missing GITHUB_TOKEN env var");
  process.exit(1);
}

const headers = {
  Authorization: `Bearer ${GITHUB_TOKEN}`,
  "User-Agent": "GPT-GITHUB-API"
};

app.get("/tree", async (req, res) => {
  const { owner, repo, path = "" } = req.query;
  try {
    const url = `https://api.github.com/repos/${owner}/${repo}/contents/${path}`;
    const response = await axios.get(url, { headers });
    res.json(response.data);
  } catch (err) {
    res.status(err.response?.status || 500).json(err.response?.data || { error: "Unknown error" });
  }
});

app.get("/file", async (req, res) => {
  const { owner, repo, path } = req.query;
  try {
    const url = `https://api.github.com/repos/${owner}/${repo}/contents/${path}`;
    const response = await axios.get(url, { headers });
    const content = Buffer.from(response.data.content, "base64").toString("utf8");
    res.json({ name: response.data.name, path, content });
  } catch (err) {
    res.status(err.response?.status || 500).json(err.response?.data || { error: "Unknown error" });
  }
});

app.listen(PORT, () => {
  console.log(`GPT-GITHUB-API is running on port ${PORT}`);
});