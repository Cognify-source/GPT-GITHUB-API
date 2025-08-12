import { Request, Response } from "express";
import crypto from "crypto";

// Använd inbyggda fetch i Node 18+
const GITHUB_SECRET = process.env.GITHUB_WEBHOOK_SECRET || "";
const GITHUB_TOKEN = process.env.GITHUB_TOKEN || "";
const DEFAULT_OWNER = "Cognify-source";
const DEFAULT_REPO = "Koppsnipern";

// Enkel minnescache för repo-data
let repoCache: any = null;

function verifySignature(rawBody: string, signature?: string) {
  const hmac = crypto.createHmac("sha256", GITHUB_SECRET);
  const digest = `sha256=${hmac.update(rawBody).digest("hex")}`;
  return (
    signature &&
    crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(digest))
  );
}

async function syncRepo() {
  const url = `https://api.github.com/repos/${DEFAULT_OWNER}/${DEFAULT_REPO}/contents`;
  const resp = await fetch(url, {
    headers: {
      Authorization: `Bearer ${GITHUB_TOKEN}`,
      "User-Agent": "GPT-GITHUB-API",
    },
  });
  repoCache = await resp.json();
  console.log(`✅ Repo-cache uppdaterad (${repoCache.length} objekt)`);
}

export default async function githubWebhook(req: Request, res: Response) {
  if (req.method !== "POST") return res.status(405).end();

  const signature = req.headers["x-hub-signature-256"] as string;
  const event = req.headers["x-github-event"] as string;
  const rawBody = JSON.stringify(req.body);

  if (!verifySignature(rawBody, signature)) {
    return res.status(401).json({ error: "Invalid signature" });
  }

  console.log(`🔔 GitHub webhook: ${event}`);

  if (event === "push") {
    console.log("🔄 Synkar repo...");
    await syncRepo();
  }

  res.json({ ok: true });
}

// Extra: endpoint för att hämta cachet data
export function getRepoCache(req: Request, res: Response) {
  if (!repoCache) {
    return res.status(404).json({ error: "Cache not loaded yet" });
  }
  res.json(repoCache);
}
