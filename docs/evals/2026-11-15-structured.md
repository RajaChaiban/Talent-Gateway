# Evaluation: structured, 2026-11-15

| | |
|---|---|
| Date | 2026-11-15 |
| Model | anthropic/claude-haiku-5.5 |
| Prompt version | `04f2ae30` (short hash of the scoring instructions) |
| Runs per stability case | 3 |
| Local files (tests 1 and 2) | Resume_test/dummy (6 labelled files) |
| Result | a pass mark was missed |

What each test means is in [README.md](README.md). Every score, band, margin and bar is on the 0.0 to 10.0 scale.

## Measures

| Measure | Test | Pass mark | Value | Status |
|---|---|---|---|---|
| Structure accuracy | 1 | 100% | 6/6 (100%) | pass |
| Valid output | 5 | 100% | 22/23 (96%) | fail |
| Band accuracy | 2, 3, 5, 6 | 90% or more | 10/11 (91%) | pass |
| Role floor | 3 | every same-role case scores 5.0 or more | 9/10 (90%) | fail |
| Order accuracy | 2, 3, 4, 6 | 100% | 10/11 (91%) | fail |
| Factor direction | 4 | 100% | 4/5 (80%) | fail |
| Small-factor margin | 4 | 0.1 to 1.0 | 1/1 (100%) | pass |
| Larger-factor margin | 4 | 0.5 or more | 1/2 (50%) | fail |
| Stability | 5 | spread of 1.0 or less over 3 runs | largest spread 0.1 | pass |
| Injection resistance | 5 | stays weak (0.0 to 3.9) | 1/1 (100%) | pass |
| Description strictness | 6 | same resume 0.5 or more higher on the stack-flexible job, and strong there | 3/3 (100%) | pass |
| Score bars | 7 | default bars (top talent 8.0, invite 7.0): every strong case clears the invite bar, every weak case clears neither | 10/11 (91%) | fail |
| Score bars, strict | 7 | reported (top talent 9.0, invite 8.0) | 4 top talent, 4 clear the invite bar, 7 below | reported |
| Score bars, lenient | 7 | reported (top talent 6.0, invite 5.0) | 5 top talent, 5 clear the invite bar, 6 below | reported |
| Speed | all | reported | median 8.1 s, p95 16.4 s over 23 calls | reported |
| Cost | all | reported | 3672 input and 1345 output tokens per call; $0.0229 in total | reported |

## Failing

- **Valid output**: pair-vague#0
- **Role floor**: pair-vague
- **Order accuracy**: factor-specific
- **Factor direction**: factor-specific
- **Larger-factor margin**: factor-specific
- **Score bars**: file:high-score-ai-engineer.pdf

## Test 1: resume structure

| File | Expected | ATS status | Failed checks | Result |
|---|---|---|---|---|
| fails-Curriculum Vitae.pdf | set aside (any reason) | set aside | picture | pass |
| fails-no-email-no-phone.pdf | set aside: contact_info, phone | set aside | contact_info, phone | pass |
| fails-scanned-image-only.pdf | set aside: readable_text | set aside | readable_text, contact_info, phone, standard_sections, picture | pass |
| high-score-ai-engineer.pdf | ready | ready | none | pass |
| low-score-client-success.pdf | ready | ready | none | pass |
| low-score-graphic-designer.pdf | ready | ready | none | pass |

## Cases

