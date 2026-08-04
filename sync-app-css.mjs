// Diffs the app.css against the prior one. Usage: node sync-app-css.mjs --new <file> [--old <file>].

import { readFileSync, writeFileSync, existsSync, readdirSync } from "fs";
import { join, basename } from "path";

const ROOT = process.cwd();
const APP_CSS_DIR = join(ROOT, "src/app-css");
const CSS_DIR = join(ROOT, "src/css");
const SCSS_DIR = join(ROOT, "src/scss");
const NEW_SELECTORS_FILE = join(APP_CSS_DIR, "_new-selectors.css");
const REPORT_FILE = join(APP_CSS_DIR, "scss-sync-report.md");

const VERSION_RE = /^app-(\d+)[.-](\d+)[.-](\d+)\.css$/;

function parseVersion(filename) {
  const match = VERSION_RE.exec(basename(filename));
  if (!match) return null;
  return match.slice(1, 4).map(Number);
}

function compareVersions(a, b) {
  for (let i = 0; i < 3; i++) {
    if (a[i] !== b[i]) return a[i] - b[i];
  }
  return 0;
}

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--new") args.new = argv[++i];
    else if (argv[i] === "--old") args.old = argv[++i];
  }
  return args;
}

function resolveOldFile(newFile) {
  const candidates = readdirSync(APP_CSS_DIR)
    .filter((f) => f !== basename(newFile) && VERSION_RE.test(f))
    .map((f) => ({ file: join(APP_CSS_DIR, f), version: parseVersion(f) }))
    .sort((a, b) => compareVersions(b.version, a.version));
  return candidates.length ? candidates[0].file : null;
}

// --- CSS block tokenizer: top-level blocks only, @media/@supports/@keyframes etc. captured as one opaque block rather than recursed into ---

function skipString(text, i) {
  const quote = text[i];
  i++;
  while (i < text.length) {
    if (text[i] === "\\") { i += 2; continue; }
    if (text[i] === quote) return i + 1;
    i++;
  }
  return i;
}

function skipComment(text, i) {
  const end = text.indexOf("*/", i + 2);
  return end === -1 ? text.length : end + 2;
}

function splitTopLevelCommas(s) {
  const parts = [];
  let depth = 0;
  let cur = "";
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === "(") depth++;
    else if (ch === ")") depth--;
    if (ch === "," && depth === 0) {
      parts.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  parts.push(cur);
  return parts;
}

function normalizeKey(prelude) {
  return splitTopLevelCommas(prelude)
    .map((s) => s.trim().replace(/\s+/g, " "))
    .sort()
    .join(",");
}

function normalizeBody(body) {
  if (body == null) return null;
  return body.replace(/\s+/g, " ").trim();
}

/** Returns an array of { key, prelude, body, rawBlock, start, end } in file order. */
function parseCss(text) {
  const rules = [];
  let i = 0;
  const n = text.length;

  while (i < n) {
    while (i < n) {
      if (/\s/.test(text[i])) { i++; continue; }
      if (text[i] === "/" && text[i + 1] === "*") { i = skipComment(text, i); continue; }
      break;
    }
    if (i >= n) break;

    const preludeStart = i;
    while (i < n) {
      const ch = text[i];
      if (ch === "/" && text[i + 1] === "*") { i = skipComment(text, i); continue; }
      if (ch === '"' || ch === "'") { i = skipString(text, i); continue; }
      if (ch === "{" || ch === ";") break;
      i++;
    }
    if (i >= n) break;

    if (text[i] === ";") {
      i++;
      const rawBlock = text.slice(preludeStart, i);
      rules.push({
        key: normalizeKey(text.slice(preludeStart, i - 1).trim()),
        prelude: text.slice(preludeStart, i - 1).trim(),
        body: null,
        rawBlock,
        start: preludeStart,
        end: i,
      });
      continue;
    }

    // text[i] === "{"
    const prelude = text.slice(preludeStart, i).trim();
    i++; // consume '{'
    let depth = 1;
    const bodyStart = i;
    while (i < n && depth > 0) {
      const ch = text[i];
      if (ch === "/" && text[i + 1] === "*") { i = skipComment(text, i); continue; }
      if (ch === '"' || ch === "'") { i = skipString(text, i); continue; }
      if (ch === "{") depth++;
      else if (ch === "}") depth--;
      i++;
    }
    const bodyEnd = i - 1;
    const body = text.slice(bodyStart, bodyEnd);
    const end = i;
    rules.push({
      key: normalizeKey(prelude),
      prelude,
      body,
      rawBlock: text.slice(preludeStart, end),
      start: preludeStart,
      end,
    });
  }

  return rules;
}

