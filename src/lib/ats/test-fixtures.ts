/** Invented people and companies. Email addresses use the reserved example.com domain. */

export const CLEAN_RESUME = `Priya Natarajan
Senior Data Analyst
priya.natarajan@example.com | +44 20 7946 0000 | Leeds, United Kingdom

SUMMARY
Analyst with eight years of experience turning messy operational data into decisions that
finance and logistics teams act on. Comfortable with SQL, Python and dashboards.

WORK EXPERIENCE

Senior Data Analyst, Brightwater Logistics (2020 - present)
• Built the weekly delivery-performance report used by 40 depot managers.
• Cut report preparation time from two days to forty minutes by automating the pipeline.
• Led a team of three analysts; introduced code review for all SQL.

Data Analyst, Halden & Moore (2016 - 2020)
• Modelled customer churn for a £12m subscription business; the model flagged 70% of churners.
• Replaced twelve spreadsheets with one governed dataset.

EDUCATION

BSc Mathematics and Statistics, University of Northfield (2012 - 2016)
First-class honours. Dissertation on time-series forecasting.

SKILLS
SQL, Python, pandas, Tableau, dbt, Excel, stakeholder reporting, experiment design
`;

const CELL_RULE = "┌──────────────────────────┬──────────────────────────┐";
const CELL_BASE = "└──────────────────────────┴──────────────────────────┘";

/** A two-column resume exported as a table drawn with box and shade characters. Fails the layout noise and standard sections checks. */
export const TWO_COLUMN_TABLE_RESUME = [
  "Marcus Oyelaran",
  "marcus.oyelaran@example.com",
  "+44 20 7946 0002",
  CELL_RULE,
  "│ ▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒ │ ▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒ │",
  "│ EXPERIENCE               │ SKILLS                   │",
  "├──────────────────────────┼──────────────────────────┤",
  "│ Sales Lead, Cobalt Retail│ ■ Negotiation            │",
  "│ 2019 - present           │ ■ CRM                    │",
  "│ ■ Grew regional revenue  │ ■ Forecasting            │",
  "│ ■ Hired 6 reps           │ ■ Coaching               │",
  "├──────────────────────────┼──────────────────────────┤",
  "│ ▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒ │ ▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒ │",
  "│ EDUCATION                │ LANGUAGES                │",
  "├──────────────────────────┼──────────────────────────┤",
  "│ BA Business, Eastbrook   │ ■ English  ■ Yoruba      │",
  "│ University, 2014 - 2018  │ ■ French                 │",
  "│ ▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒ │ ▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒ │",
  CELL_BASE,
  "│ ▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒ │ ▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒ │",
  "│ ▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒ │ ▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒ │",
  CELL_BASE,
].join("\n");

/** A scanned resume: almost no readable text, only whitespace and a form feed. */
export const SCANNED_RESUME = "Scan 0001\n\n\u00A0\n  \f";

/** A resume exported as a table drawn with pipes, dashes and underscores. Fails the layout noise check. */
export const ASCII_TABLE_RESUME = [
  "Tomas Eriksen",
  "tomas.eriksen@example.com",
  "+44 20 7946 0003",
  "+------------------------+-----------------------+",
  "| EXPERIENCE             | SKILLS                |",
  "+========================+=======================+",
  "| Site Engineer, Fjord   | Estimating            |",
  "| Builders, 2018 - now   | Scheduling            |",
  "| Managed 12 projects    | Safety audits         |",
  "+------------------------+-----------------------+",
  "| EDUCATION              | LANGUAGES             |",
  "+========================+=======================+",
  "| BEng Civil Engineering | Norwegian, English    |",
  "| Northern Institute     | German                |",
  "+------------------------+-----------------------+",
  "| ______________________ | _____________________ |",
  "| ______________________ | _____________________ |",
  "+------------------------+-----------------------+",
].join("\n");

/** A clean resume full of text that looks like noise but is ordinary (C++, C#, URLs, percentages, ampersands, dotted leaders). Passes every check. */
export const RICH_CLEAN_RESUME = `Dara Okonkwo-Reyes
Staff Engineer | dara.okonkwo@example.org | +44 20 7946 0001 | (555) 010-9999
https://github.com/dara-example/portfolio  https://www.example.org/in/dara

CONTENTS
Experience ........ 1
Education ......... 2
Skills ............ 2

EXPERIENCE
Staff Engineer, Lumen & Pike (2019 - present)
- Rewrote the C++ rendering core and the C# build tooling; frame time fell by 38%.
- Led R&D with a £1.2m budget; shipped 14 releases on schedule (100% on time).
- Mentored 6 engineers; e.g. onboarding took 3 weeks, now 5 days.

Engineer, Orchard Systems (2014 - 2019)
- Built the data layer in Python and SQL; cut query cost by 60%.

EDUCATION
MSc Computer Science, Westmarch University (2012 - 2014)

SKILLS
C++, C#, Python, SQL, Rust, CI/CD, Kubernetes, Terraform, R&D planning
`;
