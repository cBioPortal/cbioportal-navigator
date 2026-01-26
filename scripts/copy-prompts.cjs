#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

function copyDir(src, dest) {
    fs.mkdirSync(dest, { recursive: true });
    const entries = fs.readdirSync(src, { withFileTypes: true });

    for (const entry of entries) {
        const srcPath = path.join(src, entry.name);
        const destPath = path.join(dest, entry.name);

        if (entry.isDirectory()) {
            copyDir(srcPath, destPath);
        } else {
            fs.copyFileSync(srcPath, destPath);
        }
    }
}

const dirs = [
    'domain/router/prompts',
    'domain/studyView/prompts',
    'domain/patientView/prompts',
    'domain/resultsView/prompts',
    'domain/groupComparison/prompts',
    'server/chat/prompts',
];

console.log('Copying prompt files to dist...');

dirs.forEach((dir) => {
    const src = path.join('src', dir);
    const dest = path.join('dist', dir);
    copyDir(src, dest);
    console.log(`  ✓ ${dir}`);
});

console.log('Prompt files copied successfully!');
