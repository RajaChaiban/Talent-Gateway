# Evaluation: jobtypes-haiku, 2026-11-15

| | |
|---|---|
| Date | 2026-11-15 |
| Model | anthropic/claude-haiku-5.5 |
| Prompt version | `2d2468ff` (short hash of the scoring instructions) |
| Tests run | 8 (--only 8) |
| Runs per stability case | 3 |
| Local files (tests 1 and 2) | skipped: --only left out tests 1, 2 and 7 |
| Result | every pass mark met |

What each test means is in [README.md](README.md). Every score, band, margin and bar is on the 0.0 to 10.0 scale.

## Measures

| Measure | Test | Pass mark | Value | Status |
|---|---|---|---|---|
| Structure accuracy | 1 | 100% | not run (--only) | skipped |
| Valid output | all | 100% | 25/25 (100%) | pass |
| Band accuracy | 2, 3, 5, 6 | 90% or more | not run (--only) | skipped |
| Role floor | 3, 8 | every same-role case scores 5.0 or more | 15/15 (100%) | pass |
| Order accuracy | 2, 3, 4, 6 | 100% | not run (--only) | skipped |
| Factor direction | 4 | 100% | not run (--only) | skipped |
| Small-factor margin | 4 | stated margin | not run (--only) | skipped |
| Larger-factor margin | 4 | stated margin | not run (--only) | skipped |
| Stability | 5 | spread of 1.0 or less over 3 runs | not run (--only) | skipped |
| Injection resistance | 5 | stays weak (0.0 to 3.9) | not run (--only) | skipped |
| Description strictness | 6 | same resume 0.5 or more higher on the stack-flexible job, and strong there | not run (--only) | skipped |
| Score bars | 7 | default bars (top talent 8.0, invite 7.0): every strong case clears the invite bar, every weak case clears neither | not run (--only) | skipped |
| Score bars, strict | 7 | reported (top talent 9.0, invite 8.0) | not run (--only) | skipped |
| Score bars, lenient | 7 | reported (top talent 6.0, invite 5.0) | not run (--only) | skipped |
| Job types: ranges | 8 | 90% or more inside their range | 25/25 (100%) | pass |
| Job types: order | 8 | 100%: strong > mid, strong > vague by 1.0+, mid > related, related > unrelated | 20/20 (100%) | pass |
| Job types: filtering | 8 | 100%: every resume ATS_READY, each negative set aside on exactly its check | 29/29 (100%) | pass |
| Speed | all | reported | median 8.3 s, p95 11.0 s over 25 calls | reported |
| Cost | all | reported | 3675 input and 1503 output tokens per call; $0.0280 in total | reported |

## Failing

None.

## Test 1: resume structure

Not run: skipped: --only left out tests 1, 2 and 7.

## Cases

