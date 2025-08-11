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

app.use(express.json());

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

    if (!response.data.content) {
      return res.status(400).json({ error: "Filen saknar innehåll eller är inte en fil (content saknas i GitHub-svar)." });
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
    console.error("\ud83c\udf29\ufe0f GitHub API error (file):", err.message);
    console.error(err.response?.data);
    res.status(err.response?.status || 500).json({
      error: err.message,
      githubResponse: err.response?.data || null
    });
  }
});

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
    console.error("\ud83c\udf29\ufe0f GitHub API error (branch):", err.message);
    console.error(err.response?.data);
    res.status(err.response?.status || 500).json({ error: err.message, githubResponse: err.response?.data || null });
  }
});

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
    console.error("\ud83c\udf29\ufe0f GitHub API error (commit):", err.message);
    console.error(err.response?.data);
    res.status(err.response?.status || 500).json({ error: err.message, githubResponse: err.response?.data || null });
  }
});

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
    console.error("\ud83c\udf29\ufe0f GitHub API error (pull):", err.message);
    console.error(err.response?.data);
    res.status(err.response?.status || 500).json({ error: err.message, githubResponse: err.response?.data || null });
  }
});

app.put("/merge", async (req, res) => {
  const { owner, repo } = req.query;
  const { pull_number, merge_method } = req.body;
  if (!owner || !repo || !pull_number) {
    return res.status(400).json({ error: "owner, repo och pull_number krävs" });
  }
  try {
    const url = `https://api.github.com/repos/${owner}/${repo}/pulls/${pull_number}/merge`;
    const response = await axios.put(url, { merge_method: merge_method || "merge" }, { headers });
    res.json(response.data);
  } catch (err) {
    console.error("\ud83c\udf29\ufe0f GitHub API error (merge):", err.message);
    console.error(err.response?.data);
    res.status(err.response?.status || 500).json({ error: err.message, githubResponse: err.response?.data || null });
  }
});

app.delete("/delete-branch", async (req, res) => {
  const { owner, repo } = req.query;
  const { branchName } = req.body;
  if (!owner || !repo || !branchName) {
    return res.status(400).json({ error: "owner, repo och branchName krävs" });
  }
  try {
    const url = `https://api.github.com/repos/${owner}/${repo}/git/refs/heads/${branchName}`;
    const response = await axios.delete(url, { headers });
    res.json({ message: `Branch '${branchName}' deleted successfully.` });
  } catch (err) {
    console.error("\ud83c\udf29\ufe0f GitHub API error (delete-branch):", err.message);
    console.error(err.response?.data);
    res.status(err.response?.status || 500).json({ error: err.message, githubResponse: err.response?.data || null });
  }
});

app.get('/branches', async (req, res) => {
  const { owner, repo } = req.query;

  if (!owner || !repo) {
    return res.status(400).json({ error: "owner och repo krävs som query-parametrar" });
  }

  try {
    const url = `https://api.github.com/repos/${owner}/${repo}/branches`;
    const response = await fetch(url, {
      headers: {
        Authorization: `token ${process.env.GITHUB_TOKEN}`,
        Accept: 'application/vnd.github.v3+json'
      }
    });

    if (!response.ok) {
      const error = await response.text();
      return res.status(response.status).json({ error });
    }

    const data = await response.json();
    const branchNames = data.map(branch => branch.name);
    res.json({ branches: branchNames });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 GPT-GITHUB-API is running on port ${PORT}`);
});
