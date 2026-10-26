// node serve.mjs → open http://localhost:5051 ; the page editor's Save then writes index.html in place.
import http from "node:http";
import fs from "node:fs";

const PORT = 5051;
const file = new URL("./index.html", import.meta.url);
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
  if (path !== "/" && path !== "/index.html") return res.writeHead(404).end();
  const version = String(fs.statSync(file).mtimeMs);
  if (req.method === "GET") {
    // stamp the version the tab was loaded from, so a save from an outdated tab can't overwrite newer work
    const html = fs.readFileSync(file, "utf8").replace("<head>", `<head>\n<meta name="az-version" content="${version}">`);
    return res.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" }).end(html);
  }
  if (req.method !== "PUT") return res.writeHead(405).end(); // no CORS headers, so other sites can't PUT
  let body = "";
  req.setEncoding("utf8");
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    if (req.headers["x-az-version"] !== String(fs.statSync(file).mtimeMs)) return res.writeHead(409).end();
    if (!body.startsWith("<!doctype html>") || !body.includes('id="msgbox"')) return res.writeHead(400).end();
    const tmp = new URL("./index.html.tmp", import.meta.url);
    fs.writeFileSync(tmp, body);
    fs.renameSync(tmp, file); // atomic: never a half-written index.html
    res.writeHead(204).end();
  });
}).listen(PORT, "127.0.0.1", () => console.log(`editing at http://localhost:${PORT}`));