| Test | Case | What it checks | Job | Expected | Score | Result |
|---|---|---|---|---|---|---|
| 8 | `jt-swe-strong` | Software Engineer job: same role, every must-have shown with specific, quantified work | software-engineer | 8.0 to 10.0; 5.0 or more (same role) | 9.5 | pass |
| 8 | `jt-swe-mid` | Software Engineer job: same role, about half the must-haves shown, the rest absent | software-engineer | 5.0 to 8.4; 5.0 or more (same role) | 7.7 | pass |
| 8 | `jt-swe-vague` | Software Engineer job: same role and career as strong, in vague claims, must-haves only in the skills list | software-engineer | 5.0 to 7.9; 5.0 or more (same role) | 6.5 | pass |
| 8 | `jt-swe-related` | Software Engineer job: a related role doing part of the same hands-on work | software-engineer | 2.5 to 6.9 | 6.0 | pass |
| 8 | `jt-swe-unrelated` | Software Engineer job: a solid resume for a role with none of the job's hands-on work | software-engineer | 0.0 to 3.0 | 0.6 | pass |
| 8 | `jt-finance-strong` | Finance Manager job: same role, every must-have shown with specific, quantified work | finance-manager | 8.0 to 10.0; 5.0 or more (same role) | 9.2 | pass |
| 8 | `jt-finance-mid` | Finance Manager job: same role, about half the must-haves shown, the rest absent | finance-manager | 5.0 to 8.4; 5.0 or more (same role) | 7.7 | pass |
| 8 | `jt-finance-vague` | Finance Manager job: same role and career as strong, in vague claims, must-haves only in the skills list | finance-manager | 5.0 to 7.9; 5.0 or more (same role) | 6.7 | pass |
| 8 | `jt-finance-related` | Finance Manager job: a related role doing part of the same hands-on work | finance-manager | 2.5 to 6.9 | 4.6 | pass |
| 8 | `jt-finance-unrelated` | Finance Manager job: a solid resume for a role with none of the job's hands-on work | finance-manager | 0.0 to 3.0 | 0.6 | pass |
| 8 | `jt-nurse-strong` | Registered Nurse job: same role, every must-have shown with specific, quantified work | registered-nurse | 8.0 to 10.0; 5.0 or more (same role) | 8.9 | pass |
| 8 | `jt-nurse-mid` | Registered Nurse job: same role, about half the must-haves shown, the rest absent | registered-nurse | 5.0 to 8.4; 5.0 or more (same role) | 7.5 | pass |
| 8 | `jt-nurse-vague` | Registered Nurse job: same role and career as strong, in vague claims, must-haves only in the skills list | registered-nurse | 5.0 to 7.9; 5.0 or more (same role) | 6.5 | pass |
| 8 | `jt-nurse-related` | Registered Nurse job: a related role doing part of the same hands-on work | registered-nurse | 2.5 to 6.9 | 4.1 | pass |
| 8 | `jt-nurse-unrelated` | Registered Nurse job: a solid resume for a role with none of the job's hands-on work | registered-nurse | 0.0 to 3.0 | 0.6 | pass |
| 8 | `jt-marketing-strong` | Digital Marketing Manager job: same role, every must-have shown with specific, quantified work | marketing-manager | 8.0 to 10.0; 5.0 or more (same role) | 9.2 | pass |
| 8 | `jt-marketing-mid` | Digital Marketing Manager job: same role, about half the must-haves shown, the rest absent | marketing-manager | 5.0 to 8.4; 5.0 or more (same role) | 7.9 | pass |
| 8 | `jt-marketing-vague` | Digital Marketing Manager job: same role and career as strong, in vague claims, must-haves only in the skills list | marketing-manager | 5.0 to 7.9; 5.0 or more (same role) | 6.2 | pass |
| 8 | `jt-marketing-related` | Digital Marketing Manager job: a related role doing part of the same hands-on work | marketing-manager | 2.5 to 6.9 | 4.7 | pass |
| 8 | `jt-marketing-unrelated` | Digital Marketing Manager job: a solid resume for a role with none of the job's hands-on work | marketing-manager | 0.0 to 3.0 | 1.3 | pass |
| 8 | `jt-sales-strong` | Account Executive job: same role, every must-have shown with specific, quantified work | account-executive | 8.0 to 10.0; 5.0 or more (same role) | 9.2 | pass |
| 8 | `jt-sales-mid` | Account Executive job: same role, about half the must-haves shown, the rest absent | account-executive | 5.0 to 8.4; 5.0 or more (same role) | 7.9 | pass |
| 8 | `jt-sales-vague` | Account Executive job: same role and career as strong, in vague claims, must-haves only in the skills list | account-executive | 5.0 to 7.9; 5.0 or more (same role) | 7.2 | pass |
| 8 | `jt-sales-related` | Account Executive job: a related role doing part of the same hands-on work | account-executive | 2.5 to 6.9 | 4.6 | pass |
| 8 | `jt-sales-unrelated` | Account Executive job: a solid resume for a role with none of the job's hands-on work | account-executive | 0.0 to 3.0 | 0.6 | pass |

## How each score was added up

The model gives the role match, the start score and the parts; the app adds them up: total = start + (skills + evidence + proof of work + education) x start / 5, rounded to one decimal. The parts are shown before that scaling. A local file's must-haves are counted, never listed.

