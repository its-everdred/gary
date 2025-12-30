#!/usr/bin/env node

import { execSync } from 'child_process';

console.log('🔄 Ensuring migrations table exists...\n');

// Create the migrations table if it doesn't exist
// This is safe and won't affect any data
const createTableSQL = `
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = '_prisma_migrations') THEN
    CREATE TABLE "_prisma_migrations" (
      "id" VARCHAR(36) NOT NULL,
      "checksum" VARCHAR(64) NOT NULL,
      "finished_at" TIMESTAMPTZ,
      "migration_name" VARCHAR(255) NOT NULL,
      "logs" TEXT,
      "rolled_back_at" TIMESTAMPTZ,
      "started_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
      "applied_steps_count" INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY ("id")
    );
    
    -- Mark existing migrations as applied
    INSERT INTO "_prisma_migrations" (id, checksum, migration_name, finished_at, applied_steps_count)
    VALUES 
      ('init', 'dummy', '20240102_rename_warn_to_flag', now(), 1),
      ('rename', 'dummy', '20241218215406_add_cleanup_period', now(), 1),
      ('cleanup', 'dummy', '20251229205407_rename_certify_to_cleanup', now(), 1);
  END IF;
END $$;
`;

try {
  // Use Prisma's db execute to run raw SQL
  execSync(`npx prisma db execute --stdin`, {
    input: createTableSQL,
    stdio: ['pipe', 'inherit', 'inherit']
  });
  console.log('✅ Migrations table ready');
} catch (error) {
  console.log('⚠️  Could not create migrations table, continuing anyway');
}

process.exit(0);