// End-to-end check of the page editor: with `node serve.mjs` running, run `node test-editor.mjs`.
// Drives headless Edge over CDP: Edit page → change the headline → Save → checks index.html on disk, then restores it.
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const file = new URL("./index.html", import.meta.url);
const EDGE = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const PORT = 9333;
const MARK = "EDITOR-TEST-" + Date.now();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const before = fs.readFileSync(file, "utf8");
const edge = spawn(EDGE, ["--headless=new", "--disable-gpu", `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${fs.mkdtempSync(path.join(os.tmpdir(), "edge-cdp-"))}`, "about:blank"], { stdio: "ignore" });

let ws, id = 0;
const pending = new Map(), errors = [];
const send = (method, params = {}) => new Promise((res) => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
const run = async (expr) => (await send("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true })).result?.result?.value;
const check = (ok, what) => { console.log((ok ? "ok   " : "FAIL ") + what); if (!ok) process.exitCode = 1; };

try {
  let targets;
  for (let i = 0; i < 40 && !targets; i++) { try { targets = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json(); } catch { await sleep(250); } }
  ws = new WebSocket(targets.find((t) => t.type === "page").webSocketDebuggerUrl);
  await new Promise((r) => (ws.onopen = r));
  ws.onmessage = (m) => {
    const d = JSON.parse(m.data);
    if (d.id && pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id); }
    if (d.method === "Runtime.exceptionThrown") errors.push(d.params.exceptionDetails.exception?.description);
  };
  await send("Runtime.enable");
  await send("Page.navigate", { url: "http://localhost:5051/" });
  await sleep(2500);

  check(await run(`document.documentElement.getAttribute("data-page") === "top" &&
    !document.getElementById("top").hidden &&
    document.querySelector("h1").textContent.trim() === "Company focused hands-on AI tool workshops." &&
    document.querySelectorAll("#workshops .ws").length === 3 &&
    !document.querySelector("header").hidden &&
    !document.querySelector("footer").hidden`), "the workshops page is the landing, with its three workshops");
  check(await run(`Array.from(document.querySelectorAll(".trip img, #workshops img")).every(function (img) {
    return img.complete && img.naturalWidth > 0;
  })`), "workshop photos load");
  check(await run(`Array.from(document.querySelectorAll("nav.left a"), function (a) { return a.textContent.trim(); }).join() === "Workshops,About" &&
    document.querySelector(".head .wordmark").textContent.trim() === "blackbox" &&
    document.querySelectorAll("main").length === 2`), "blackbox logo, only Workshops and About");
  await run(`location.hash = "#/about"`);
  await sleep(150);
  check(await run(`document.documentElement.getAttribute("data-page") === "about-page" &&
    !document.getElementById("about-page").hidden`), "About opens as its own page");
  await run(`location.hash = "#/"`);
  await sleep(150);
  await send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  check(await run(`document.documentElement.clientWidth === document.documentElement.scrollWidth`), "the landing fits a phone width");
  await send("Emulation.clearDeviceMetricsOverride");

  check(await run(`!!document.querySelector(".az-pill")`), "Edit page button is shown");
  await run(`document.querySelector(".az-pill").click()`);
  check(await run(`document.querySelector("h1").getAttribute("contenteditable") === "true"`), "landing headline is editable");
  // type into the headline the way a person would: focus, select its text, insert new text
  await run(`(function(){ var s=document.querySelector("h1"); s.focus();
    var r=document.createRange(); r.selectNodeContents(s); var sel=getSelection(); sel.removeAllRanges(); sel.addRange(r);
    document.execCommand("insertText", false, "${MARK}"); })()`);
  await run(`document.querySelector('.az-bar [data-act="save"]').click()`);
  await sleep(2500);

  const after = fs.readFileSync(file, "utf8");
  check(errors.length === 0, "no script errors" + (errors.length ? ": " + errors.join(" | ") : ""));
  check(after.includes(MARK), "the edit reached index.html");
  check(after.includes("In-person AI tool workshops for companies"), "the workshops strip survives the save");
  check(after.startsWith("<!doctype html>"), "saved file starts with the doctype");
  const markup = after.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, ""); // the editor's own code may name these
  const leftover = markup.match(/az-version|contenteditable|spellcheck|az-edit-ui|az-editing/);
  check(!leftover, "no editor leftovers in the saved markup" + (leftover ? ": " + leftover[0] : ""));
  check(after.includes('id="msgbox"') && after.includes('<script id="az-edit">'), "page and editor survive the save");
} finally {
  fs.writeFileSync(file, before); // put the page back exactly as it was
  try { ws?.close(); } catch {}
  edge.kill();
}
