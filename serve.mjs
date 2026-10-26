// node serve.mjs → open http://localhost:5051 (English) or /fr/ (French); the page editor's Save then writes that page's file in place.
import http from "node:http";
import fs from "node:fs";

const PORT = 5051;
const pages = { "/": "index.html", "/index.html": "index.html", "/fr/": "fr/index.html", "/fr/index.html": "fr/index.html" };
const hosts = new Set([`localhost:${PORT}`, `127.0.0.1:${PORT}`]);

http.createServer((req, res) => {
  const path = req.url.split(/[?#]/)[0];
  if (!hosts.has(req.headers.host)) return res.writeHead(404).end();
  if (req.method === "GET" && path.startsWith("/images/")) { // the page's photos, read-only
    const name = path.slice(8);
    if (!/^[\w.-]+\.(jpe?g|png|webp|svg)$/i.test(name)) return res.writeHead(404).end();
    try { return res.writeHead(200, { "content-type": name.endsWith(".svg") ? "image/svg+xml" : "image/jpeg" }).end(fs.readFileSync(new URL(`./images/${name}`, import.meta.url))); }
    catch { return res.writeHead(404).end(); }
  }
  if (path === "/fr") return res.writeHead(301, { location: "/fr/" }).end(); // as GitHub Pages does
  if (!Object.hasOwn(pages, path)) return res.writeHead(404).end();
  const file = new URL(`./${pages[path]}`, import.meta.url);
  const version = String(fs.statSync(file).mtimeMs);
  if (req.method === "GET") {
    // stamp the version the tab was loaded from, so a save from an outdated tab can't overwrite newer work;
    // no line break after <head>: Save removes the tag, and a line break would be left behind on every save
    const html = fs.readFileSync(file, "utf8").replace("<head>", `<head><meta name="az-version" content="${version}">`);
    return res.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" }).end(html);
  }
  if (req.method !== "PUT") return res.writeHead(405).end(); // no CORS headers, so other sites can't PUT
  let body = "";
  req.setEncoding("utf8");
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    if (req.headers["x-az-version"] !== String(fs.statSync(file).mtimeMs)) return res.writeHead(409).end();
    if (!body.startsWith("<!doctype html>") || !body.includes('id="msgbox"')) return res.writeHead(400).end();
    const tmp = new URL(`./${pages[path]}.tmp`, import.meta.url);
    fs.writeFileSync(tmp, body);
    fs.renameSync(tmp, file); // atomic: never a half-written page
    res.writeHead(204).end();
  });
}).listen(PORT, "127.0.0.1", () => console.log(`editing at http://localhost:${PORT}`));
