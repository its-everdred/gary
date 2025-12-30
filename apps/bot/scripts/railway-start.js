#!/usr/bin/env node

// TEMPORARY: Delete this file after first successful deployment
// Then change package.json start script back to: "start": "node dist/index.js"
// 
// This script runs baseline if needed, then starts the app

import { execSync } from 'child_process';

console.log('🚂 Railway deployment starting...\n');

// Always try to baseline first (it will skip if not needed)
console.log('📊 Checking database status...');
try {
  execSync('npm run baseline', { stdio: 'inherit' });
} catch (error) {
  console.log('⚠️  Baseline step completed with warnings\n');
}

// Start the actual application regardless
console.log('🤖 Starting bot...');
try {
  execSync('node dist/index.js', { stdio: 'inherit' });
} catch (error) {
  console.error('❌ Bot failed to start:', error.message);
  process.exit(1);
}