-- Contract.wage was being entered as a monthly take-home figure that HR had
-- to pre-compute by hand — exactly the derivation the payroll engine exists
-- to do. Renamed to reflect what's actually asked for now: annual CTC. Values
-- are not transformed here — the /12 monthly conversion happens in the rule
-- engine at compute time (see ruleEngine.js), not by rewriting stored numbers.
ALTER TABLE "contracts" RENAME COLUMN "wage" TO "ctc";