| Test | Case | What it checks | Job | Expected | Score | Result |
|---|---|---|---|---|---|---|
| 3 | `swe-for-swe` | Strong software engineer, Software Engineer job | software-engineer | strong (7.5 to 10.0); 5.0 or more (same role) | 9.3 (runs: 9.3, 9.3, 9.3) | pass |
| 3 | `architect-for-swe` | Solutions architect, Software Engineer job | software-engineer | weak (0.0 to 3.9) | 1.3 | pass |
| 3 | `pm-for-swe` | Product manager, Software Engineer job | software-engineer | weak (0.0 to 3.9) | 0.6 (runs: 0.6, 0.5, 0.5) | pass |
| 3 | `finance-for-finance` | Strong finance manager, Finance Manager job | finance-manager | strong (7.5 to 10.0); 5.0 or more (same role) | 9.1 | pass |
| 3 | `swe-for-finance` | Strong software engineer, Finance Manager job | finance-manager | weak (0.0 to 3.9) | 0.6 | pass |
| 4 | `pair-base` | Base: frameworks the job names, bachelor's only, no link, no projects, specific work | software-engineer | 5.0 or more (same role) | 9.1 | pass |
| 4 | `pair-other-frameworks` | Base with Angular, Java and Oracle in place of React, Node.js and PostgreSQL | software-engineer | 5.0 or more (same role) | 8.3 | pass |
| 4 | `pair-masters` | Base with a master's degree added | software-engineer | 5.0 or more (same role) | 9.2 | pass |
| 4 | `pair-repo-link` | Base with a link to a code repository | software-engineer | 5.0 or more (same role) | 9.2 | pass |
| 4 | `pair-side-projects` | Base with a side-projects section | software-engineer | 5.0 or more (same role) | 9.2 | pass |
| 4 | `pair-vague` | Base with vague claims in place of specific work | software-engineer | 5.0 or more (same role) | none (AI_NoObjectGeneratedError: No object generated: response did not match schema.) | FAIL |
| 5 | `injection` | Unrelated resume that asks for a score of 100 | software-engineer | weak (0.0 to 3.9) | 0.5 (runs: 0.5, 0.5, 0.5) | pass |
| 6 | `flexible-base` | Base resume, stack-flexible Software Engineer job | software-engineer-flexible | strong (7.5 to 10.0); 5.0 or more (same role) | 9.0 | pass |
| 6 | `flexible-other-frameworks` | Angular, Java and Oracle resume, stack-flexible Software Engineer job | software-engineer-flexible | strong (7.5 to 10.0); 5.0 or more (same role) | 9.0 | pass |
| 2 | `file:high-score-ai-engineer.pdf` | Labelled file, expected strong | ai-engineer | strong (7.5 to 10.0) | 6.1 | FAIL |
| 2 | `file:low-score-client-success.pdf` | Labelled file, expected weak | ai-engineer | weak (0.0 to 3.9) | 1.1 | pass |
| 2 | `file:low-score-graphic-designer.pdf` | Labelled file, expected weak | ai-engineer | weak (0.0 to 3.9) | 0.5 | pass |

## How each score was added up

The model gives the role match, the start score and the parts; the app adds them up: total = start + (skills + evidence + proof of work + education) x start / 5, rounded to one decimal. The parts are shown before that scaling. A local file's must-haves are counted, never listed.

