-- Rename certifyStart column to cleanupStart
ALTER TABLE "Nominee" RENAME COLUMN "certifyStart" TO "cleanupStart";

-- Update enum value from CERTIFY to CLEANUP
ALTER TYPE "NomineeState" RENAME VALUE 'CERTIFY' TO 'CLEANUP';