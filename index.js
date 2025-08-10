app.post("/branch", express.json(), async (req, res) => {
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

app.put("/commit", express.json(), async (req, res) => {
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

app.post("/pull", express.json(), async (req, res) => {
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