| Case | Role match | Start | Skills | Evidence | Proof of work | Education | Total | Must-haves |
|---|---|---|---|---|---|---|---|---|
| `jt-swe-strong` | same | 5.0 | 3.0 | 1.0 | 0.3 | 0.2 | 9.5 | 3+ years professional software engineering on a production web application (shown); TypeScript, written daily (shown); React for the front end (shown); Node.js for back-end services and APIs (shown); PostgreSQL: schema design, writing and tuning SQL queries (shown); Automated testing: unit and integration tests as part of normal work (shown); CI/CD: set up or maintained build and deployment pipelines (shown); Bachelor's degree in computer science, software engineering or related field (shown) |
| `jt-swe-mid` | same | 5.0 | 1.5 | 1.0 | 0.0 | 0.2 | 7.7 | 3+ years professional software engineering on a production web application (shown); TypeScript, written daily (shown); React for the front end (shown); Node.js for back-end services and APIs (missing); PostgreSQL: schema design, writing and tuning SQL queries (missing); Automated testing: unit and integration tests as part of normal work (missing); CI/CD: set up or maintained build and deployment pipelines (missing); Bachelor's degree in computer science, software engineering or a related field (shown) |
| `jt-swe-vague` | same | 5.0 | 1.3 | 0.0 | 0.0 | 0.2 | 6.5 | 3+ years professional software engineering experience on a production web application (shown); TypeScript, written daily (listed); React for the front end (listed); Node.js for back-end services and APIs (listed); PostgreSQL: schema design, writing and tuning SQL queries (listed); Automated testing: unit and integration tests as part of normal work (listed); CI/CD: set up or maintained build and deployment pipelines (listed); Bachelor's degree in computer science, software engineering or a related field (shown) |
| `jt-swe-related` | related | 3.5 | 2.4 | 1.0 | 0.0 | 0.2 | 6.0 | 3 or more years of professional software engineering experience on a production web application (equivalent); TypeScript, written daily (shown); React for the front end (missing); Node.js for back-end services and APIs (shown); PostgreSQL: schema design, writing and tuning SQL queries (shown); Automated testing: unit and integration tests as part of normal work (shown); CI/CD: set up or maintained build and deployment pipelines (shown); A bachelor's degree in computer science, software engineering or a related field (shown) |
| `jt-swe-unrelated` | unrelated | 0.5 | 0.0 | 1.0 | 0.0 | 0.0 | 0.6 | 3+ years professional software engineering experience on a production web application (missing); TypeScript, written daily (missing); React for the front end (missing); Node.js for back-end services and APIs (missing); PostgreSQL: schema design, writing and tuning SQL queries (missing); Automated testing: unit and integration tests as part of normal work (missing); CI/CD: set up or maintained build and deployment pipelines (missing); Bachelor's degree in computer science, software engineering or a related field (missing) |
| `jt-finance-strong` | same | 5.0 | 3.0 | 1.0 | 0.0 | 0.2 | 9.2 | 5+ years in finance, accounting or FP&A, with at least 2 years managing people (shown); Monthly close and management reporting: profit and loss, balance sheet and cash flow (shown); Budgeting and forecasting, including building and maintaining a driver-based financial model (shown); Variance analysis, explained clearly to non-finance managers (shown); Advanced Excel; experience with an ERP system such as NetSuite or SAP (shown); A bachelor's degree in finance, accounting or economics (shown) |
| `jt-finance-mid` | same | 5.0 | 1.5 | 1.0 | 0.0 | 0.2 | 7.7 | 5+ years in finance, accounting or FP&A, with at least 2 years managing people (shown); Monthly close and management reporting: P&L, balance sheet and cash flow (shown); Budgeting and forecasting, including building and maintaining a driver-based financial model (missing); Variance analysis, explained clearly to non-finance managers (missing); Advanced Excel; experience with an ERP system such as NetSuite or SAP (missing); Bachelor's degree in finance, accounting or economics (shown) |
| `jt-finance-vague` | same | 5.0 | 1.5 | 0.0 | 0.0 | 0.2 | 6.7 | 5 or more years in finance, accounting or FP&A, with at least 2 years managing people (shown); Monthly close and management reporting: profit and loss, balance sheet and cash flow (listed); Budgeting and forecasting, including building and maintaining a driver-based financial model (listed); Variance analysis, explained clearly to non-finance managers (listed); Advanced Excel; experience with an ERP system such as NetSuite or SAP (listed); A bachelor's degree in finance, accounting or economics (shown) |
| `jt-finance-related` | related | 3.0 | 1.5 | 1.0 | 0.0 | 0.2 | 4.6 | 5+ years in finance, accounting or FP&A, with at least 2 years managing people (missing); Monthly close and management reporting: P&L, balance sheet and cash flow (shown); Budgeting and forecasting, including a driver-based financial model (missing); Variance analysis, explained clearly to non-finance managers (missing); Advanced Excel; ERP experience such as NetSuite or SAP (shown); Bachelor's degree in finance, accounting or economics (shown) |
| `jt-finance-unrelated` | unrelated | 0.5 | 0.0 | 1.0 | 0.3 | 0.0 | 0.6 | 5+ years in finance, accounting or FP&A, with at least 2 years managing people (missing); Monthly close and management reporting: P&L, balance sheet and cash flow (missing); Budgeting and forecasting, including a driver-based financial model (missing); Variance analysis, explained clearly to non-finance managers (missing); Advanced Excel; experience with an ERP system such as NetSuite or SAP (missing); A bachelor's degree in finance, accounting or economics (missing) |
| `jt-nurse-strong` | same | 5.0 | 2.7 | 1.0 | 0.0 | 0.2 | 8.9 | An active Registered Nurse (RN) license. (shown); 2 or more years of acute care nursing experience, ideally on a medical-surgical unit. (shown); Patient assessment and care planning for 4 to 6 adult patients per shift. (shown); Safe medication administration, including IV therapy and IV pump management. (shown); Charting in an electronic health record (EHR) such as Epic or Cerner. (shown); Current Basic Life Support (BLS) and Advanced Cardiovascular Life Support (ACLS) certification. (listed); Patient and family education, including discharge teaching. (shown); A Bachelor of Science in Nursing (BSN), or an associate degree in nursing with a BSN completed within 3 years of hire. (shown) |
| `jt-nurse-mid` | same | 5.0 | 1.5 | 1.0 | 0.0 | 0.0 | 7.5 | Active Registered Nurse (RN) license (shown); 2 or more years of acute care nursing experience, ideally medical-surgical (shown); Patient assessment and care planning for 4 to 6 adult patients per shift (shown); Safe medication administration, including IV therapy and IV pump management (shown); Charting in an electronic health record (EHR) such as Epic or Cerner (missing); Current Basic Life Support (BLS) and Advanced Cardiovascular Life Support (ACLS) certification (missing); Patient and family education, including discharge teaching (missing); A BSN, or an associate degree in nursing with a BSN completed within 3 years of hire (missing) |
| `jt-nurse-vague` | same | 5.0 | 1.3 | 0.0 | 0.0 | 0.2 | 6.5 | An active Registered Nurse (RN) license (listed); 2 or more years of acute care nursing experience, ideally on a medical-surgical unit (shown); Patient assessment and care planning for 4 to 6 adult patients per shift (listed); Safe medication administration, including IV therapy and IV pump management (listed); Charting in an electronic health record (EHR) such as Epic or Cerner (listed); Current Basic Life Support (BLS) and Advanced Cardiovascular Life Support (ACLS) certification (listed); Patient and family education, including discharge teaching (listed); A Bachelor of Science in Nursing (BSN), or an associate degree in nursing with a BSN completed within 3 years of hire (shown) |
| `jt-nurse-related` | related | 3.0 | 0.8 | 1.0 | 0.0 | 0.0 | 4.1 | An active Registered Nurse (RN) license (missing); 2 or more years of acute care nursing experience, ideally on a medical-surgical unit (missing); Patient assessment and care planning for 4 to 6 adult patients per shift (missing); Safe medication administration, including IV therapy and IV pump management (missing); Charting in an electronic health record (EHR) such as Epic or Cerner (shown); Current Basic Life Support (BLS) and Advanced Cardiovascular Life Support (ACLS) certification (listed); Patient and family education, including discharge teaching (shown); A Bachelor of Science in Nursing (BSN), or an associate degree in nursing with a BSN completed within 3 years of hire (missing) |
| `jt-nurse-unrelated` | unrelated | 0.5 | 0.0 | 1.0 | 0.0 | 0.0 | 0.6 | An active Registered Nurse (RN) license. (missing); 2 or more years of acute care nursing experience, ideally on a medical-surgical unit. (missing); Patient assessment and care planning for 4 to 6 adult patients per shift. (missing); Safe medication administration, including IV therapy and IV pump management. (missing); Charting in an electronic health record (EHR) such as Epic or Cerner. (missing); Current Basic Life Support (BLS) and Advanced Cardiovascular Life Support (ACLS) certification. (missing); Patient and family education, including discharge teaching. (missing); A Bachelor of Science in Nursing (BSN), or an associate degree in nursing with a BSN completed within 3 years of hire. (missing) |
| `jt-marketing-strong` | same | 5.0 | 3.0 | 1.0 | 0.0 | 0.2 | 9.2 | 4+ years in digital marketing, with at least 1 year managing people or agencies (shown); Paid search and paid social campaigns (Google Ads, Meta Ads): planning, running and optimising them (shown); Managing a paid media budget of $50,000 a month or more against a return target (ROAS or CPA) (shown); Email marketing: segmentation, automated flows and A/B testing in a tool such as Klaviyo or HubSpot (shown); Search engine optimisation (SEO): keyword research, on-page changes and reporting (shown); Analytics: Google Analytics 4, and reports that tie spend to revenue (shown); A bachelor's degree in marketing, business, communications or a related field (shown) |
| `jt-marketing-mid` | same | 5.0 | 1.7 | 1.0 | 0.0 | 0.2 | 7.9 | 4+ years in digital marketing, with at least 1 year managing people or agencies (shown); Paid search and paid social campaigns (Google Ads, Meta Ads): planning, running and optimising them (shown); Managing a paid media budget of $50,000 a month or more against a return target (ROAS or CPA) (shown); Email marketing: segmentation, automated flows and A/B testing in a tool such as Klaviyo or HubSpot (missing); SEO: keyword research, on-page changes and reporting (missing); Analytics: Google Analytics 4, and reports that tie spend to revenue (missing); A bachelor's degree in marketing, business, communications or a related field (shown) |
| `jt-marketing-vague` | same | 5.0 | 1.0 | 0.0 | 0.0 | 0.2 | 6.2 | 4 or more years in digital marketing, with at least 1 year managing people or agencies (listed); Paid search and paid social campaigns (Google Ads, Meta Ads): planning, running and optimising them (listed); Managing a paid media budget of $50,000 a month or more against a return target (ROAS or CPA) (missing); Email marketing: segmentation, automated flows and A/B testing in a tool such as Klaviyo or HubSpot (listed); Search engine optimisation (SEO): keyword research, on-page changes and reporting (listed); Analytics: Google Analytics 4, and reports that tie spend to revenue (listed); A bachelor's degree in marketing, business, communications or a related field (shown) |
| `jt-marketing-related` | related | 3.0 | 1.7 | 1.0 | 0.0 | 0.2 | 4.7 | 4+ years in digital marketing, with at least 1 year managing people or agencies (missing); Paid search and paid social campaigns (Google Ads, Meta Ads): planning, running and optimising them (missing); Managing a paid media budget of $50,000 a month or more against a return target (ROAS or CPA) (missing); Email marketing: segmentation, automated flows and A/B testing in Klaviyo or HubSpot (shown); SEO: keyword research, on-page changes and reporting (shown); Analytics: Google Analytics 4, and reports that tie spend to revenue (shown); A bachelor's degree in marketing, business, communications or a related field (shown) |
| `jt-marketing-unrelated` | unrelated | 1.0 | 0.4 | 1.0 | 0.0 | 0.2 | 1.3 | 4+ years in digital marketing, with at least 1 year managing people or agencies (missing); Paid search and paid social campaigns (Google Ads, Meta Ads): planning, running and optimising (missing); Managing a paid media budget of $50,000+ a month against a ROAS or CPA target (missing); Email marketing: segmentation, automated flows and A/B testing in Klaviyo or HubSpot (missing); SEO: keyword research, on-page changes and reporting (missing); Analytics: Google Analytics 4, and reports that tie spend to revenue (missing); Bachelor's degree in marketing, business, communications or a related field (shown) |
| `jt-sales-strong` | same | 5.0 | 3.0 | 1.0 | 0.0 | 0.2 | 9.2 | 2 or more years as a quota-carrying account executive selling B2B software (SaaS) (shown); A record of meeting or beating an annual new-business quota of $600,000 or more (shown); Running the full sales cycle: discovery, product demos, proposals, negotiation and closing (shown); Building your own pipeline through outbound prospecting as well as inbound leads (shown); Keeping the pipeline and your forecast accurate in a CRM such as Salesforce or HubSpot (shown); Selling to several decision makers in one deal, including finance and operations leaders (shown); A bachelor's degree in business or a related field (shown) |
| `jt-sales-mid` | same | 5.0 | 1.7 | 1.0 | 0.0 | 0.2 | 7.9 | 2+ years as quota-carrying AE selling B2B software (SaaS) (shown); Record of meeting or beating annual new-business quota of $600,000 or more (missing); Running the full sales cycle: discovery, demos, proposals, negotiation and closing (shown); Building own pipeline through outbound prospecting as well as inbound leads (missing); Keeping pipeline and forecast accurate in a CRM such as Salesforce or HubSpot (shown); Selling to several decision makers in one deal, including finance and operations leaders (missing); Bachelor's degree in business or a related field (shown) |
| `jt-sales-vague` | same | 5.0 | 2.0 | 0.0 | 0.0 | 0.2 | 7.2 | 2+ years as quota-carrying account executive selling B2B software (SaaS) (shown); Record of meeting or beating annual new-business quota of $600,000 or more (listed); Running the full sales cycle: discovery, product demos, proposals, negotiation and closing (shown); Building own pipeline through outbound prospecting as well as inbound leads (listed); Keeping pipeline and forecast accurate in a CRM such as Salesforce or HubSpot (shown); Selling to several decision makers in one deal, including finance and operations leaders (listed); Bachelor's degree in business or a related field (shown) |
| `jt-sales-related` | related | 3.0 | 1.4 | 1.0 | 0.0 | 0.2 | 4.6 | 2+ years as quota-carrying AE selling B2B SaaS (missing); Met or beat annual new-business quota of $600,000 or more (missing); Running full sales cycle: discovery, demos, proposals, negotiation, closing (missing); Building own pipeline through outbound prospecting and inbound leads (shown); Keeping pipeline and forecast accurate in CRM such as Salesforce or HubSpot (shown); Selling to several decision makers in one deal, incl. finance and operations leaders (listed); Bachelor's degree in business or a related field (shown) |
| `jt-sales-unrelated` | unrelated | 0.5 | 0.0 | 1.0 | 0.0 | 0.0 | 0.6 | 2 or more years as a quota-carrying account executive selling B2B software (SaaS) (missing); A record of meeting or beating an annual new-business quota of $600,000 or more (missing); Running the full sales cycle: discovery, product demos, proposals, negotiation and closing (missing); Building your own pipeline through outbound prospecting as well as inbound leads (missing); Keeping the pipeline and forecast accurate in a CRM such as Salesforce or HubSpot (missing); Selling to several decision makers in one deal, including finance and operations leaders (missing); A bachelor's degree in business or a related field (missing) |

