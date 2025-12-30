#!/usr/bin/env node

import { execSync } from 'child_process';

console.log('🚀 Starting application with database check...\n');

try {
  // Try to run migrations
  console.log('📊 Applying database migrations...');
  execSync('npx prisma migrate deploy', { stdio: 'inherit' });
  console.log('✅ Migrations applied successfully\n');
} catch (error) {
  if (error.toString().includes('P3005')) {
    // Database exists but needs baseline
    console.log('⚠️  Database needs baseline - attempting to resolve...\n');
    
    try {
      // Get migration list
      const migrations = execSync('ls prisma/migrations', { encoding: 'utf-8' })
        .split('\n')
        .filter(m => m.match(/^\d{14}_/))
        .sort();
      
      console.log(`Found ${migrations.length} migrations to mark as resolved\n`);
      
      // Mark each as resolved
      for (const migration of migrations) {
        console.log(`  ↳ Resolving ${migration}`);
        try {
          execSync(`npx prisma migrate resolve --applied "${migration}"`, { stdio: 'pipe' });
        } catch (e) {
          // Continue even if some fail
        }
      }
      
      console.log('\n🔄 Retrying migration deploy...');
      try {
        execSync('npx prisma migrate deploy', { stdio: 'inherit' });
        console.log('✅ Migrations applied after baseline\n');
      } catch (retryError) {
        console.log('⚠️  Some migrations may have failed, continuing anyway...\n');
      }
    } catch (baselineError) {
      console.log('⚠️  Baseline failed, continuing anyway...\n');
    }
  } else {
    console.log('⚠️  Migration failed, continuing anyway...\n');
  }
}

// Start the bot
console.log('🤖 Starting bot...');
try {
  require('../dist/index.js');
} catch (error) {
  console.error('❌ Bot failed to start:', error);
  process.exit(1);
}