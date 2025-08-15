/* eslint-disable no-console */
const express = require("express");
const axios = require("axios");
const crypto = require("crypto");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 3000;

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GITHUB_WEBHOOK_SECRET = process.env.GITHUB_WEBHOOK_SECRET || "";
const DEFAULT_OWNER = process.env.DEFAULT_OWNER || "Cognify-source";
const DEFAULT_REPO = process.env.DEFAULT_REPO || "Koppsnipern";
const DEFAULT_BRANCH = process.env.DEFAULT_BRANCH || "main";

if (!GITHUB_TOKEN) {
  console.error("❌ GITHUB_TOKEN saknas i miljövariabler!");
  process.exit(1);
}

const headers = {
  Authorization: `Bearer ${GITHUB_TOKEN}`,
  "User-Agent": "GPT-GITHUB-API"
};

// Behåll rå body (Buffer) för HMAC + JSON-parse
app.use(
  express.json({
    type: "*/*",
    verify: (req, _res, buf) => {
      req.rawBody = buf; // exakt HMAC
    }
  })
);

/* ------------------------ Hjälpfunktioner ------------------------ */

function verifySignature(rawBody, signature) {
  if (!GITHUB_WEBHOOK_SECRET) return true; // tillåt test utan secret
  const hmac = crypto.createHmac("sha256", GITHUB_WEBHOOK_SECRET);
  const digest = `sha256=${hmac.update(rawBody).digest("hex")}`;
  return (
    signature &&
    crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(digest))
  );
}

const github = axios.create({
  baseURL: "https://api.github.com",
  headers
});

// 40-hex commit SHA?
const SHA40_RE = /^[a-f0-9]{40}$/i;

function pickStr(v, fallback) {
  return typeof v === "string" && v.length ? v : fallback;
}

// Hämta HEAD-commit-SHA för given branch
async function fetchLatestHead(branch = DEFAULT_BRANCH, owner = DEFAULT_OWNER, repo = DEFAULT_REPO) {
  const url = `/repos/${owner}/${repo}/git/ref/heads/${encodeURIComponent(branch)}`;
  const { data } = await github.get(url);
  return data.object.sha; // HEAD commit SHA
}

// Resolva valfri ref (branch/tag/refs/... eller redan SHA) till commit-SHA
async function resolveRefToCommitSha(ref, owner = DEFAULT_OWNER, repo = DEFAULT_REPO) {
  if (SHA40_RE.test(ref)) return ref;

  // Testa korrekta endpoints i ordning
  const tryPaths = ref.startsWith("refs/")
    ? [`/repos/${owner}/${repo}/git/ref/${encodeURIComponent(ref)}`] // full ref, t.ex. refs/heads/feature
    : [
        `/repos/${owner}/${repo}/git/ref/${encodeURIComponent(ref)}`,           // "heads/x" eller "tags/x"
        `/repos/${owner}/${repo}/git/ref/heads/${encodeURIComponent(ref)}`,     // bara branchnamn
        `/repos/${owner}/${repo}/git/ref/tags/${encodeURIComponent(ref)}`       // bara tagnamn
      ];

  for (const path of tryPaths) {
    try {
      const { data } = await github.get(path);
      if (data.object?.type === "commit") return data.object.sha;
      if (data.object?.type === "tag") {
        // Annoterad tag → hämta dess objekt för commit-SHA
        const tagSha = data.object.sha;
        const { data: tagObj } = await github.get(
          `/repos/${owner}/${repo}/git/tags/${tagSha}`
        );
        if (tagObj.object?.type === "commit") return tagObj.object.sha;
      }
    } catch {
      // prova nästa
    }
  }

  // Sista försök: tolka som branchnamn och läs HEAD
  return await fetchLatestHead(ref, owner, repo);
}

// Hämta befintlig file-SHA för path på en viss ref (returnerar null om ej finns)
async function getExistingFileSha(path, ref, owner = DEFAULT_OWNER, repo = DEFAULT_REPO) {
  try {
    const { data } = await github.get(
      `/repos/${owner}/${repo}/contents/${encodeURI(path)}`,
      { params: ref ? { ref } : {} }
    );
    return data?.sha || null;
  } catch (err) {
    if (err?.response?.status === 404) return null;
    throw err;
  }
}

