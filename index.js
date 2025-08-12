#!/usr/bin/env node
/**
 * GitHub User Activity CLI (Node 14+)
 * - CommonJS
 * - Sem libs externas, usa 'https' nativo
 */
const https = require('https');
const { URL } = require('url');
const { stdout, stderr } = process;

const ANSI = {
  reset: "\u001b[0m",
  dim: "\u001b[2m",
  bold: "\u001b[1m",
  green: "\u001b[32m",
  yellow: "\u001b[33m",
  red: "\u001b[31m",
  cyan: "\u001b[36m"
};
function color(txt, c){ return c + txt + ANSI.reset; }

function parseArgs(argv){
  const args = argv.slice(2);
  let username = null;
  let limit = 30;
  let jsonOut = false;
  for (let i=0; i<args.length; i++){
    const a = args[i];
    if (a === "--limit") {
      const n = Number(args[i+1]);
      if (!Number.isFinite(n) || n<=0) die("Valor inválido para --limit");
      limit = Math.min(100, n);
      i++;
    } else if (a === "--json") {
      jsonOut = true;
    } else if (a.startsWith("-")) {
      die("Flag desconhecida: " + a);
    } else if (!username) {
      username = a;
    } else {
      die("Argumentos extras não reconhecidos: " + a);
    }
  }
  if (!username) {
    help();
    process.exit(1);
  }
  return { username, limit, jsonOut };
}

function help(){
  stdout.write(`\n${color("GitHub User Activity", ANSI.bold)}\n`);
  stdout.write(`Uso: github-activity <username> [--limit 30] [--json]\n\n`);
}

function die(msg){
  stderr.write(color("Erro: ", ANSI.red) + msg + "\n");
  process.exit(1);
}

function ghHeaders(){
  return {
    "User-Agent": "github-activity-cli",
    "Accept": "application/vnd.github+json"
  };
}

function resetTimeToStr(resetEpoch){
  const dt = new Date(resetEpoch * 1000);
  return dt.toLocaleString();
}

function httpGetJSON(url){
  return new Promise((resolve, reject)=>{
    const u = new URL(url);
    const options = {
      method: "GET",
      hostname: u.hostname,
      path: u.pathname + (u.search || ""),
      headers: ghHeaders()
    };
    const req = https.request(options, (res)=>{
      let data = "";
      res.setEncoding("utf8");
      res.on("data", chunk => data += chunk);
      res.on("end", ()=>{
        const headers = res.headers || {};
        const status = res.statusCode || 0;
        if (status >= 200 && status < 300){
          try{
            const json = data ? JSON.parse(data) : null;
            resolve({ json, headers, status });
          }catch(e){
            reject(new Error("invalid_json: " + e.message));
          }
        } else {
          resolve({ text: data, headers, status });
        }
      });
    });
    req.on("error", reject);
    req.end();
  });
}

async function fetchEvents(username, perPage){
  const url = new URL(`https://api.github.com/users/${encodeURIComponent(username)}/events`);
  url.searchParams.set("per_page", String(perPage));
  const { json, headers, status, text } = await httpGetJSON(url.toString());
  const rlRemain = headers["x-ratelimit-remaining"];
  const rlReset = headers["x-ratelimit-reset"];
  if (status === 404) throw new Error("not_found: Usuário não encontrado");
  if (status === 403 && rlRemain === "0"){
    const when = rlReset ? resetTimeToStr(Number(rlReset)) : "(desconhecido)";
    throw new Error(`rate_limited: Limite de requisições atingido. Tente novamente após ${when}.`);
  }
  if (status < 200 || status >= 300){
    throw new Error(`http_${status}: Falha ao consultar API. ${text || ""}`);
  }
  return { data: json, rateRemaining: rlRemain, rateReset: rlReset };
}

function repoName(repo){
  if (!repo) return "(repo desconhecido)";
  return repo.name || repo;
}
function branchFromRef(ref){
  if (!ref) return "";
  const parts = ref.split("/");
  return parts[parts.length-1] || ref;
}
function capitalize(s){ return (s||"").charAt(0).toUpperCase() + (s||"").slice(1); }