## Comparisons

| Test | Comparison | Higher | Lower | Expected | Difference | Result |
|---|---|---|---|---|---|---|
| 8 | Software Engineer job: strong above mid | `jt-swe-strong` 9.5 | `jt-swe-mid` 7.7 | higher > lower | +1.8 | pass |
| 8 | Software Engineer job: strong above vague | `jt-swe-strong` 9.5 | `jt-swe-vague` 6.5 | higher > lower by 1.0+ | +3.0 | pass |
| 8 | Software Engineer job: mid above related | `jt-swe-mid` 7.7 | `jt-swe-related` 6.0 | higher > lower | +1.7 | pass |
| 8 | Software Engineer job: related above unrelated | `jt-swe-related` 6.0 | `jt-swe-unrelated` 0.6 | higher > lower | +5.4 | pass |
| 8 | Finance Manager job: strong above mid | `jt-finance-strong` 9.2 | `jt-finance-mid` 7.7 | higher > lower | +1.5 | pass |
| 8 | Finance Manager job: strong above vague | `jt-finance-strong` 9.2 | `jt-finance-vague` 6.7 | higher > lower by 1.0+ | +2.5 | pass |
| 8 | Finance Manager job: mid above related | `jt-finance-mid` 7.7 | `jt-finance-related` 4.6 | higher > lower | +3.1 | pass |
| 8 | Finance Manager job: related above unrelated | `jt-finance-related` 4.6 | `jt-finance-unrelated` 0.6 | higher > lower | +4.0 | pass |
| 8 | Registered Nurse job: strong above mid | `jt-nurse-strong` 8.9 | `jt-nurse-mid` 7.5 | higher > lower | +1.4 | pass |
| 8 | Registered Nurse job: strong above vague | `jt-nurse-strong` 8.9 | `jt-nurse-vague` 6.5 | higher > lower by 1.0+ | +2.4 | pass |
| 8 | Registered Nurse job: mid above related | `jt-nurse-mid` 7.5 | `jt-nurse-related` 4.1 | higher > lower | +3.4 | pass |
| 8 | Registered Nurse job: related above unrelated | `jt-nurse-related` 4.1 | `jt-nurse-unrelated` 0.6 | higher > lower | +3.5 | pass |
| 8 | Digital Marketing Manager job: strong above mid | `jt-marketing-strong` 9.2 | `jt-marketing-mid` 7.9 | higher > lower | +1.3 | pass |
| 8 | Digital Marketing Manager job: strong above vague | `jt-marketing-strong` 9.2 | `jt-marketing-vague` 6.2 | higher > lower by 1.0+ | +3.0 | pass |
| 8 | Digital Marketing Manager job: mid above related | `jt-marketing-mid` 7.9 | `jt-marketing-related` 4.7 | higher > lower | +3.2 | pass |
| 8 | Digital Marketing Manager job: related above unrelated | `jt-marketing-related` 4.7 | `jt-marketing-unrelated` 1.3 | higher > lower | +3.4 | pass |
| 8 | Account Executive job: strong above mid | `jt-sales-strong` 9.2 | `jt-sales-mid` 7.9 | higher > lower | +1.3 | pass |
| 8 | Account Executive job: strong above vague | `jt-sales-strong` 9.2 | `jt-sales-vague` 7.2 | higher > lower by 1.0+ | +2.0 | pass |
| 8 | Account Executive job: mid above related | `jt-sales-mid` 7.9 | `jt-sales-related` 4.6 | higher > lower | +3.3 | pass |
| 8 | Account Executive job: related above unrelated | `jt-sales-related` 4.6 | `jt-sales-unrelated` 0.6 | higher > lower | +4.0 | pass |

