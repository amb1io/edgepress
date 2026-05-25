-- Prefixo edp_ nas tabelas de aplicação.
-- Instalações novas (0000–0019) já usam edp_*; renomeações legadas correm em
-- scripts/apply-edp-prefix-if-needed.ts antes de db:migrate:*.
SELECT 1;
