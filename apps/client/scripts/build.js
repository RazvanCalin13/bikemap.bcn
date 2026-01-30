const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const proxyDir = path.join(__dirname, '../app/api/proxy');
const backupDir = path.join(__dirname, '../app/api/_proxy_backup');

try {
    // 1. Check if proxy exists and move it to backup to avoid Next.js static export error
    if (fs.existsSync(proxyDir)) {
        console.log('[Build] Backing up /api/proxy for static build...');
        if (fs.existsSync(backupDir)) fs.rmSync(backupDir, { recursive: true, force: true });
        fs.renameSync(proxyDir, backupDir);
    }

    // 2. Run the actual Next.js build
    console.log('[Build] Starting Next.js build...');
    execSync('next build --webpack', { stdio: 'inherit' });

} finally {
    // 3. Always restore the proxy for local development
    if (fs.existsSync(backupDir)) {
        console.log('[Build] Restoring /api/proxy...');
        if (fs.existsSync(proxyDir)) fs.rmSync(proxyDir, { recursive: true, force: true });
        fs.renameSync(backupDir, proxyDir);
    }
}
