// Apply platform keys from the git-ignored api-key/ folder.
//   node tools/apply-keys.mjs           → merge keys into .dev.vars (local dev)
//   node tools/apply-keys.mjs --push    → ALSO set them on Cloudflare Pages (prod)
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

const ROOT = process.cwd();
const KEY_DIR = path.join(ROOT, 'api-key');
const DEV_VARS = path.join(ROOT, '.dev.vars');
const PROJECT = 'bilisops-chat';
const push = process.argv.includes('--push');

if (!fs.existsSync(KEY_DIR)) {
  console.error('No api-key/ folder found. Create it and add your *.env key files.');
  process.exit(1);
}

// Collect KEY=VALUE pairs from every api-key/*.env (blank values ignored).
const vars = {};
for (const f of fs.readdirSync(KEY_DIR)) {
  if (!f.endsWith('.env')) continue;
  for (const line of fs.readFileSync(path.join(KEY_DIR, f), 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (m && m[2].trim()) vars[m[1]] = m[2].trim();
  }
}
const names = Object.keys(vars);
if (!names.length) {
  console.log('No keys filled in yet under api-key/*.env — paste your values and re-run.');
  process.exit(0);
}

// Merge into .dev.vars, preserving existing lines (Supabase/Anthropic etc.).
let dev = fs.existsSync(DEV_VARS) ? fs.readFileSync(DEV_VARS, 'utf8') : '';
for (const [k, v] of Object.entries(vars)) {
  const re = new RegExp(`^${k}=.*$`, 'm');
  if (re.test(dev)) dev = dev.replace(re, `${k}=${v}`);
  else dev += (dev === '' || dev.endsWith('\n') ? '' : '\n') + `${k}=${v}\n`;
}
fs.writeFileSync(DEV_VARS, dev);
console.log(`✓ Wrote ${names.length} key(s) into .dev.vars: ${names.join(', ')}\n`);

// Report which platforms are now fully configured (both keys present).
const groups = {
  Shopee: ['SHOPEE_PARTNER_ID', 'SHOPEE_PARTNER_KEY'],
  Lazada: ['LAZADA_APP_KEY', 'LAZADA_APP_SECRET'],
  TikTok: ['TIKTOK_APP_KEY', 'TIKTOK_APP_SECRET'],
  Meta:   ['META_APP_SECRET'],
  'DeepSeek AI': ['DEEPSEEK_API_KEY'],
};
for (const [name, need] of Object.entries(groups)) {
  console.log(`  ${need.every((n) => vars[n]) ? '🟢 live' : '⚪ demo'}  ${name}`);
}

if (push) {
  console.log('\nPushing to Cloudflare Pages (production)…');
  let ok = 0;
  for (const [k, v] of Object.entries(vars)) {
    try {
      execSync(`npx wrangler pages secret put ${k} --project-name ${PROJECT}`, {
        input: v + '\n', stdio: ['pipe', 'inherit', 'inherit'],
      });
      console.log(`  ✓ set ${k}`);
      ok++;
    } catch (e) {
      console.error(`  ✗ failed ${k}: ${e.message}`);
    }
  }
  if (ok) {
    console.log('\nRedeploying so the live site picks up the new keys…');
    try {
      execSync('npm run pages:deploy', { stdio: 'inherit' });
      console.log('\n✅ Done. Keys are live in production.');
    } catch (e) {
      console.error('\nSecrets set, but the redeploy failed — run "npm run pages:deploy" manually.');
    }
  }
} else {
  console.log('\nLocal .dev.vars updated. For PRODUCTION, either:');
  console.log('  • node tools/apply-keys.mjs --push        (sets them on Cloudflare via wrangler)');
  console.log('  • or paste each into Cloudflare → Pages → bilisops-chat → Settings → Variables and secrets, then redeploy.');
}
