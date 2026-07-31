import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const manifestPath = 'docs/active-docs.json';
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
if (manifest.schemaVersion !== 1 || !Array.isArray(manifest.documents)) {
  throw new Error(`${manifestPath} has an invalid schema`);
}

const today = new Date();
const failures = [];
const linkPattern = /!?\[[^\]]*]\(([^)\s]+)(?:\s+["'][^"']*["'])?\)/g;

for (const document of manifest.documents) {
  if (
    typeof document.path !== 'string' ||
    typeof document.owner !== 'string' ||
    typeof document.reviewedAt !== 'string' ||
    typeof document.expires !== 'string'
  ) {
    failures.push('manifest entry is missing path/owner/reviewedAt/expires');
    continue;
  }
  if (!existsSync(document.path) || !statSync(document.path).isFile()) {
    failures.push(`${document.path}: active document is missing`);
    continue;
  }
  if (Date.parse(`${document.expires}T00:00:00Z`) < today.getTime()) {
    failures.push(`${document.path}: review expired on ${document.expires}`);
  }

  const markdown = readFileSync(document.path, 'utf8');
  for (const match of markdown.matchAll(linkPattern)) {
    const href = match[1];
    if (href.startsWith('#') || /^[a-z][a-z0-9+.-]*:/i.test(href) || href.includes('{{')) {
      continue;
    }
    const [relativePath] = href.split('#', 1);
    const target = resolve(dirname(document.path), decodeURIComponent(relativePath));
    if (!existsSync(target)) failures.push(`${document.path}: broken relative link ${href}`);
  }
}

if (failures.length > 0) {
  throw new Error(`Active-document policy failed:\n${failures.join('\n')}`);
}
console.log(
  `Active-document policy: ${manifest.documents.length} owned documents, no expired reviews or broken links.`,
);
