# Model comparison: jobtypes-haiku vs jobtypes-fable, 2026-11-15

| | jobtypes-haiku | jobtypes-fable |
|---|---|---|
| Model | anthropic/claude-haiku-5.5 | anthropic/claude-fable-5.2 |
| Prompt version | `2d2468ff` | `2d2468ff` |
| Run on | 2026-11-15 | 2026-11-15 |
| Tests run | 8 (--only 8) | 8 (--only 8) |
| Cost | $0.0280 over 25 calls | $1.3042 over 25 calls |
| Median speed | 8.3 s per call | 16.3 s per call |

Every score is on the 0.0 to 10.0 scale; a difference is jobtypes-fable minus jobtypes-haiku.

## Summary

| | |
|---|---|
| Cases in both runs | 25 (17 scored in both) |
| Mean absolute difference | 0.25 |
| Largest difference | -0.7 (`jt-nurse-related`) |
| Cases differing by more than 1.0 | 0 |
| Same within-job order for every job (test 8) | no |

## Within-job order (test 8)

| Job | Order in jobtypes-haiku | Order in jobtypes-fable | Same order |
|---|---|---|---|
| Software Engineer | `jt-swe-strong` 9.5 > `jt-swe-mid` 7.7 > `jt-swe-vague` 6.5 > `jt-swe-related` 6.0 > `jt-swe-unrelated` 0.6 | `jt-swe-strong` 9.5 > `jt-swe-mid` 7.7 > `jt-swe-vague` 6.5 > `jt-swe-related` none > `jt-swe-unrelated` 0.0 | n/a (a score is missing) |
| Finance Manager | `jt-finance-strong` 9.2 > `jt-finance-mid` 7.7 > `jt-finance-vague` 6.7 > `jt-finance-related` 4.6 > `jt-finance-unrelated` 0.6 | `jt-finance-strong` 9.2 > `jt-finance-mid` 7.7 > `jt-finance-vague` 6.6 > `jt-finance-unrelated` 0.6 > `jt-finance-related` none | n/a (a score is missing) |
| Registered Nurse | `jt-nurse-strong` 8.9 > `jt-nurse-mid` 7.5 > `jt-nurse-vague` 6.5 > `jt-nurse-related` 4.1 > `jt-nurse-unrelated` 0.6 | `jt-nurse-strong` 9.2 > `jt-nurse-mid` 8.1 > `jt-nurse-vague` 6.8 > `jt-nurse-related` 3.4 > `jt-nurse-unrelated` 0.0 | yes |
| Digital Marketing Manager | `jt-marketing-strong` 9.2 > `jt-marketing-mid` 7.9 > `jt-marketing-vague` 6.2 > `jt-marketing-related` 4.7 > `jt-marketing-unrelated` 1.3 | `jt-marketing-strong` 9.2 > `jt-marketing-mid` 7.9 > `jt-marketing-vague` 6.6 > `jt-marketing-unrelated` 0.7 > `jt-marketing-related` none | n/a (a score is missing) |
| Account Executive | `jt-sales-strong` 9.2 > `jt-sales-mid` 7.9 > `jt-sales-vague` 7.2 > `jt-sales-related` 4.6 > `jt-sales-unrelated` 0.6 | `jt-sales-strong` none = `jt-sales-mid` none = `jt-sales-vague` none = `jt-sales-related` none = `jt-sales-unrelated` none | n/a (a score is missing) |

## Every case in both runs

| Case | Test | Job | jobtypes-haiku | jobtypes-fable | Difference |
|---|---|---|---|---|---|
| `jt-swe-strong` | 8 | software-engineer | 9.5 | 9.5 | 0.0 |
| `jt-swe-mid` | 8 | software-engineer | 7.7 | 7.7 | 0.0 |
| `jt-swe-vague` | 8 | software-engineer | 6.5 | 6.5 | 0.0 |
| `jt-swe-related` | 8 | software-engineer | 6.0 | none | n/a |
| `jt-swe-unrelated` | 8 | software-engineer | 0.6 | 0.0 | -0.6 |
| `jt-finance-strong` | 8 | finance-manager | 9.2 | 9.2 | 0.0 |
| `jt-finance-mid` | 8 | finance-manager | 7.7 | 7.7 | 0.0 |
| `jt-finance-vague` | 8 | finance-manager | 6.7 | 6.6 | -0.1 |
| `jt-finance-related` | 8 | finance-manager | 4.6 | none | n/a |
| `jt-finance-unrelated` | 8 | finance-manager | 0.6 | 0.6 | 0.0 |
| `jt-nurse-strong` | 8 | registered-nurse | 8.9 | 9.2 | +0.3 |
| `jt-nurse-mid` | 8 | registered-nurse | 7.5 | 8.1 | +0.6 |
| `jt-nurse-vague` | 8 | registered-nurse | 6.5 | 6.8 | +0.3 |
| `jt-nurse-related` | 8 | registered-nurse | 4.1 | 3.4 | -0.7 |
| `jt-nurse-unrelated` | 8 | registered-nurse | 0.6 | 0.0 | -0.6 |
| `jt-marketing-strong` | 8 | marketing-manager | 9.2 | 9.2 | 0.0 |
| `jt-marketing-mid` | 8 | marketing-manager | 7.9 | 7.9 | 0.0 |
| `jt-marketing-vague` | 8 | marketing-manager | 6.2 | 6.6 | +0.4 |
| `jt-marketing-related` | 8 | marketing-manager | 4.7 | none | n/a |
| `jt-marketing-unrelated` | 8 | marketing-manager | 1.3 | 0.7 | -0.6 |
| `jt-sales-strong` | 8 | account-executive | 9.2 | none | n/a |
| `jt-sales-mid` | 8 | account-executive | 7.9 | none | n/a |
| `jt-sales-vague` | 8 | account-executive | 7.2 | none | n/a |
| `jt-sales-related` | 8 | account-executive | 4.6 | none | n/a |
| `jt-sales-unrelated` | 8 | account-executive | 0.6 | none | n/a |
