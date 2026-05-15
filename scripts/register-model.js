#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');

async function main() {
  const runDirArg = process.argv[2];
  if (!runDirArg) {
    console.error('用法: node scripts/register-model.js <run_dir> [api_base] [name] [version]');
    process.exit(1);
  }

  const runDir = path.resolve(runDirArg);
  const apiBase = (process.argv[3] || process.env.API_BASE || 'http://127.0.0.1:4000/api').replace(/\/$/, '');
  const runTag = path.basename(runDir);
  const name = process.argv[4] || `LocalModel-${runTag}`;
  const version = process.argv[5] || `local-${runTag}`;

  for (const filename of ['model.pt', 'labels.json']) {
    const filePath = path.join(runDir, filename);
    if (!fs.existsSync(filePath)) {
      console.error(`模型产物不完整，缺少: ${filePath}`);
      process.exit(1);
    }
  }

  let metrics = null;
  const metricsPath = path.join(runDir, 'metrics.json');
  if (fs.existsSync(metricsPath)) {
    metrics = JSON.parse(fs.readFileSync(metricsPath, 'utf8'));
  }

  const response = await fetch(`${apiBase}/models`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name,
      version,
      framework: 'pytorch',
      artifactUrl: runDir,
      metrics,
      isActive: true,
    }),
  });

  const text = await response.text();
  if (!response.ok) {
    console.error(`登记失败: HTTP ${response.status}`);
    console.error(text);
    process.exit(1);
  }

  console.log(text);
}

main().catch((error) => {
  console.error(`登记失败: ${error.message}`);
  process.exit(1);
});
