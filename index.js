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

// Aktivera JSON-body parsing för alla endpoints
app.use(express.json());

// Test-route
app.get("/ping", (req, res) => {
  res.json({ status: "API is running", time: new Date().toISOString() });
});

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

// Skapa branch
app.post("/branch", async (req, res) => {
  const { owner, repo } = req.query;
  const { branchName, fromSha } = req.body;
  if (!owner || !repo || !branchName) {
    return res.status(400).json({ error: "owner, repo och branchName krävs" });
  }
  try {
    let sha = fromSha;
    if (!sha) {
      const mainRef = await axios.get(`https://api.github.com/repos/${owner}/${repo}/git/ref/heads/main`, { headers });
      sha = mainRef.data.object.sha;
    }
    const url = `https://api.github.com/repos/${owner}/${repo}/git/refs`;
    const response = await axios.post(url, { ref: `refs/heads/${branchName}`, sha }, { headers });
    res.json(response.data);
  } catch (err) {
    console.error("🌩️ GitHub API error (branch):", err.message);
    console.error(err.response?.data);
    res.status(err.response?.status || 500).json({ error: err.message, githubResponse: err.response?.data || null });
  }
});

// Skapa eller uppdatera fil
app.put("/commit", async (req, res) => {
  const { owner, repo } = req.query;
  const { path, message, content, branch, sha } = req.body;
  if (!owner || !repo || !path || !message || !content || !branch) {
    return res.status(400).json({ error: "owner, repo, path, message, content och branch krävs" });
  }
  try {
    const url = `https://api.github.com/repos/${owner}/${repo}/contents/${path}`;
    const response = await axios.put(url, { message, content, branch, sha }, { headers });
    res.json(response.data);
  } catch (err) {
    console.error("🌩️ GitHub API error (commit):", err.message);
    console.error(err.response?.data);
    res.status(err.response?.status || 500).json({ error: err.message, githubResponse: err.response?.data || null });
  }
});

// Skapa pull request
app.post("/pull", async (req, res) => {
  const { owner, repo } = req.query;
  const { title, head, base, body } = req.body;
  if (!owner || !repo || !title || !head || !base) {
    return res.status(400).json({ error: "owner, repo, title, head och base krävs" });
  }
  try {
    const url = `https://api.github.com/repos/${owner}/${repo}/pulls`;
    const response = await axios.post(url, { title, head, base, body }, { headers });
    res.json(response.data);
  } catch (err) {
    console.error("🌩️ GitHub API error (pull):", err.message);
    console.error(err.response?.data);
    res.status(err.response?.status || 500).json({ error: err.message, githubResponse: err.response?.data || null });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 GPT-GITHUB-API is running on port ${PORT}`);
});
