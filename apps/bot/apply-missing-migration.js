#!/usr/bin/env node

import { execSync } from 'child_process';

console.log('🔧 Applying missing cleanupStart migration...\n');

const migrationSQL = `
-- Check if cleanupStart column exists, if not add it
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'Nominee' AND column_name = 'cleanupStart'
  ) THEN
    ALTER TABLE "Nominee" ADD COLUMN "cleanupStart" TIMESTAMPTZ;
    RAISE NOTICE 'Added cleanupStart column';
  ELSE
    RAISE NOTICE 'cleanupStart column already exists';
  END IF;
END $$;

-- Check if certifyStart column exists and rename it
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'Nominee' AND column_name = 'certifyStart'
  ) THEN
    ALTER TABLE "Nominee" RENAME COLUMN "certifyStart" TO "cleanupStart";
    RAISE NOTICE 'Renamed certifyStart to cleanupStart';
  END IF;
END $$;

-- Update enum if CERTIFY value exists
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_enum 
    WHERE enumlabel = 'CERTIFY' 
    AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'NomineeState')
  ) THEN
    ALTER TYPE "NomineeState" RENAME VALUE 'CERTIFY' TO 'CLEANUP';
    RAISE NOTICE 'Renamed CERTIFY to CLEANUP in enum';
  END IF;
END $$;
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