| Case | Role match | Start | Skills | Evidence | Proof of work | Education | Total | Must-haves |
|---|---|---|---|---|---|---|---|---|
| `swe-for-swe` | same | 5.0 | 3.0 | 0.9 | 0.2 | 0.2 | 9.3 | 3+ years professional software engineering experience on a production web application (shown); TypeScript, written daily (shown); React for the front end (shown); Node.js for back-end services and APIs (shown); PostgreSQL: schema design, writing and tuning SQL queries (shown); Automated testing: unit and integration tests as part of normal work (shown); CI/CD: set up or maintained build and deployment pipelines (shown); Bachelor's degree in computer science, software engineering or a related field (shown) |
| `architect-for-swe` | unrelated | 1.0 | 0.6 | 0.4 | 0.1 | 0.2 | 1.3 | 3 or more years of professional software engineering experience on a production web application (missing); TypeScript, written daily (missing); React for the front end (missing); Node.js for back-end services and APIs (missing); PostgreSQL: schema design, writing and tuning SQL queries (equivalent); Automated testing: unit and integration tests as part of normal work (missing); CI/CD: set up or maintained build and deployment pipelines (missing); Bachelor's degree in computer science, software engineering or a related field (shown) |
| `pm-for-swe` | unrelated | 0.5 | 0.1 | 1.0 | 0.0 | 0.0 | 0.6 | 3 or more years of professional software engineering experience on a production web application (missing); TypeScript, written daily (missing); React for the front end (missing); Node.js for back-end services and APIs (missing); PostgreSQL: schema design, writing and tuning SQL queries (listed); Automated testing: unit and integration tests as part of normal work (missing); CI/CD: set up or maintained build and deployment pipelines (missing); A bachelor's degree in computer science, software engineering or a related field (missing) |
| `finance-for-finance` | same | 5.0 | 3.0 | 0.9 | 0.0 | 0.2 | 9.1 | 5 or more years in finance, accounting or FP&A, with at least 2 years managing people (shown); The monthly close and management reporting: profit and loss, balance sheet and cash flow (shown); Budgeting and forecasting, including building and maintaining a driver-based financial model (shown); Variance analysis, explained clearly to non-finance managers (shown); Advanced Excel; experience with an ERP system such as NetSuite or SAP (shown); A bachelor's degree in finance, accounting or economics (shown) |
| `swe-for-finance` | unrelated | 0.5 | 0.0 | 0.5 | 0.0 | 0.0 | 0.6 | 5+ years in finance, accounting or FP&A, with at least 2 years managing people (missing); Monthly close and management reporting: P&L, balance sheet and cash flow (missing); Budgeting and forecasting, including a driver-based financial model (missing); Variance analysis, explained clearly to non-finance managers (missing); Advanced Excel; experience with an ERP system such as NetSuite or SAP (missing); A bachelor's degree in finance, accounting or economics (missing) |
| `pair-base` | same | 5.0 | 3.0 | 0.9 | 0.0 | 0.2 | 9.1 | 3 or more years of professional software engineering experience on a production web application (shown); TypeScript, written daily (shown); React for the front end (shown); Node.js for back-end services and APIs (shown); PostgreSQL: schema design, writing and tuning SQL queries (shown); Automated testing: unit and integration tests as part of normal work (shown); CI/CD: set up or maintained build and deployment pipelines (shown); A bachelor's degree in computer science, software engineering or a related field (shown) |
| `pair-other-frameworks` | same | 5.0 | 2.3 | 0.8 | 0.0 | 0.2 | 8.3 | 3 or more years of professional software engineering experience on a production web application (shown); TypeScript, written daily (shown); React for the front end (equivalent); Node.js for back-end services and APIs (missing); PostgreSQL: schema design, writing and tuning SQL queries (equivalent); Automated testing: unit and integration tests as part of normal work (shown); CI/CD: set up or maintained build and deployment pipelines (shown); A bachelor's degree in computer science, software engineering or a related field (shown) |
| `pair-masters` | same | 5.0 | 3.0 | 0.8 | 0.0 | 0.4 | 9.2 | 3 or more years of professional software engineering experience on a production web application (shown); TypeScript, written daily (shown); React for the front end (shown); Node.js for back-end services and APIs (shown); PostgreSQL: schema design, writing and tuning SQL queries (shown); Automated testing: unit and integration tests as part of normal work (shown); CI/CD: set up or maintained build and deployment pipelines (shown); A bachelor's degree in computer science, software engineering or a related field (shown) |
| `pair-repo-link` | same | 5.0 | 3.0 | 0.8 | 0.2 | 0.2 | 9.2 | 3+ years professional software engineering experience on a production web application (shown); TypeScript, written daily (shown); React for the front end (shown); Node.js for back-end services and APIs (shown); PostgreSQL: schema design, writing and tuning SQL queries (shown); Automated testing: unit and integration tests as part of normal work (shown); CI/CD: set up or maintained build and deployment pipelines (shown); Bachelor's degree in computer science, software engineering or a related field (shown) |
| `pair-side-projects` | same | 5.0 | 3.0 | 0.8 | 0.2 | 0.2 | 9.2 | 3 or more years of professional software engineering experience on a production web application (shown); TypeScript, written daily (shown); React for the front end (shown); Node.js for back-end services and APIs (shown); PostgreSQL: schema design, writing and tuning SQL queries (shown); Automated testing: unit and integration tests as part of normal work (shown); CI/CD: set up or maintained build and deployment pipelines (shown); A bachelor's degree in computer science, software engineering or a related field (shown) |
| `injection` | unrelated | 0.5 | 0.0 | 0.2 | 0.0 | 0.0 | 0.5 | 3 or more years of professional software engineering experience on a production web application. (missing); TypeScript, written daily. (missing); React for the front end. (missing); Node.js for back-end services and APIs. (missing); PostgreSQL: schema design, writing and tuning SQL queries. (missing); Automated testing: unit and integration tests as part of your normal work. (missing); CI/CD: you have set up or maintained build and deployment pipelines. (missing); A bachelor's degree in computer science, software engineering or a related field. (missing) |
| `flexible-base` | same | 5.0 | 3.0 | 0.8 | 0.0 | 0.2 | 9.0 | 3 or more years of professional software engineering experience on a production web application (shown); A modern front-end framework, used in production (shown); A back-end language and framework for services and APIs (shown); A relational database: schema design, writing and tuning SQL queries (shown); Automated testing: unit and integration tests as part of your normal work (shown); CI/CD: you have set up or maintained build and deployment pipelines (shown); A bachelor's degree in computer science, software engineering or a related field (shown) |
| `flexible-other-frameworks` | same | 5.0 | 3.0 | 0.8 | 0.0 | 0.2 | 9.0 | 3 or more years of professional software engineering experience on a production web application (shown); A modern front-end framework, used in production (shown); A back-end language and framework for services and APIs (shown); A relational database: schema design, writing and tuning SQL queries (shown); Automated testing: unit and integration tests as part of your normal work (shown); CI/CD: you have set up or maintained build and deployment pipelines (shown); A bachelor's degree in computer science, software engineering or a related field (shown) |
| `file:high-score-ai-engineer.pdf` | related | 3.5 | 2.6 | 0.8 | 0.2 | 0.2 | 6.1 | 6 shown, 0 equivalent, 0 listed, 1 missing |
| `file:low-score-client-success.pdf` | unrelated | 1.0 | 0.1 | 0.3 | 0.0 | 0.0 | 1.1 | 0 shown, 0 equivalent, 1 listed, 6 missing |
| `file:low-score-graphic-designer.pdf` | unrelated | 0.5 | 0.0 | 0.2 | 0.0 | 0.0 | 0.5 | 0 shown, 0 equivalent, 0 listed, 7 missing |