function groupByKey(rules) {
  const map = new Map();
  for (const rule of rules) {
    if (!map.has(rule.key)) map.set(rule.key, []);
    map.get(rule.key).push(rule);
  }
  return map;
}

// --- diff old vs new baseline ------------------------------------------

function diffRules(oldRules, newRules) {
  const oldMap = groupByKey(oldRules);
  const newMap = groupByKey(newRules);
  const allKeys = new Set([...oldMap.keys(), ...newMap.keys()]);

  const changed = []; // { key, oldRule, newRule }
  const removed = []; // { key, oldRule }
  const added = []; // { key, newRule }

  for (const key of allKeys) {
    const oldList = oldMap.get(key) || [];
    const newList = newMap.get(key) || [];
    const pairCount = Math.min(oldList.length, newList.length);

    for (let i = 0; i < pairCount; i++) {
      if (normalizeBody(oldList[i].body) !== normalizeBody(newList[i].body)) {
        changed.push({ key, oldRule: oldList[i], newRule: newList[i] });
      }
    }
    for (let i = pairCount; i < oldList.length; i++) {
      removed.push({ key, oldRule: oldList[i] });
    }
    for (let i = pairCount; i < newList.length; i++) {
      // Treated as "added" whether the key is brand new or just has more occurrences than before — neither has an existing src/css home.
      added.push({ key, newRule: newList[i] });
    }
  }

  return { changed, removed, added };
}

// --- apply changed/removed to src/css/*.css -----------------------------

function loadCssFiles() {
  const files = readdirSync(CSS_DIR).filter((f) => f.endsWith(".css"));
  const parsed = new Map(); // filename -> { text, rules }
  for (const file of files) {
    const path = join(CSS_DIR, file);
    const text = readFileSync(path, "utf8");
    parsed.set(file, { text, rules: parseCss(text) });
  }
  return parsed;
}

function buildFileIndex(cssFiles) {
  const index = new Map(); // key -> [{ file, rule }]
  for (const [file, { rules }] of cssFiles) {
    for (const rule of rules) {
      if (!index.has(rule.key)) index.set(rule.key, []);
      index.get(rule.key).push({ file, rule });
    }
  }
  return index;
}

function cssFileForScss(cssFile) {
  return `_${cssFile.replace(/\.css$/, ".scss")}`;
}

function applyEdits(cssFiles, edits) {
  // edits: Map<file, Array<{ start, end, replacement }>>
  for (const [file, fileEdits] of edits) {
    const entry = cssFiles.get(file);
    if (!entry) continue;
    let text = entry.text;
    const sorted = [...fileEdits].sort((a, b) => b.start - a.start);
    for (const { start, end, replacement } of sorted) {
      text = text.slice(0, start) + replacement + text.slice(end);
    }
    text = text.replace(/\n{3,}/g, "\n\n");
    entry.text = text;
  }
}

function makeDiffSnippet(oldBody, newBody) {
  const lines = [];
  if (oldBody != null) lines.push(`- ${oldBody.trim().replace(/\n/g, "\n- ")}`);
  if (newBody != null) lines.push(`+ ${newBody.trim().replace(/\n/g, "\n+ ")}`);
  return lines.join("\n");
}

