#!/usr/bin/env node

// TEMPORARY: Delete this file after first successful deployment
// Then change package.json start script back to: "start": "node dist/index.js"
// 
// This script runs baseline if needed, then starts the app

import { execSync } from 'child_process';

console.log('🚂 Railway deployment starting...\n');

try {
  // Try to run baseline - it will fail if already applied
  console.log('📊 Checking if baseline is needed...');
  try {
    execSync('npm run baseline', { stdio: 'inherit' });
    console.log('✅ Baseline complete\n');
  } catch (error) {
    console.log('ℹ️  Baseline already applied or not needed\n');
  }
  
  // Start the actual application
  console.log('🤖 Starting bot...');
  execSync('node dist/index.js', { stdio: 'inherit' });
  
} catch (error) {
  console.error('❌ Failed to start:', error.message);
  process.exit(1);
}