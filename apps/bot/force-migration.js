#!/usr/bin/env node

import { execSync } from 'child_process';
import { rmSync, existsSync } from 'fs';

console.log('🔧 Clearing Prisma cache and forcing schema sync...\n');

try {
  // Clear Prisma cache
  console.log('Clearing Prisma client cache...');
  if (existsSync('./node_modules/.prisma')) {
    rmSync('./node_modules/.prisma', { recursive: true, force: true });
    console.log('Cleared .prisma cache directory');
  }
  
  if (existsSync('./node_modules/@prisma/client')) {
    rmSync('./node_modules/@prisma/client', { recursive: true, force: true });
    console.log('Cleared @prisma/client directory');
  }
  
  // Force reinstall prisma client
  console.log('Reinstalling Prisma client...');
  execSync('npm install @prisma/client', { stdio: 'inherit' });
  
  console.log('✅ Prisma cache cleared and client reinstalled');
} catch (error) {
  console.error('❌ Failed to clear cache:', error.message);
  process.exit(1);
}