function run() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.new) {
    console.error("Usage: node sync-app-css.mjs --new src/app-css/app-x.y.z.css [--old src/app-css/app-x.y.z.css]");
    process.exit(1);
  }

  const newFile = args.new;
  const oldFile = args.old || resolveOldFile(newFile);

  if (!oldFile) {
    console.log(`No prior app-*.css baseline found to diff ${basename(newFile)} against. Nothing to sync — this file is now the baseline for future runs.`);
    return;
  }

  const newVersion = parseVersion(newFile);
  const oldVersion = parseVersion(oldFile);
  if (!newVersion) {
    console.error(`Could not parse a version from ${basename(newFile)} (expected app-x.y.z.css)`);
    process.exit(1);
  }

  console.log(`Diffing ${basename(oldFile)} -> ${basename(newFile)}`);

  const oldRules = parseCss(readFileSync(oldFile, "utf8"));
  const newRules = parseCss(readFileSync(newFile, "utf8"));
  const { changed, removed, added } = diffRules(oldRules, newRules);

  const cssFiles = loadCssFiles();
  const fileIndex = buildFileIndex(cssFiles);
  const edits = new Map(); // file -> [{start,end,replacement}]
  const scssTodo = []; // { file, scssFile, selector, oldBody, newBody }
  const notFoundLocally = [];

  for (const { key, oldRule, newRule } of changed) {
    const occurrences = fileIndex.get(key);
    if (!occurrences || !occurrences.length) {
      notFoundLocally.push({ type: "changed", key, oldRule, newRule });
      continue;
    }
    const { file, rule: localRule } = occurrences[0];
    if (!edits.has(file)) edits.set(file, []);
    edits.get(file).push({ start: localRule.start, end: localRule.end, replacement: newRule.rawBlock });
    scssTodo.push({
      file,
      scssFile: cssFileForScss(file),
      selector: newRule.prelude,
      oldBody: oldRule.body,
      newBody: newRule.body,
    });
  }

  for (const { key, oldRule } of removed) {
    const occurrences = fileIndex.get(key);
    if (!occurrences || !occurrences.length) {
      notFoundLocally.push({ type: "removed", key, oldRule });
      continue;
    }
    const { file, rule: localRule } = occurrences[0];
    if (!edits.has(file)) edits.set(file, []);
    edits.get(file).push({ start: localRule.start, end: localRule.end, replacement: "" });
    scssTodo.push({
      file,
      scssFile: cssFileForScss(file),
      selector: oldRule.prelude,
      oldBody: oldRule.body,
      newBody: null,
      removed: true,
    });
  }

  applyEdits(cssFiles, edits);
  for (const [file, { text }] of cssFiles) {
    writeFileSync(join(CSS_DIR, file), text);
  }

  const versionLabel = `app-${newVersion.join(".")} (vs app-${oldVersion.join(".")})`;

  if (added.length) {
    const header = `/* New in ${versionLabel} — not yet placed in any src/css/*.css file. Move each\n * block below into the appropriate topic file, then add the matching\n * nested rule to that file's src/scss/_*.scss partner by hand. */\n\n`;
    const block = added.map((a) => a.newRule.rawBlock).join("\n\n");
    const existing = existsSync(NEW_SELECTORS_FILE) ? readFileSync(NEW_SELECTORS_FILE, "utf8") + "\n\n" : "";
    writeFileSync(NEW_SELECTORS_FILE, existing + header + block + "\n");
  }

  const reportSections = [];
  if (scssTodo.length) {
    const byFile = new Map();
    for (const item of scssTodo) {
      if (!byFile.has(item.scssFile)) byFile.set(item.scssFile, []);
      byFile.get(item.scssFile).push(item);
    }
    for (const [scssFile, items] of byFile) {
      const entries = items
        .map(
          (item) => `- [ ] \`${item.selector}\` (${item.removed ? "removed" : "changed"} in \`src/css/${item.file}\`)\n\n  \`\`\`diff\n${makeDiffSnippet(item.oldBody, item.newBody)}\n  \`\`\``
        )
        .join("\n\n");
      reportSections.push(`### \`src/scss/${scssFile}\`\n\n${entries}`);
    }
  }
  if (added.length) {
    reportSections.push(
      `### New selectors\n\n- [ ] ${added.length} new selector(s) staged in \`src/app-css/_new-selectors.css\` — place them in a topic file under \`src/css/\`, then add the matching nested rule to the corresponding \`src/scss/_*.scss\` partial.`
    );
  }

  if (reportSections.length) {
    const heading = `## ${versionLabel}\n\nPort each item below into the matching nested SCSS partial, then delete its line.\n\n`;
    const existing = existsSync(REPORT_FILE)
      ? readFileSync(REPORT_FILE, "utf8")
      : "# SCSS nesting sync checklist\n";
    writeFileSync(REPORT_FILE, existing + "\n" + heading + reportSections.join("\n\n") + "\n");
  }

  console.log(`Changed: ${changed.length}, removed: ${removed.length}, added: ${added.length}`);
  if (notFoundLocally.length) {
    console.log(`${notFoundLocally.length} rule(s) from the old baseline were not found in any src/css/*.css file (already removed/customized by hand) — skipped:`);
    for (const item of notFoundLocally) {
      console.log(`  - [${item.type}] ${item.key.slice(0, 80)}`);
    }
  }

  writeFileSync(
    join(ROOT, "sync-summary.json"),
    JSON.stringify(
      {
        oldVersion: oldVersion.join("."),
        newVersion: newVersion.join("."),
        changed: changed.length,
        removed: removed.length,
        added: added.length,
        notFoundLocally: notFoundLocally.length,
        scssReportUpdated: reportSections.length > 0,
      },
      null,
      2
    )
  );
}

run();
