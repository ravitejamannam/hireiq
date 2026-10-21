# Parser headline

The parser is frozen on this version. The number to quote is the first score of 30 Indian resumes, labeled by a different model before the parser ran.

## Dataset

30 text PDFs drawn from the local annotated resume corpus (`.data/resumes/annotated-ner/pdf/ResumesPDF`), seed 20261023. A resume was kept only when the text layer had between 120 and 2,500 words and named an Indian degree, city, or `Pvt Ltd`, and did not look Vietnamese. Files live under `.data/resumes/indian-independent/` and are not committed.

This set is not the frozen 38 (Vietnamese and mixed PDFs from Hugging Face, seed 20261021) and not the DataTurks tune split (179 fixtures, seed 20261019).

## How the labels were made

gpt-4o drafted titles, companies, degrees, and skills from the extracted text. The parser uses gpt-4o-mini and was not called during labeling. The sheet was saved with `verified=true` and `draft=gpt-4o` before the first score. Those labels have not been edited to match parser output, and a person has not checked them yet.

## Results

First score, one pass, temperature 0.2. 29 of 30 resumes were accepted. One was rejected because a quote was not in the text.

| Field | Score |
|---|---:|
| Titles | 93.8% (76/81) |
| Companies | 90.4% (75/83) |
| Degrees | 95.7% (44/46) |
| Skill recall, primary plus other mentions | 57.2% (307/537) |
| Skill precision, exact, primary only | 44.4% |
| Skill precision, normalised, primary only | 69.1% |
| Primary skills per resume | 9.2 |
| p50 / p95 | 13.4s / 42.0s |

Skill recall against the primary list alone is about 22% (122 of 537). The 57.2% figure counts a gold skill if it is in the primary list or in other mentions. gpt-4o labeled 537 skills, about 18 per resume. The parser extracted 307 of those somewhere. The rest were never extracted. They were not dropped only by the cap of 15 primary skills.

## Latency after the field-call budget

Each model call has a 30 second budget. If the field call times out, it retries once with a short prompt and only the header, experience, education, and skills text, with a 20 second budget. The skill and role calls use the same 30 second budget and fail open.

On the 179-resume tune set this measured a model-time 95th percentile of 19.1s and zero timeouts.

The Indian 30 were scored once more for latency only. That run's 95th percentile was 23.5s, with zero timeouts. Median was 12.2s. Titles, companies, and degrees on that second draw were 96.3%, 89.2%, and 95.7%. That draw is not a new headline. Temperature 0.2 moves a few fields between runs.

## Backlog

43% of the skills gpt-4o labeled (230 of 537) were never extracted, not merely left out of the primary list. A later pass can chase that recall. It does not block the matcher: ranking uses quoted evidence, and the recruiter still has the full resume.

## Known limits

- The gpt-4o labels are not human-checked. A spot-check of 10 resumes is still open.
- The frozen 38 were labeled in the same session that worked on the parser. They are not an independent grade. They were last scored before this 30 second budget: titles 86.6%, companies 92.4%, degrees 85.7%. They were not scored again.
- Scans are outside the headline. English and Hindi OCR, up to 8 pages, recovered text from 11 of 12 image-only PDFs in that pack. One 15-page scan still hit the 120 second OCR timeout.
- Recruiter ranks in `eval/matcher-human-rank.csv` are still blank.