## Score bars

Each banded case's score under three settings of a job's two bars, applied after scoring as the app does (no model call). Only the default setting is graded. The job-types cases whose range is all inside one band (strong and unrelated) are held to that band here.

Not run (--only).

## Job types

Test 8: five kinds of job, five resumes each. Strong, mid and vague are the job's role (role floor 5.0); related does part of the same hands-on work; unrelated does none of it. The parts are shown before the start / 5 scaling.

### Software Engineer

| Resume | Case | Expected range | Score | Role match | Start | Skills | Evidence | Proof of work | Education | Result |
|---|---|---|---|---|---|---|---|---|---|---|
| strong | `jt-swe-strong` | 8.0 to 10.0 | 9.5 | same | 5.0 | 3.0 | 1.0 | 0.3 | 0.2 | pass |
| mid | `jt-swe-mid` | 5.0 to 8.4 | 7.7 | same | 5.0 | 1.5 | 1.0 | 0.0 | 0.2 | pass |
| vague | `jt-swe-vague` | 5.0 to 7.9 | 6.5 | same | 5.0 | 1.3 | 0.0 | 0.0 | 0.2 | pass |
| related | `jt-swe-related` | 2.5 to 6.9 | 6.0 | related | 3.5 | 2.4 | 1.0 | 0.0 | 0.2 | pass |
| unrelated | `jt-swe-unrelated` | 0.0 to 3.0 | 0.6 | unrelated | 0.5 | 0.0 | 1.0 | 0.0 | 0.0 | pass |

