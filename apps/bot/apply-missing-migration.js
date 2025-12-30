#!/usr/bin/env node

import { execSync } from 'child_process';

console.log('🔧 Applying missing cleanupStart migration...\n');

const migrationSQL = `
-- Check database schema
SELECT 'cleanupStart column exists' as status 
FROM information_schema.columns 
WHERE table_name = 'Nominee' AND column_name = 'cleanupStart';
`;

try {
  console.log('Executing migration SQL...');
  execSync(`npx prisma db execute --url="$DATABASE_URL" --stdin`, {
    input: migrationSQL,
    stdio: ['pipe', 'inherit', 'inherit']
  });
  
  console.log('✅ Migration applied successfully');
} catch (error) {
  console.error('❌ Failed to apply migration:', error.message);
  process.exit(1);
}