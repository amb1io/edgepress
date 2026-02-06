-- Convert user.role from text to integer: 0=administrador, 1=editor, 2=autor, 3=leitor
ALTER TABLE "user" ADD COLUMN "role_int" integer DEFAULT 3;
UPDATE "user" SET "role_int" = CASE "role"
  WHEN 'administrador' THEN 0
  WHEN 'editor' THEN 1
  WHEN 'autor' THEN 2
  WHEN 'leitor' THEN 3
  ELSE 3
END;
ALTER TABLE "user" DROP COLUMN "role";
ALTER TABLE "user" RENAME COLUMN "role_int" TO "role";
