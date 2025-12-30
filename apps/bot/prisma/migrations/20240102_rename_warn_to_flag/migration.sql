-- RenameTable - Only rename if Warn table exists (for backward compatibility)
DO $$
BEGIN
    IF EXISTS (SELECT FROM information_schema.tables 
               WHERE table_schema = 'public' 
               AND table_name = 'Warn') THEN
        ALTER TABLE "Warn" RENAME TO "Flag";
    END IF;
END $$;