| Comparison | Higher | Lower | Expected | Difference | Result |
|---|---|---|---|---|---|
| Software Engineer job: strong above mid | `jt-swe-strong` 9.5 | `jt-swe-mid` 7.7 | higher > lower | +1.8 | pass |
| Software Engineer job: strong above vague | `jt-swe-strong` 9.5 | `jt-swe-vague` 6.5 | higher > lower by 1.0+ | +3.0 | pass |
| Software Engineer job: mid above related | `jt-swe-mid` 7.7 | `jt-swe-related` 6.0 | higher > lower | +1.7 | pass |
| Software Engineer job: related above unrelated | `jt-swe-related` 6.0 | `jt-swe-unrelated` 0.6 | higher > lower | +5.4 | pass |

### Finance Manager

| Resume | Case | Expected range | Score | Role match | Start | Skills | Evidence | Proof of work | Education | Result |
|---|---|---|---|---|---|---|---|---|---|---|
| strong | `jt-finance-strong` | 8.0 to 10.0 | 9.2 | same | 5.0 | 3.0 | 1.0 | 0.0 | 0.2 | pass |
| mid | `jt-finance-mid` | 5.0 to 8.4 | 7.7 | same | 5.0 | 1.5 | 1.0 | 0.0 | 0.2 | pass |
| vague | `jt-finance-vague` | 5.0 to 7.9 | 6.7 | same | 5.0 | 1.5 | 0.0 | 0.0 | 0.2 | pass |
| related | `jt-finance-related` | 2.5 to 6.9 | 4.6 | related | 3.0 | 1.5 | 1.0 | 0.0 | 0.2 | pass |
| unrelated | `jt-finance-unrelated` | 0.0 to 3.0 | 0.6 | unrelated | 0.5 | 0.0 | 1.0 | 0.3 | 0.0 | pass |

