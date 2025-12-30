#!/usr/bin/env node

// One-time script to baseline production database
// Run this ONCE when deploying to a new production environment with existing data

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

console.log('🔧 Baselining production database...\n');

try {
  // Get all migration directories
  const migrationsDir = path.join(process.cwd(), 'prisma', 'migrations');
  
  if (!fs.existsSync(migrationsDir)) {
    console.error('❌ No migrations directory found');
    process.exit(1);
  }
  
  const migrations = fs.readdirSync(migrationsDir)
    .filter(dir => /^\d{14}_/.test(dir))
    .sort();
  
  console.log(`Found ${migrations.length} migrations to baseline:\n`);
  
  // Mark each migration as applied
  for (const migration of migrations) {
    console.log(`  ↳ Marking as applied: ${migration}`);
    execSync(`npx prisma migrate resolve --applied "${migration}"`, { stdio: 'inherit' });
  }
  
  console.log('\n✅ All migrations marked as applied!');
  console.log('\nYou can now run "npm start" normally.');
  
} catch (error) {
  console.error('❌ Baseline failed:', error.message);
  process.exit(1);
}