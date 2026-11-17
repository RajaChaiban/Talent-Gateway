# Deployed check, reviewer against platform: 2026-11-16

| | |
|---|---|
| Date | 2026-11-16 |
| Site | https://talentgateway.dev (production, commit `767cd48`) |
| Platform model | anthropic/claude-haiku-5.5, through the app |
| Reviewer | anthropic/claude-fable-5.2, scoring by hand from the rubric, before the run |
| Driver | a browser agent that signed in, uploaded, analyzed and copied every answer word for word |
| Resumes | 10 written for this check: 5 for a software engineer job, 5 for a senior financial analyst job |
| Result | pre-screen agreed on 10 of 10; 7 of 9 scores within 0.3; 2 scores and 1 flag disagreed |

What this check is and how it differs from `npm run eval` is in [EVALUATION.md](../EVALUATION.md#layer-5-a-blind-check-on-the-deployed-site).

## How it was run

1. The ten resumes and two job descriptions were written first, each resume for one scenario: a strong match, a partial match, a weak match, a risk flag, and a file the pre-screen should set aside.
2. The reviewer read the scoring instructions and `SCORE_WEIGHTS`, classified each resume part by part, and wrote down a score and the expected flags. The answers were saved before the site was touched.
3. A separate browser agent, which had seen neither the resumes' contents nor the reviewer's answers, created two jobs on the deployed site, uploaded each set, clicked Analyze once per job, and copied every score, summary, strength, gap and flag from the page. It then used **Score anyway** on the two files that were set aside, and sent one invitation.
4. The two sets of answers were laid side by side.

The resume pack is local test data (`Resume_test/recruiter-pack/`) and is not in the repository.

## Pre-screen

| Resume | Reviewer | Platform |
|---|---|---|
| The 8 ordinary files | ready | ready, all 8 |
| Software 5: portrait picture, no phone number | set aside for both | set aside: no phone number, 1 picture |
| Finance 5: a scanned page with no text | set aside, nothing readable | set aside: no text, no email, no phone number, no section headings, 1 picture |

Agreement: 10 of 10.

## Scores

Every score is on the 0.0 to 10.0 scale. The difference is platform minus reviewer.

| Resume | Scenario | Reviewer | Platform | Difference |
|---|---|---|---|---|
| Software 1, Priya Raman | six years in the job's exact stack | 9.2 | 9.2 | 0.0 |
| Software 2, Marcus Feldman | a solid engineer in Java, Angular and Oracle | 8.6 | 8.6 | 0.0 |
| Software 3, Tomas Herrera | bootcamp graduate, six-month internship | 5.0 as a related role, 7.2 as the same role | 4.8 | -0.2 |
| Software 4, Dylan Brooks | the right stack, six short jobs and a gap | 8.3 | 8.5 | +0.2 |
| Software 5, Sofia Lindgren | strong, scored anyway after being set aside | 9.1 | 8.8 | -0.3 |
| Finance 1, Hannah Whitaker | six years of FP&A, every must-have | 9.0 | 9.0 | 0.0 |
| Finance 2, Omar Haddad | an accountant from audit and the month-end close | 4.6 (range 4.0 to 5.2) | 3.4 | -1.2 |
| Finance 3, Kayla Jensen | a retail store manager | 1.2 | 1.1 | -0.1 |
| Finance 4, Brandon Cole | job description lines pasted in, buzzwords, no numbers | 6.0 (range 5.5 to 6.5) | 7.3 | +1.3 |
| Finance 5, Mei Tanaka | the scanned page, scored anyway | cannot be scored | 0.0, "The resume is empty" | agrees |

- Identical to the decimal: 3 of 9.
- Within 0.3: 7 of 9.
- Average difference: 0.37.
- Order within each job: the same, except that the platform put Brandon Cole above Omar Haddad by a wider margin.

## Risk flags

| Resume | Reviewer | Platform |
|---|---|---|
| Dylan Brooks | job hopping, employment gap | job hopping, employment gap (a gap of about 16 months, named with its dates) |
| Brandon Cole | AI-written only | AI-written **and copycat** |
| The other 8 | none | none |

Agreement: 39 of 40 flags.

## The three disagreements

**Brandon Cole scored 7.3, not about 6.0.** Two of his bullets are must-haves of the job description pasted in word for word ("Advanced Excel financial modelling: three-statement models, DCF, scenario and sensitivity analysis"). The reviewer counted those as listed, since no work is described. The platform counted them as shown, and its strengths repeat them as evidence. This is the finding that matters: 7.3 clears the default invite bar of 7.0, so a resume that copies the job description is offered for interview. The AI-written flag did fire, which is the signal a recruiter has to notice.

**Brandon Cole was flagged as a copycat.** The platform's note says his summary "closely rewords the summary of other resume 2". One sentence is similar, because both resumes echo the job description. The rule asks for large passages, so the reviewer did not flag it. The platform was stricter than its own rule here.

**Omar Haddad scored 3.4, not about 4.6.** Both called the role related. The reviewer gave some credit for five years in corporate accounting and for supplying actuals to the budget-to-actual review; the platform gave none and listed all five FP&A must-haves as gaps. The platform's reading is the stricter one and is defensible.

The part-scores behind a platform total are not shown in the app, so the reasons above are read from its summary, strengths and gaps.

## Other things the run showed

- The invitation worked end to end on production: `POST /api/candidates/<id>/invite` answered 200 with `invite_status` `SENT`, and the row showed the Invited badge after a reload.
- **Invite to interview** is offered on every ranked row whatever its score, including a 0.0 and a 1.1. The invite bar marks a candidate; it does not hide the button.
- After **Score anyway**, the status line still read "1 resume not ATS-ready, set aside" while that tab showed 0.
- The scanned page scored anyway is listed under its file name with 0.0 and an empty email field.
- One flag that was not raised still carried a note (copycat on Sofia Lindgren).

## What this does not prove

- Ten resumes written for the purpose is a spot check of the deployed path, not a benchmark.
- The reviewer is a model too. Agreement between the two is not correctness, and the two disagreements were settled by reading the resume, not by trusting either side.
- One run. The platform's scores can move by a decimal between runs; stability is measured by test 5 of the evaluation set.
