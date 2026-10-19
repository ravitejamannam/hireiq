# LinkedIn blind test

This is the protocol only. Do not run it until a person has exported real comparison data. The script refuses to invent results.

## What a person does

1. Pick 20 roles that HireIQ has already ranked, with the same job description the product used.
2. For each role, export the same candidate pool to a folder of resume files. Do not include HireIQ scores in the file names.
3. Run `scripts/anonymise-and-shuffle.mjs` on that folder. It strips emails, phone numbers, and URLs, shuffles the files, and writes a key under `.data/` that is not committed.
4. A reviewer who has not seen HireIQ's order ranks the anonymised files 1 (best) to N in `eval/linkedin-blind-ranks.csv` (`job_id`, `anon_id`, `reviewer_rank`).
5. Only after that file is filled, score it with `eval/score-ranking.ts` style overlap: top-5 overlap, precision@5, and Spearman against HireIQ's order. The key file joins anon ids back to candidates. The reviewer does not open the key.

## What counts as a result

A number from this test is real only when the reviewer ranks were written before the key was opened. A dry run, a shuffle with no reviewer, or ranks copied from HireIQ are not a result.

## What this does not do

It does not call LinkedIn. It does not download profiles. It does not score the 50 unverified fresh-heldout drafts.
