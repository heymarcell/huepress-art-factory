const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const SOURCE_DIR = '/Users/heymarcell/DEV/huepress/colorings_svg_batch600';
const DB_PATH = path.join(__dirname, '../../dev-data/huepress.db');
const DEST_BASE = '/Users/heymarcell/Library/Application Support/HuePress Art Factory/assets/svg';
const SQL_OUTPUT_PATH = path.join(__dirname, 'import_updates.sql');

// Ensure dest dir exists
if (!fs.existsSync(DEST_BASE)) {
  fs.mkdirSync(DEST_BASE, { recursive: true });
}

console.log('Using database at:', DB_PATH);

// Get ideas using sqlite3 CLI to avoid ABI mismatch
// Use -json output for easy parsing
// Note: We need to escape the DB path if it has spaces, but it doesn't here.
const cmd = `sqlite3 "${DB_PATH}" "SELECT id, title FROM ideas" -json`;
let ideas = [];
try {
  const stdout = execSync(cmd, { encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024 });
  ideas = JSON.parse(stdout);
} catch (err) {
  console.error('Failed to dump ideas from DB:', err);
  process.exit(1);
}

const ideaMap = new Map(); // suffix -> idea
ideas.forEach(idea => {
  const suffix = idea.id.slice(-6);
  ideaMap.set(suffix, idea);
});

console.log(`Loaded ${ideas.length} ideas from DB via CLI.`);

const files = fs.readdirSync(SOURCE_DIR).filter(f => f.endsWith('.svg'));
console.log(`Found ${files.length} SVGs in source directory.`);

let matched = 0;
let skipped = 0;
let errors = 0;
const sqlStatements = [];

// Prepare SQL file header
sqlStatements.push('BEGIN TRANSACTION;');

for (const file of files) {
  try {
    const namePart = path.basename(file, '.svg');
    const parts = namePart.split('_');
    const suffix = parts.length > 1 ? parts[parts.length - 1] : null;

    if (!suffix || suffix.length < 6) {
      console.warn(`Skipping invalid format: ${file}`);
      skipped++;
      continue;
    }

    const cleanSuffix = suffix.slice(0, 6);
    const idea = ideaMap.get(cleanSuffix);

    if (!idea) {
      console.warn(`No match for suffix: ${cleanSuffix} (File: ${file})`);
      skipped++;
      continue;
    }

    // Found match
    const sourcePath = path.join(SOURCE_DIR, file);
    const destPath = path.join(DEST_BASE, `${idea.id}.svg`);
    const jobId = `manual-import-${cleanSuffix}`;

    // Copy file
    fs.copyFileSync(sourcePath, destPath);

    // Generate SQL
    sqlStatements.push(`INSERT OR REPLACE INTO vectorize_results (idea_id, svg_path, job_id, created_at) VALUES ('${idea.id}', '${destPath}', '${jobId}', datetime('now'));`);
    sqlStatements.push(`UPDATE ideas SET status = 'Vectorized' WHERE id = '${idea.id}';`);
    sqlStatements.push(`INSERT OR REPLACE INTO vectorize_jobs (job_id, idea_id, status, updated_at) VALUES ('${jobId}', '${idea.id}', 'completed', datetime('now'));`);

    matched++;
    if (matched % 50 === 0) console.log(`Processed ${matched} files...`);

  } catch (err) {
    console.error(`Error processing ${file}:`, err);
    errors++;
  }
}

sqlStatements.push('COMMIT;');

// Write SQL file
fs.writeFileSync(SQL_OUTPUT_PATH, sqlStatements.join('\n'), 'utf-8');

console.log('File copying complete.');
console.log(`Matched: ${matched}`);
console.log(`Skipped: ${skipped}`);
console.log(`Errors: ${errors}`);
console.log(`SQL statements written to: ${SQL_OUTPUT_PATH}`);

// Execute SQL
try {
  console.log('Executing SQL updates...');
  execSync(`sqlite3 "${DB_PATH}" < "${SQL_OUTPUT_PATH}"`);
  console.log('Database updated successfully.');
} catch (err) {
  console.error('Failed to execute SQL script:', err);
}

