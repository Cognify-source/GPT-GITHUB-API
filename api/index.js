const express = require("express");
const axios = require("axios");

const app = express();
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;

console.log("🚀 GPT-GITHUB-API Build med endpoints: /ping, /tree, /file, /branch, /commit, /pull");

app.use(express.json());

// Failsafe om GITHUB_TOKEN saknas
if (!GITHUB_TOKEN) {
  console.warn("⚠️ Varning: GITHUB_TOKEN saknas! Endast /ping fungerar korrekt.");
}

const headers = GITHUB_TOKEN
  ? {
      Authorization: `Bearer ${GITHUB_TOKEN}`,
      "User-Agent": "GPT-GITHUB-API"
    }
  : {};

// Test-endpoint
app.get("/ping", (req, res) => {
  res.json({
    message: "pong",
    endpoints: ["/ping", "/tree", "/file", "/branch", "/commit", "/pull"],
    tokenConfigured: !!GITHUB_TOKEN
  });
});

// Lista filer i repo
app.get("/tree", async (req, res) => {
  const { owner, repo, path = "" } = req.query;
  if (!owner || !repo) return res.status(400).json({ error: "owner och repo krävs" });
  try {
    const url = `https://api.github.com/repos/${owner}/${repo}/contents/${path}`;
    const response = await axios.get(url, { headers });
    res.json(response.data);
  } catch (err) {
    res.status(err.response?.status || 500).json({ error: err.message, githubResponse: err.response?.data || null });
  }
});

// Hämta filinnehåll
app.get("/file", async (req, res) => {
  const { owner, repo, path } = req.query;
  if (!owner || !repo || !path) return res.status(400).json({ error: "owner, repo och path krävs" });
  try {
    const url = `https://api.github.com/repos/${owner}/${repo}/contents/${path}`;
    const response = await axios.get(url, { headers });
    const content = Buffer.from(response.data.content, "base64").toString("utf8");
    res.json({ name: response.data.name, path, content });
  } catch (err) {
    res.status(err.response?.status || 500).json({ error: err.message, githubResponse: err.response?.data || null });
  }
});

// Skapa branch
app.post("/branch", async (req, res) => {
  const { owner, repo } = req.query;
  const { branchName, fromSha } = req.body;
  if (!owner || !repo || !branchName || !fromSha) return res.status(400).json({ error: "owner, repo, branchName och fromSha krävs" });
  try {
    const url = `https://api.github.com/repos/${owner}/${repo}/git/refs`;
    const response = await axios.post(url, { ref: `refs/heads/${branchName}`, sha: fromSha }, { headers });
    res.json(response.data);
  } catch (err) {
    res.status(err.response?.status || 500).json({ error: err.message, githubResponse: err.response?.data || null });
  }
});

// Commit fil
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
    res.status(err.response?.status || 500).json({ error: err.message, githubResponse: err.response?.data || null });
  }
});

// Skapa Pull Request
app.post("/pull", async (req, res) => {
  const { owner, repo } = req.query;
  const { title, head, base, body } = req.body;
  if (!owner || !repo || !title || !head || !base) return res.status(400).json({ error: "owner, repo, title, head och base krävs" });
  try {
    const url = `https://api.github.com/repos/${owner}/${repo}/pulls`;
    const response = await axios.post(url, { title, head, base, body }, { headers });
    res.json(response.data);
  } catch (err) {
    res.status(err.response?.status || 500).json({ error: err.message, githubResponse: err.response?.data || null });
  }
});

module.exports = app;