function fmtEvent(ev){
  const t = ev.type;
  const r = repoName(ev.repo);
  const p = ev.payload || {};
  switch(t){
    case "PushEvent": {
      const commits = (p.commits && p.commits.length) || 0;
      const branch = branchFromRef(p.ref);
      return `Pushed ${commits} commit(s) to ${r}${branch ? " (branch " + branch + ")" : ""}`;
    }
    case "IssuesEvent": {
      return `${capitalize(p.action)} an issue${p.issue ? " #" + p.issue.number : ""} in ${r}${p.issue && p.issue.title ? ": " + p.issue.title : ""}`;
    }
    case "IssueCommentEvent": {
      return `${capitalize(p.action)} a comment on issue #${p.issue ? p.issue.number : "?"} in ${r}`;
    }
    case "PullRequestEvent": {
      const merged = p.pull_request && p.pull_request.merged;
      const num = p.pull_request && p.pull_request.number;
      const title = p.pull_request && p.pull_request.title;
      if (merged) return `Merged pull request #${num} in ${r}: ${title || ""}`.trim();
      return `${capitalize(p.action)} a pull request #${num} in ${r}${title ? ": " + title : ""}`;
    }
    case "PullRequestReviewEvent": {
      return `${capitalize(p.action)} a review on PR #${p.pull_request ? p.pull_request.number : "?"} in ${r}`;
    }
    case "PullRequestReviewCommentEvent": {
      return `${capitalize(p.action)} a review comment on PR #${p.pull_request ? p.pull_request.number : "?"} in ${r}`;
    }
    case "WatchEvent": return `Starred ${r}`;
    case "ForkEvent": return `Forked ${r} → ${p.forkee && p.forkee.full_name ? p.forkee.full_name : "(fork)"}`;
    case "CreateEvent": {
      if (p.ref_type === "repository") return `Created repository ${r}`;
      if (p.ref_type === "tag") return `Created tag ${p.ref} in ${r}`;
      if (p.ref_type === "branch") return `Created branch ${p.ref} in ${r}`;
      return `Created ${p.ref_type || "something"} in ${r}`;
    }
    case "DeleteEvent": {
      return `Deleted ${p.ref_type || "ref"} ${p.ref || ""} in ${r}`.trim();
    }
    case "ReleaseEvent": {
      return `${capitalize(p.action)} a release ${p.release ? p.release.tag_name : ""} in ${r}`.trim();
    }
    case "PublicEvent": return `Open-sourced ${r}`;
    case "MemberEvent": return `${capitalize(p.action)} ${p.member && p.member.login ? p.member.login : "a member"} in ${r}`;
    case "GollumEvent": return `Updated the wiki in ${r}`;
    default:
      return `${t} in ${r}`;
  }
}

function printEvents(list, opts){
  if (opts.jsonOut){
    try{
      stdout.write(JSON.stringify(list, null, 2) + "\n");
    }catch{
      stdout.write(String(list) + "\n");
    }
    return;
  }
  if (!Array.isArray(list) || list.length === 0){
    stdout.write(color("Nenhum evento recente encontrado.", ANSI.dim) + "\n");
    return;
  }
  for (const ev of list){
    const msg = fmtEvent(ev);
    const when = new Date(ev.created_at).toLocaleString();
    stdout.write(`• ${msg} ${color("(" + when + ")", ANSI.dim)}\n`);
  }
}

async function main(){
  const { username, limit, jsonOut } = parseArgs(process.argv);
  try {
    const { data, rateRemaining } = await fetchEvents(username, limit);
    if (!jsonOut){
      const remainStr = typeof rateRemaining === "string" ? `limite restante: ${rateRemaining}` : "";
      stdout.write(color(`GitHub activity for @${username}`, ANSI.cyan) + (remainStr? " " + color("(" + remainStr + ")", ANSI.dim):"") + "\n");
    }
    printEvents(data, { jsonOut });
  } catch (e){
    const msg = String(e && e.message || e);
    if (msg.indexOf("not_found:") === 0){
      die("Usuário não encontrado. Verifique o username.");
    } else if (msg.indexOf("rate_limited:") === 0){
      die(msg.replace("rate_limited: ",""));
    } else if (msg.indexOf("http_") === 0){
      die(msg);
    } else {
      die("Falha inesperada: " + msg);
    }
  }
}

main();