// Hämta tree-SHA för en ref (branch/tag/commit)
// 1) resolva ref → commitSha
// 2) hämta commit-objekt → tree.sha
async function getTreeShaForRef(ref, owner = DEFAULT_OWNER, repo = DEFAULT_REPO) {
  const commitSha = await resolveRefToCommitSha(ref, owner, repo);
  const { data: commitObj } = await github.get(
    `/repos/${owner}/${repo}/git/commits/${commitSha}`
  );
  const treeSha = commitObj?.tree?.sha;
  if (!treeSha) throw new Error(`Kunde inte få tree SHA för ref '${ref}'`);
  return treeSha;
}

/* ------------------------- Webhook ------------------------- */

app.post("/webhook/github", async (req, res) => {
  const signature = req.headers["x-hub-signature-256"];

  if (!verifySignature(req.rawBody, signature)) {
    return res.status(401).json({ error: "Invalid signature" });
  }

  // ref från GitHub payload: t.ex. "refs/heads/Jules-2-1"
  const pushedRef = typeof req.body?.ref === "string" ? req.body.ref : "";
  const queryRef = pickStr(req.query.ref, "");
  const branch =
    (queryRef && (queryRef.replace(/^refs\/heads\//, ""))) ||
    (pushedRef.startsWith("refs/heads/") ? pushedRef.split("/").pop() : "") ||
    DEFAULT_BRANCH;

  console.log(`🔔 Push-event på branch '${branch}' – hämtar HEAD...`);
  try {
    const latestSha = await fetchLatestHead(branch);
    console.log(`✅ Senaste commit på ${branch}: ${latestSha}`);
    res.json({ ok: true, branch, head: latestSha });
  } catch (err) {
    console.error("❌ Misslyckades att hämta HEAD:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// Healthcheck
app.get("/ping", (_req, res) => {
  res.json({ status: "API is running", time: new Date().toISOString() });
});

/* -------------------------- API ENDPOINTS -------------------------- */

/**
 * GET /tree
 * Branch-/ref-medveten listning.
 * - ?ref=<branch|tag|sha> väljer källa (default: DEFAULT_BRANCH)
 * - ?recursive=true (default) ger helträd via Git Trees API (kräver treeSha).
 *   - Om ?path också anges vid recursive=true filtreras svaret till underkatalogen.
 * - Vid recursive=false används GitHub Contents API (icke-rekursivt).
 */
app.get("/tree", async (req, res) => {
  const owner = pickStr(req.query.owner, DEFAULT_OWNER);
  const repo = pickStr(req.query.repo, DEFAULT_REPO);
  const path = pickStr(req.query.path, "");
  const ref = pickStr(req.query.ref, DEFAULT_BRANCH);
  const recursiveParam = String(req.query.recursive ?? "true").toLowerCase();
  const recursive = ["1", "true", "yes"].includes(recursiveParam);

  try {
    if (recursive) {
      // Trees API kräver tree SHA, inte branchnamn → resolva via commit → tree
      const treeSha = await getTreeShaForRef(ref, owner, repo);
      const { data } = await github.get(
        `/repos/${owner}/${repo}/git/trees/${treeSha}`,
        { params: { recursive: 1 } }
      );

      if (path) {
        const norm = path.replace(/^\/+/, "").replace(/\/+$/, "");
        const filtered = (data.tree || []).filter(
          (e) => e.path === norm || (typeof e.path === "string" && e.path.startsWith(norm + "/"))
        );
        return res.json({ ...data, tree: filtered, ref });
      }
      return res.json({ ...data, ref });
    }

    // Icke-rekursivt: Contents API
    const { data } = await github.get(
      `/repos/${owner}/${repo}/contents/${encodeURI(path)}`,
      { params: ref ? { ref } : {} }
    );
    res.json(data);
  } catch (err) {
    console.error("🌩️ GitHub API error (tree):", err.message);
    res.status(err.response?.status || 500).json({
      error: err.message,
      githubResponse: err.response?.data || null
    });
  }
});

/**
 * GET /file
 * Hämtar fil-innehåll från valfri ref (?ref=branch|tag|sha)
 */
app.get("/file", async (req, res) => {
  const owner = pickStr(req.query.owner, DEFAULT_OWNER);
  const repo = pickStr(req.query.repo, DEFAULT_REPO);
  const path = pickStr(req.query.path, "");
  const ref = pickStr(req.query.ref, "");

  if (!path) {
    return res.status(400).json({ error: "path krävs som query-parameter" });
  }

  try {
    const { data } = await github.get(
      `/repos/${owner}/${repo}/contents/${encodeURI(path)}`,
      { params: ref ? { ref } : {} }
    );

    if (!data.content) {
      return res
        .status(400)
        .json({ error: "Filen saknar innehåll eller är inte en fil" });
    }

    const decodedContent = Buffer.from(data.content, "base64").toString("utf8");
    const lineCount = decodedContent.split(/\r\n|\r|\n/).length;

    res.json({
      name: data.name,
      path: data.path,
      sha: data.sha,
      size: data.size,
      line_count: lineCount,
      content: decodedContent,
      encoding: data.encoding,
      url: data.url,
      html_url: data.html_url,
      git_url: data.git_url,
      download_url: data.download_url,
      ref: ref || "default-branch"
    });
  } catch (err) {
    console.error("🌩️ GitHub API error (file):", err.message);
    res.status(err.response?.status || 500).json({
      error: err.message,
      githubResponse: err.response?.data || null
    });
  }
});

/**
 * GET /file-linecount
 * Returnerar endast radantal; läser från valfri ref (?ref=...)
 */
app.get("/file-linecount", async (req, res) => {
  const owner = pickStr(req.query.owner, DEFAULT_OWNER);
  const repo = pickStr(req.query.repo, DEFAULT_REPO);
  const path = pickStr(req.query.path, "");
  const ref = pickStr(req.query.ref, "");

  if (!path) {
    return res.status(400).json({ error: "path krävs som query-parameter" });
  }

  try {
    const { data } = await github.get(
      `/repos/${owner}/${repo}/contents/${encodeURI(path)}`,
      { params: ref ? { ref } : {} }
    );

    if (!data.content) {
      return res
        .status(400)
        .json({ error: "Filen saknar innehåll eller är inte en fil" });
    }

    const decodedContent = Buffer.from(data.content, "base64").toString("utf8");
    const lineCount = decodedContent.split(/\r\n|\r|\n/).length;

    res.json({ line_count: lineCount, ref: ref || "default-branch" });
  } catch (err) {
    console.error("🌩️ GitHub API error (file-linecount):", err.message);
    res.status(err.response?.status || 500).json({
      error: err.message,
      githubResponse: err.response?.data || null
    });
  }
});

/**
 * POST /branch
 * Skapa ny branch från:
 *  - explicit fromSha, eller
 *  - fromRef (branch/tag/refs/... ) → resolvas till commit-SHA, eller
 *  - default: DEFAULT_BRANCH HEAD
 */
app.post("/branch", async (req, res) => {
  const owner = pickStr(req.query.owner, DEFAULT_OWNER);
  const repo = pickStr(req.query.repo, DEFAULT_REPO);
  const branchName = pickStr(req.body?.branchName, "");
  const fromSha = pickStr(req.body?.fromSha, "");
  const fromRef = pickStr(req.body?.fromRef, "");

  if (!branchName) {
    return res.status(400).json({ error: "branchName krävs" });
  }

  try {
    let baseSha = fromSha;
    if (!baseSha) {
      if (fromRef) {
        baseSha = await resolveRefToCommitSha(fromRef, owner, repo);
      } else {
        baseSha = await fetchLatestHead(DEFAULT_BRANCH, owner, repo);
      }
    }

    const url = `/repos/${owner}/${repo}/git/refs`;
    const { data } = await github.post(url, {
      ref: `refs/heads/${branchName}`,
      sha: baseSha
    });

    res.json(data);
  } catch (err) {
    console.error("🌩️ GitHub API error (branch):", err.message);
    res
      .status(err.response?.status || 500)
      .json({ error: err.message, githubResponse: err.response?.data || null });
  }
});

/**
 * GET /branch-head
 * Hämta HEAD-SHA för en branch.
 */
app.get("/branch-head", async (req, res) => {
  const owner = pickStr(req.query.owner, DEFAULT_OWNER);
  const repo = pickStr(req.query.repo, DEFAULT_REPO);
  const branch = pickStr(req.query.branch, "");

  if (!branch) return res.status(400).json({ error: "branch krävs" });

  try {
    const sha = await fetchLatestHead(branch, owner, repo);
    res.json({ branch, head_sha: sha });
  } catch (err) {
    console.error("🌩️ GitHub API error (branch-head):", err.message);
    res
      .status(err.response?.status || 500)
      .json({ error: err.message, githubResponse: err.response?.data || null });
  }
});

/**
 * PUT /commit
 * Commit till specifik branch. Om "sha" utelämnas:
 *  - Om filen redan finns på ref/branch → hämta korrekt file-SHA och uppdatera.
 *  - Om filen inte finns → skapa ny fil utan sha-fält.
 */
app.put("/commit", async (req, res) => {
  const owner = pickStr(req.query.owner, DEFAULT_OWNER);
  const repo = pickStr(req.query.repo, DEFAULT_REPO);
  const path = pickStr(req.body?.path, "");
  const message = pickStr(req.body?.message, "");
  const content = pickStr(req.body?.content, "");
  const branch = pickStr(req.body?.branch, "");
  let sha = pickStr(req.body?.sha, "");

  if (!path || !message || !content || !branch) {
    return res
      .status(400)
      .json({ error: "path, message, content och branch krävs" });
  }

  try {
    if (!sha) {
      // Leta befintlig fil-SHA på mål-ref/branch
      sha = (await getExistingFileSha(path, branch, owner, repo)) || "";
    }

    const url = `/repos/${owner}/${repo}/contents/${encodeURI(path)}`;
    const payload = {
      message,
      content, // base64
      branch,
      ...(sha ? { sha } : {})
    };

    const { data } = await github.put(url, payload);
    res.json(data);
  } catch (err) {
    console.error("🌩️ GitHub API error (commit):", err.message);
    res
      .status(err.response?.status || 500)
      .json({ error: err.message, githubResponse: err.response?.data || null });
  }
});

/**
 * POST /pull
 * Skapa PR (head → base).
 */
app.post("/pull", async (req, res) => {
  const owner = pickStr(req.query.owner, DEFAULT_OWNER);
  const repo = pickStr(req.query.repo, DEFAULT_REPO);
  const title = pickStr(req.body?.title, "");
  const head = pickStr(req.body?.head, "");
  const base = pickStr(req.body?.base, "");
  const body = typeof req.body?.body === "string" ? req.body.body : undefined;
  const draft = Boolean(req.body?.draft);

  if (!title || !head || !base) {
    return res.status(400).json({ error: "title, head och base krävs" });
  }

  try {
    const url = `/repos/${owner}/${repo}/pulls`;
    const { data } = await github.post(url, { title, head, base, body, draft });
    res.json(data);
  } catch (err) {
    console.error("🌩️ GitHub API error (pull):", err.message);
    res
      .status(err.response?.status || 500)
      .json({ error: err.message, githubResponse: err.response?.data || null });
  }
});

/**
 * PUT /merge
 * Mergar en PR.
 */
app.put("/merge", async (req, res) => {
  const owner = pickStr(req.query.owner, DEFAULT_OWNER);
  const repo = pickStr(req.query.repo, DEFAULT_REPO);
  const pull_number = req.body?.pull_number;
  const merge_method = pickStr(req.body?.merge_method, "merge");

  if (!pull_number) {
    return res.status(400).json({ error: "pull_number krävs" });
  }

  try {
    const url = `/repos/${owner}/${repo}/pulls/${pull_number}/merge`;
    const { data } = await github.put(url, { merge_method });
    res.json(data);
  } catch (err) {
    console.error("🌩️ GitHub API error (merge):", err.message);
    res
      .status(err.response?.status || 500)
      .json({ error: err.message, githubResponse: err.response?.data || null });
  }
});

/**
 * DELETE /delete-branch
 * Tar bort en branch (refs/heads/{branchName})
 */
app.delete("/delete-branch", async (req, res) => {
  const owner = pickStr(req.query.owner, DEFAULT_OWNER);
  const repo = pickStr(req.query.repo, DEFAULT_REPO);
  const branchName = pickStr(req.body?.branchName, "");

  if (!branchName) {
    return res.status(400).json({ error: "branchName krävs" });
  }

  try {
    const url = `/repos/${owner}/${repo}/git/refs/heads/${encodeURIComponent(branchName)}`;
    await github.delete(url);
    res.json({ message: `Branch '${branchName}' deleted successfully.` });
  } catch (err) {
    console.error("🌩️ GitHub API error (delete-branch):", err.message);
    res
      .status(err.response?.status || 500)
      .json({ error: err.message, githubResponse: err.response?.data || null });
  }
});

/**
 * GET /branches
 * Listar alla branch-namn.
 */
app.get("/branches", async (req, res) => {
  const owner = pickStr(req.query.owner, DEFAULT_OWNER);
  const repo = pickStr(req.query.repo, DEFAULT_REPO);

  try {
    const url = `/repos/${owner}/${repo}/branches`;
    const { data } = await github.get(url);
    res.json({ branches: data.map((b) => b.name) });
  } catch (err) {
    console.error("🌩️ GitHub API error (branches):", err.message);
    res.status(err.response?.status || 500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 GPT-GITHUB-API is running on port ${PORT}`);
});
