# Flat Finder — Free Launch Plan

## Launch positioning

Flat Finder is free for everyone during the launch period. The product should not require an account, subscription, payment method or paid plan to use the core discovery and AI research experience.

The launch promise is:

> Search naturally. Research smarter. Compare with confidence.

## What is free at launch

- Global natural-language property research
- Source-linked web research
- Candidate comparison
- AI match scoring
- Research explanations and verification warnings
- Basic shortlist/compare experience
- Global location and currency presentation
- Mobile-first web experience

## What is intentionally not monetized yet

Do not add a paywall, forced sign-in, payment gateway or premium lock to the core experience while we validate demand.

Future monetization can be introduced only after usage and user feedback show where people receive enough value to pay.

## Future plans

Potential paid layers:

1. Flat Finder Pro — deeper financial analysis, saved searches, alerts and advanced comparisons.
2. Investor Intelligence — rental yield, financing scenarios, market research and investment reports.
3. Professional — tools for agents, brokers, developers and property teams.
4. B2B/API — research and decision intelligence for other products.
5. Lead generation — qualified property/developer leads where legally and commercially appropriate.

## Engineering rule

The free launch must be a real product, not a marketing page. The primary loop is:

User request → permitted web research → source extraction → candidate normalization → confidence/freshness checks → calculations → ranking → explanation → sources.

We should avoid building a giant global proprietary property database. The internet, official sources, permitted public data and licensed feeds should remain the primary information layer. Supabase can store application state, user preferences, saved searches, cached research and normalized data where appropriate.

## Cost-control rule

Free to the user does not mean zero infrastructure cost. During the launch period we should:

- keep the UI open without authentication;
- protect the AI endpoint from abuse;
- cache repeated research where appropriate;
- use efficient models for routine tasks;
- monitor web-search/API spend;
- introduce fair-use limits only if abuse or infrastructure cost requires them;
- never expose API keys in the browser.

Any future limits should be communicated clearly rather than silently degrading results.

## Investor message

The launch is intentionally free because the first goal is product validation, not immediate revenue. We want to prove that people will replace fragmented property research with an AI decision workflow.

The business model comes after the behavior is proven.
