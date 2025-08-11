const express = require("express");
const axios = require("axios");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 3000;
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;

// Default repo-info
const DEFAULT_OWNER = "Cognify-source";
const DEFAULT_REPO = "Koppsnipern";

if (!GITHUB_TOKEN) {
  console.error("❌ GITHUB_TOKEN saknas i miljövariabler!");
  process.exit(1);
}

const headers = {
  Authorization: `Bearer ${GITHUB_TOKEN}`,
  "User-Agent": "GPT-GITHUB-API"
};

app.use(express.json());

// Healthcheck
app.get("/ping", (req, res) => {
  res.json({ status: "API is running", time: new Date().toISOString() });
});

// List files in repo
app.get("/tree", async (req, res) => {
  const owner = req.query.owner || DEFAULT_OWNER;
  const repo = req.query.repo || DEFAULT_REPO;
  const path = req.query.path || "";

  try {
    const url = `https://api.github.com/repos/${owner}/${repo}/contents/${path}`;
    const response = await axios.get(url, { headers });
    res.json(response.data);
  } catch (err) {
    console.error("🌩️ GitHub API error (tree):", err.message);
    res.status(err.response?.status || 500).json({
      error: err.message,
      githubResponse: err.response?.data || null
    });
  }
});

// Get file with metadata
app.get("/file", async (req, res) => {
  const owner = req.query.owner || DEFAULT_OWNER;
  const repo = req.query.repo || DEFAULT_REPO;
  const path = req.query.path;

  if (!path) {
    return res.status(400).json({ error: "path krävs som query-parameter" });
  }

  try {
    const url = `https://api.github.com/repos/${owner}/${repo}/contents/${path}`;
    const response = await axios.get(url, { headers });

    if (!response.data.content) {
      return res.status(400).json({ error: "Filen saknar innehåll eller är inte en fil" });
    }

    const decodedContent = Buffer.from(response.data.content, "base64").toString("utf8");
    const lineCount = decodedContent.split(/\r\n|\r|\n/).length;

    res.json({
      name: response.data.name,
      path: response.data.path,
      sha: response.data.sha,
      size: response.data.size,
      line_count: lineCount,
      content: decodedContent,
      encoding: response.data.encoding,
      url: response.data.url,
      html_url: response.data.html_url,
      git_url: response.data.git_url,
      download_url: response.data.download_url
    });
  } catch (err) {
    console.error("🌩️ GitHub API error (file):", err.message);
    res.status(err.response?.status || 500).json({
      error: err.message,
      githubResponse: err.response?.data || null
    });
  }
});

// Get only line count
app.get("/file-linecount", async (req, res) => {
  const owner = req.query.owner || DEFAULT_OWNER;
  const repo = req.query.repo || DEFAULT_REPO;
  const path = req.query.path;

  if (!path) {
    return res.status(400).json({ error: "path krävs som query-parameter" });
  }

  try {
    const url = `https://api.github.com/repos/${owner}/${repo}/contents/${path}`;
    const response = await axios.get(url, { headers });

    if (!response.data.content) {
      return res.status(400).json({ error: "Filen saknar innehåll eller är inte en fil" });
    }

    const decodedContent = Buffer.from(response.data.content, "base64").toString("utf8");
    const lineCount = decodedContent.split(/\r\n|\r|\n/).length;

    res.json({ line_count: lineCount });
  } catch (err) {
    console.error("🌩️ GitHub API error (file-linecount):", err.message);
    res.status(err.response?.status || 500).json({
      error: err.message,
      githubResponse: err.response?.data || null
    });
  }
});

// Create branch
app.post("/branch", async (req, res) => {
  const owner = req.query.owner || DEFAULT_OWNER;
  const repo = req.query.repo || DEFAULT_REPO;
  const { branchName, fromSha } = req.body;

  if (!branchName) {
    return res.status(400).json({ error: "branchName krävs" });
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
    res.status(err.response?.status || 500).json({ error: err.message, githubResponse: err.response?.data || null });
  }
});

// Commit file
app.put("/commit", async (req, res) => {
  const owner = req.query.owner || DEFAULT_OWNER;
  const repo = req.query.repo || DEFAULT_REPO;
  const { path, message, content, branch, sha } = req.body;

  if (!path || !message || !content || !branch) {
    return res.status(400).json({ error: "path, message, content och branch krävs" });
  }

  try {
    const url = `https://api.github.com/repos/${owner}/${repo}/contents/${path}`;
    const response = await axios.put(url, { message, content, branch, sha }, { headers });
    res.json(response.data);
  } catch (err) {
    console.error("🌩️ GitHub API error (commit):", err.message);
    res.status(err.response?.status || 500).json({ error: err.message, githubResponse: err.response?.data || null });
  }
});

// Create pull request
app.post("/pull", async (req, res) => {
  const owner = req.query.owner || DEFAULT_OWNER;
  const repo = req.query.repo || DEFAULT_REPO;
  const { title, head, base, body } = req.body;

  if (!title || !head || !base) {
    return res.status(400).json({ error: "title, head och base krävs" });
  }

  try {
    const url = `https://api.github.com/repos/${owner}/${repo}/pulls`;
    const response = await axios.post(url, { title, head, base, body }, { headers });
    res.json(response.data);
  } catch (err) {
    console.error("🌩️ GitHub API error (pull):", err.message);
    res.status(err.response?.status || 500).json({ error: err.message, githubResponse: err.response?.data || null });
  }
});

// Merge pull request
app.put("/merge", async (req, res) => {
  const owner = req.query.owner || DEFAULT_OWNER;
  const repo = req.query.repo || DEFAULT_REPO;
  const { pull_number, merge_method } = req.body;

  if (!pull_number) {
    return res.status(400).json({ error: "pull_number krävs" });
  }

  try {
    const url = `https://api.github.com/repos/${owner}/${repo}/pulls/${pull_number}/merge`;
    const response = await axios.put(url, { merge_method: merge_method || "merge" }, { headers });
    res.json(response.data);
  } catch (err) {
    console.error("🌩️ GitHub API error (merge):", err.message);
    res.status(err.response?.status || 500).json({ error: err.message, githubResponse: err.response?.data || null });
  }
});

// Delete branch
app.delete("/delete-branch", async (req, res) => {
  const owner = req.query.owner || DEFAULT_OWNER;
  const repo = req.query.repo || DEFAULT_REPO;
  const { branchName } = req.body;

  if (!branchName) {
    return res.status(400).json({ error: "branchName krävs" });
  }

  try {
    const url = `https://api.github.com/repos/${owner}/${repo}/git/refs/heads/${branchName}`;
    await axios.delete(url, { headers });
    res.json({ message: `Branch '${branchName}' deleted successfully.` });
  } catch (err) {
    console.error("🌩️ GitHub API error (delete-branch):", err.message);
    res.status(err.response?.status || 500).json({ error: err.message, githubResponse: err.response?.data || null });
  }
});

// List branches
app.get("/branches", async (req, res) => {
  const owner = req.query.owner || DEFAULT_OWNER;
  const repo = req.query.repo || DEFAULT_REPO;

  try {
    const url = `https://api.github.com/repos/${owner}/${repo}/branches`;
    const response = await axios.get(url, { headers });
    res.json({ branches: response.data.map(branch => branch.name) });
  } catch (err) {
    console.error("🌩️ GitHub API error (branches):", err.message);
    res.status(err.response?.status || 500).json({ error: err.message });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 GPT-GITHUB-API is running on port ${PORT}`);
});