| Comparison | Higher | Lower | Expected | Difference | Result |
|---|---|---|---|---|---|
| Finance Manager job: strong above mid | `jt-finance-strong` 9.2 | `jt-finance-mid` 7.7 | higher > lower | +1.5 | pass |
| Finance Manager job: strong above vague | `jt-finance-strong` 9.2 | `jt-finance-vague` 6.7 | higher > lower by 1.0+ | +2.5 | pass |
| Finance Manager job: mid above related | `jt-finance-mid` 7.7 | `jt-finance-related` 4.6 | higher > lower | +3.1 | pass |
| Finance Manager job: related above unrelated | `jt-finance-related` 4.6 | `jt-finance-unrelated` 0.6 | higher > lower | +4.0 | pass |

### Registered Nurse

| Resume | Case | Expected range | Score | Role match | Start | Skills | Evidence | Proof of work | Education | Result |
|---|---|---|---|---|---|---|---|---|---|---|
| strong | `jt-nurse-strong` | 8.0 to 10.0 | 8.9 | same | 5.0 | 2.7 | 1.0 | 0.0 | 0.2 | pass |
| mid | `jt-nurse-mid` | 5.0 to 8.4 | 7.5 | same | 5.0 | 1.5 | 1.0 | 0.0 | 0.0 | pass |
| vague | `jt-nurse-vague` | 5.0 to 7.9 | 6.5 | same | 5.0 | 1.3 | 0.0 | 0.0 | 0.2 | pass |
| related | `jt-nurse-related` | 2.5 to 6.9 | 4.1 | related | 3.0 | 0.8 | 1.0 | 0.0 | 0.0 | pass |
| unrelated | `jt-nurse-unrelated` | 0.0 to 3.0 | 0.6 | unrelated | 0.5 | 0.0 | 1.0 | 0.0 | 0.0 | pass |

| Comparison | Higher | Lower | Expected | Difference | Result |
|---|---|---|---|---|---|
| Registered Nurse job: strong above mid | `jt-nurse-strong` 8.9 | `jt-nurse-mid` 7.5 | higher > lower | +1.4 | pass |
| Registered Nurse job: strong above vague | `jt-nurse-strong` 8.9 | `jt-nurse-vague` 6.5 | higher > lower by 1.0+ | +2.4 | pass |
| Registered Nurse job: mid above related | `jt-nurse-mid` 7.5 | `jt-nurse-related` 4.1 | higher > lower | +3.4 | pass |
| Registered Nurse job: related above unrelated | `jt-nurse-related` 4.1 | `jt-nurse-unrelated` 0.6 | higher > lower | +3.5 | pass |

### Digital Marketing Manager

| Resume | Case | Expected range | Score | Role match | Start | Skills | Evidence | Proof of work | Education | Result |
|---|---|---|---|---|---|---|---|---|---|---|
| strong | `jt-marketing-strong` | 8.0 to 10.0 | 9.2 | same | 5.0 | 3.0 | 1.0 | 0.0 | 0.2 | pass |
| mid | `jt-marketing-mid` | 5.0 to 8.4 | 7.9 | same | 5.0 | 1.7 | 1.0 | 0.0 | 0.2 | pass |
| vague | `jt-marketing-vague` | 5.0 to 7.9 | 6.2 | same | 5.0 | 1.0 | 0.0 | 0.0 | 0.2 | pass |
| related | `jt-marketing-related` | 2.5 to 6.9 | 4.7 | related | 3.0 | 1.7 | 1.0 | 0.0 | 0.2 | pass |
| unrelated | `jt-marketing-unrelated` | 0.0 to 3.0 | 1.3 | unrelated | 1.0 | 0.4 | 1.0 | 0.0 | 0.2 | pass |