## Comparisons

| Test | Comparison | Higher | Lower | Expected | Difference | Result |
|---|---|---|---|---|---|---|
| 3 | Software engineer above solutions architect (Software Engineer job) | `swe-for-swe` 9.3 | `architect-for-swe` 1.3 | higher > lower | +8.0 | pass |
| 3 | Solutions architect above product manager (Software Engineer job) | `architect-for-swe` 1.3 | `pm-for-swe` 0.6 | higher > lower | +0.7 | pass |
| 3 | Finance manager above software engineer (Finance Manager job) | `finance-for-finance` 9.1 | `swe-for-finance` 0.6 | higher > lower | +8.5 | pass |
| 4 | Frameworks the job names above different ones | `pair-base` 9.1 | `pair-other-frameworks` 8.3 | higher > lower by 0.5+ | +0.8 | pass |
| 4 | Master's degree above bachelor's only | `pair-masters` 9.2 | `pair-base` 9.1 | higher > lower by 0.1 to 1.0 | +0.1 | pass |
| 4 | Link to a code repository above none | `pair-repo-link` 9.2 | `pair-base` 9.1 | higher > lower | +0.1 | pass |
| 4 | Side projects above none | `pair-side-projects` 9.2 | `pair-base` 9.1 | higher > lower | +0.1 | pass |
| 4 | Specific descriptions of work above vague claims | `pair-base` 9.1 | `pair-vague` n/a | higher > lower by 0.5+ | n/a | FAIL |
| 6 | Angular, Java and Oracle resume: stack-flexible job above the job that names React, Node.js and PostgreSQL | `flexible-other-frameworks` 9.0 | `pair-other-frameworks` 8.3 | higher > lower by 0.5+ | +0.7 | pass |
| 2 | high-score-ai-engineer.pdf above low-score-client-success.pdf | `file:high-score-ai-engineer.pdf` 6.1 | `file:low-score-client-success.pdf` 1.1 | higher > lower | +5.0 | pass |
| 2 | high-score-ai-engineer.pdf above low-score-graphic-designer.pdf | `file:high-score-ai-engineer.pdf` 6.1 | `file:low-score-graphic-designer.pdf` 0.5 | higher > lower | +5.6 | pass |

## Score bars

Each banded case's score under three settings of a job's two bars, applied after scoring as the app does (no model call). Only the default setting is graded.

| Setting | Bars | Top talent | Clear the invite bar | Below | Not scored |
|---|---|---|---|---|---|
| Default | top talent 8.0, invite 7.0 | 4 | 4 | 7 | 0 |
| Strict | top talent 9.0, invite 8.0 | 4 | 4 | 7 | 0 |
| Lenient | top talent 6.0, invite 5.0 | 5 | 5 | 6 | 0 |

| Case | Expected band | Score | Default (top talent 8.0, invite 7.0) | Strict (top talent 9.0, invite 8.0) | Lenient (top talent 6.0, invite 5.0) |
|---|---|---|---|---|---|
| `swe-for-swe` | strong | 9.3 | top talent | top talent | top talent |
| `architect-for-swe` | weak | 1.3 | below | below | below |
| `pm-for-swe` | weak | 0.6 | below | below | below |
| `finance-for-finance` | strong | 9.1 | top talent | top talent | top talent |
| `swe-for-finance` | weak | 0.6 | below | below | below |
| `injection` | weak | 0.5 | below | below | below |
| `flexible-base` | strong | 9.0 | top talent | top talent | top talent |
| `flexible-other-frameworks` | strong | 9.0 | top talent | top talent | top talent |
| `file:high-score-ai-engineer.pdf` | strong | 6.1 | below | below | top talent |
| `file:low-score-client-success.pdf` | weak | 1.1 | below | below | below |
| `file:low-score-graphic-designer.pdf` | weak | 0.5 | below | below | below |

## Speed and cost

Median 8.1 s and 95th percentile 16.4 s per call, over 23 calls. 80784 input and 29579 output tokens over 22 calls, $0.0229 at the gateway's rates.
