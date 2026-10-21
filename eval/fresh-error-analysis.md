# Fresh held-out error analysis

The frozen score is unchanged: titles 79.5% (89/112), companies 92.4% (109/118), degrees 66.7% (28/42), skill recall 59.9% (133/222), exact skill precision 16.2% (133/821), one `INVALID_SHAPE`. Labels were not edited.

The labels were corrected in the same session that drafted them. That is not an independent grade. The categories below mark the misses that look like the label rather than the parser. Those rows stay as they are.

Counts are from a second draw at temperature 0.2, used only to see the misses. It is not a new score. That draw had 20 title misses, 14 degree misses, and 82 skill misses. The scored run had 23 title misses and 89 skill misses, and its one failure was `INVALID_SHAPE`. This draw timed out on `fresh-13` instead, so that resume's titles and degree are counted as a model failure here.

## Titles (20 misses)

| Category | Count | What happened |
|---|---:|---|
| Model failure | 7 | `fresh-13` timed out, so every title was missing. |
| Label debatable | 5 | The gold title is the job being applied for, or the line under the name, and the held jobs are different titles. `fresh-15` Trưởng phòng QA, `fresh-34` Flutter Developer, `fresh-37` Tester, `fresh-43` Software developer, `fresh-47` Nhân viên kinh doanh. |
| Wrong line picked | 3 | `fresh-05` returned the department line IT SOFTWARE and missed the header Developer. `fresh-27` returned the internship sentences and missed Kiến trúc sư quy hoạch. `fresh-45` returned Web Developer and missed Technical Support Engineer. |
| Title split across lines | 2 | `fresh-06` Nhân viên điều phối and Trưởng nhóm are broken over two lines in a table. |
| Near match failed | 2 | `fresh-15` gold "Trợ lý chủ quản QA" against "TRỢ LÝ CHO CHỦ QUẢN QA" (one extra word). `fresh-31` gold "Chuyên viên quản trị hệ thống" against the longer "Chuyên viên - Ban Quản trị máy chủ…". |
| Title inside a sentence | 1 | `fresh-41` "Mobile team lead" is a bullet under Senior iOS Developer. The same resume also repeated the project role once per project. |

`fresh-34` also returned the date "May 2021" as a title.

## Degrees (14 misses)

| Category | Count | What happened |
|---|---:|---|
| Near match failed | 5 | The degree was extracted with extra words or the words in another order. `fresh-08` both degrees ("Cao đẳng Ngành Quản Trị Kinh Doanh Tổng Hợp" contains the gold). `fresh-23` "Finance and Banking, Bachelor's Degree" and "Computer Science, Bachelor's Degree". `fresh-34` "INFOTMATION TECHNOLOGY" is a one-character typo in the PDF text. |
| Wrong line picked | 3 | The school was returned instead of the degree. `fresh-22` Cao Đẳng KTCN LADEC and Đại học Công Nghiệp. `fresh-45` the university name. |
| Label debatable | 2 | `fresh-23` Project Management Professional is a certificate. `fresh-36` Kế toán trưởng is a certificate. The major on that resume was extracted. |
| Model failure | 1 | `fresh-13` timeout. |
| Degree and major split | 1 | `fresh-21` returned "Bachelor's degree" and left Accounting on the next fragment. |
| Missing from the text layer | 1 | `fresh-48` "Cử nhân" is garbled in the text layer ("C: nhân"). |
| Language alias | 1 | `fresh-49` gold is English "Business Administration and Law". The extraction is the Vietnamese line "Cử nhân Quản trị-Luật". |

No miss was an Indian abbreviation such as B.Tech or MCA. This set is Vietnamese. The tune set is where those abbreviations have to keep working.

## Skills

82 gold skills were missing on this draw. 709 extracted strings were not in the label list.

| Category | Count | What happened |
|---|---:|---|
| Gold skill not extracted | 42 | A named tool was in the resume and not in the output. `fresh-01` is most of these: Java, C#, Node.js, PHP, JavaScript, and the rest of the skills block, while the output kept AWS fragments from the project lines. |
| Office-suite wording | 13 | Word, Excel, PowerPoint, or MS Office was labeled and a different form came back, or it was dropped. |
| Longer or shorter form already extracted | 27 | PL/SQL against "PL/SQL Oracle", Ahrefs against "Ahref", Magento against "Magento 2", .NET against ".Net Framework", SQL Server against "Microsoft SQL Server". Exact equality counts these as misses. |

| Extra strings | Count | What happened |
|---|---:|---|
| Not in the label | 499 | Nouns from duty lines. The skill pass asks for every tool in the resume, and the quote expander then splits those quotes again ("+ Python", "Sử dụng AWS: S3", "Framework dự án"). |
| Longer or shorter form of a label | 133 | Same skill, different spelling. These are matches under a synonym rule and false positives under exact equality. |
| Soft skill or spoken language | 66 | tiếng anh, teamwork, giao tiếp, làm việc nhóm, làm việc độc lập. |
| Phrase longer than four words | 56 | Duty fragments that got through the five-word check as separate strings. |
| Title or role | 13 | A job title returned as a skill. |
| One- and two-letter fragment | 8 | |

Exact precision at 16.2% is mostly this matching gap (821 strings against 222 labels on the scored run). The model also lists far too many skills: several resumes came back with 30 to 45.

## INVALID_SHAPE

The scored run rejected one resume with `INVALID_SHAPE` and did not log the raw model JSON. The repair path only rewrites empty strings (`too_small` / `too_big`). Any other schema failure rejects the resume. This draw did not reproduce that resume, so the raw output is still unknown.