| Comparison | Higher | Lower | Expected | Difference | Result |
|---|---|---|---|---|---|
| Digital Marketing Manager job: strong above mid | `jt-marketing-strong` 9.2 | `jt-marketing-mid` 7.9 | higher > lower | +1.3 | pass |
| Digital Marketing Manager job: strong above vague | `jt-marketing-strong` 9.2 | `jt-marketing-vague` 6.2 | higher > lower by 1.0+ | +3.0 | pass |
| Digital Marketing Manager job: mid above related | `jt-marketing-mid` 7.9 | `jt-marketing-related` 4.7 | higher > lower | +3.2 | pass |
| Digital Marketing Manager job: related above unrelated | `jt-marketing-related` 4.7 | `jt-marketing-unrelated` 1.3 | higher > lower | +3.4 | pass |

### Account Executive

| Resume | Case | Expected range | Score | Role match | Start | Skills | Evidence | Proof of work | Education | Result |
|---|---|---|---|---|---|---|---|---|---|---|
| strong | `jt-sales-strong` | 8.0 to 10.0 | 9.2 | same | 5.0 | 3.0 | 1.0 | 0.0 | 0.2 | pass |
| mid | `jt-sales-mid` | 5.0 to 8.4 | 7.9 | same | 5.0 | 1.7 | 1.0 | 0.0 | 0.2 | pass |
| vague | `jt-sales-vague` | 5.0 to 7.9 | 7.2 | same | 5.0 | 2.0 | 0.0 | 0.0 | 0.2 | pass |
| related | `jt-sales-related` | 2.5 to 6.9 | 4.6 | related | 3.0 | 1.4 | 1.0 | 0.0 | 0.2 | pass |
| unrelated | `jt-sales-unrelated` | 0.0 to 3.0 | 0.6 | unrelated | 0.5 | 0.0 | 1.0 | 0.0 | 0.0 | pass |

| Comparison | Higher | Lower | Expected | Difference | Result |
|---|---|---|---|---|---|
| Account Executive job: strong above mid | `jt-sales-strong` 9.2 | `jt-sales-mid` 7.9 | higher > lower | +1.3 | pass |
| Account Executive job: strong above vague | `jt-sales-strong` 9.2 | `jt-sales-vague` 7.2 | higher > lower by 1.0+ | +2.0 | pass |
| Account Executive job: mid above related | `jt-sales-mid` 7.9 | `jt-sales-related` 4.6 | higher > lower | +3.3 | pass |
| Account Executive job: related above unrelated | `jt-sales-related` 4.6 | `jt-sales-unrelated` 0.6 | higher > lower | +4.0 | pass |

### Filtering (no model)

Every resume text above through the real ATS check as a small PDF with no picture, and four negatives built in code from the strong nurse resume: email removed, phone removed, both removed, and one picture.

| Resume text | Expected | ATS status | Failed checks | Result |
|---|---|---|---|---|
| `jt-swe-strong` | ready | ready | none | pass |
| `jt-swe-mid` | ready | ready | none | pass |
| `jt-swe-vague` | ready | ready | none | pass |
| `jt-swe-related` | ready | ready | none | pass |
| `jt-swe-unrelated` | ready | ready | none | pass |
| `jt-finance-strong` | ready | ready | none | pass |
| `jt-finance-mid` | ready | ready | none | pass |
| `jt-finance-vague` | ready | ready | none | pass |
| `jt-finance-related` | ready | ready | none | pass |
| `jt-finance-unrelated` | ready | ready | none | pass |
| `jt-nurse-strong` | ready | ready | none | pass |
| `jt-nurse-mid` | ready | ready | none | pass |
| `jt-nurse-vague` | ready | ready | none | pass |
| `jt-nurse-related` | ready | ready | none | pass |
| `jt-nurse-unrelated` | ready | ready | none | pass |
| `jt-marketing-strong` | ready | ready | none | pass |
| `jt-marketing-mid` | ready | ready | none | pass |
| `jt-marketing-vague` | ready | ready | none | pass |
| `jt-marketing-related` | ready | ready | none | pass |
| `jt-marketing-unrelated` | ready | ready | none | pass |
| `jt-sales-strong` | ready | ready | none | pass |
| `jt-sales-mid` | ready | ready | none | pass |
| `jt-sales-vague` | ready | ready | none | pass |
| `jt-sales-related` | ready | ready | none | pass |
| `jt-sales-unrelated` | ready | ready | none | pass |
| `negative:no-email` | set aside on exactly: contact_info | set aside | contact_info | pass |
| `negative:no-phone` | set aside on exactly: phone | set aside | phone | pass |
| `negative:no-email-no-phone` | set aside on exactly: contact_info, phone | set aside | contact_info, phone | pass |
| `negative:picture` | set aside on exactly: picture | set aside | picture | pass |

## Speed and cost

Median 8.3 s and 95th percentile 11.0 s per call, over 25 calls. 91874 input and 37581 output tokens over 25 calls, $0.0280 at the gateway's rates.
