const express = require("express");
const axios = require("axios");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 3000;
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;

if (!GITHUB_TOKEN) {
  console.error("❌ GITHUB_TOKEN saknas i miljövariabler!");
  process.exit(1);
}

const headers = {
  Authorization: `Bearer ${GITHUB_TOKEN}`,
  "User-Agent": "GPT-GITHUB-API"
};

app.get("/tree", async (req, res) => {
  const { owner, repo, path = "" } = req.query;
  if (!owner || !repo) {
    return res.status(400).json({ error: "owner och repo krävs som query-parametrar" });
  }

  try {
    const url = `https://api.github.com/repos/${owner}/${repo}/contents/${path}`;
    const response = await axios.get(url, { headers });
    res.json(response.data);
  } catch (err) {
    console.error("🌩️ GitHub API error (tree):", err.message);
    console.error(err.response?.data);
    res.status(err.response?.status || 500).json({
      error: err.message,
      githubResponse: err.response?.data || null
    });
  }
});

app.get("/file", async (req, res) => {
  const { owner, repo, path } = req.query;
  if (!owner || !repo || !path) {
    return res.status(400).json({ error: "owner, repo och path krävs som query-parametrar" });
  }

  try {
    const url = `https://api.github.com/repos/${owner}/${repo}/contents/${path}`;
    const response = await axios.get(url, { headers });

    const content = Buffer.from(response.data.content, "base64").toString("utf8");
    res.json({ name: response.data.name, path, content });
  } catch (err) {
    console.error("🌩️ GitHub API error (file):", err.message);
    console.error(err.response?.data);
    res.status(err.response?.status || 500).json({
      error: err.message,
      githubResponse: err.response?.data || null
    });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 GPT-GITHUB-API is running on port ${PORT}`);
});
