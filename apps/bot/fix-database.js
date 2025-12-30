#!/usr/bin/env node

import { execSync } from 'child_process';

console.log('🔧 Fixing database schema...\n');

// SQL to add the missing cleanupStart column if it doesn't exist
const addColumnSQL = `
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'Nominee' AND column_name = 'cleanupStart'
  ) THEN
    ALTER TABLE "Nominee" ADD COLUMN "cleanupStart" TIMESTAMPTZ;
    -- Update existing records to have cleanupStart based on voteStart + 5 days
    UPDATE "Nominee" 
    SET "cleanupStart" = "voteStart" + INTERVAL '5 days' 
    WHERE "voteStart" IS NOT NULL AND "cleanupStart" IS NULL;
  END IF;
END $$;
`;

// SQL to rename CERTIFY to CLEANUP in the enum if needed
const updateEnumSQL = `
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_enum 
    WHERE enumlabel = 'CERTIFY' 
    AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'NomineeState')
  ) THEN
    ALTER TYPE "NomineeState" RENAME VALUE 'CERTIFY' TO 'CLEANUP';
  END IF;
END $$;
`;

try {
  console.log('Adding cleanupStart column if missing...');
  execSync(`echo '${addColumnSQL}' | npx prisma db execute --stdin`, {
    stdio: ['pipe', 'inherit', 'inherit']
  });
  
  console.log('Updating NomineeState enum if needed...');
  execSync(`echo '${updateEnumSQL}' | npx prisma db execute --stdin`, {
    stdio: ['pipe', 'inherit', 'inherit']
  });
  
  console.log('✅ Database schema fixed');
} catch (error) {
  console.error('❌ Failed to fix database:', error.message);
  // Continue anyway - let the app try to start
}

process.exit(0);