# Flat Finder — Investor Brief

## One-line pitch

Flat Finder is an AI real-estate decision platform that researches fragmented property information, compares options and calculates the real cost so users can make one confident housing decision.

## Problem

Property discovery is fragmented.

A buyer or renter may need:
- multiple property portals
- developer websites
- government/regulatory sources
- maps
- commute tools
- mortgage/EMI calculators
- tax and purchase-cost information
- spreadsheets
- reviews and local research

The user is forced to become the analyst.

## Solution

Flat Finder turns one natural-language request into a research workflow.

Example:

> Find a 2-bedroom home in Dubai under $400k, near metro, good for investment, and compare the best options.

Flat Finder:
1. understands the requirements
2. researches permitted sources
3. extracts structured facts
4. cross-checks information
5. calculates costs and metrics
6. ranks candidates
7. explains the recommendation
8. links back to evidence

## Why now

Generative AI can finally understand complex housing requirements and synthesize fragmented information. The opportunity is to build a trusted decision layer on top of the existing real-estate information ecosystem.

## Product differentiation

Traditional portals optimize for listing inventory.

Flat Finder optimizes for the user's decision.

The product is not:
"Here are 500 listings."

It is:
"Here are the best options for your exact situation, here is why, here is what it will really cost, and here is what you should verify."

## Business model

Potential future revenue:
- Free tier
- Pro subscription
- Premium investment analysis
- Property professionals / agent plans
- Developer lead generation
- B2B market intelligence
- API/research products

Do not prioritize monetization before product-market evidence.

## Technology

- Vite frontend
- Vercel hosting
- Supabase auth/database
- OpenAI research and reasoning
- Mapbox maps/geocoding/routing
- Licensed/public web sources
- Deterministic financial calculation engine

## Data strategy

Flat Finder does not need to own a giant global property database.

Primary information layer:
- official sources
- permitted public web
- licensed property feeds
- developer sources
- government/regulatory sources
- user-provided URLs/documents

Supabase stores application state and selected research cache rather than trying to replicate the world's property inventory.

## Initial markets

India
UAE
UK
USA

The architecture is global from day one.

## Moat

The long-term moat is the combination of:
- user intent understanding
- research orchestration
- source verification
- normalized property facts
- financial/location calculations
- personalized ranking
- user decision history

Over time, this creates a proprietary decision graph rather than a simple listing database.

## 90-day roadmap

### 0–30 days
AI search
Web research
Source extraction
Candidate normalization
International UI
Basic maps
Basic calculations

### 31–60 days
Comparison
Saved searches
User preferences
Affordability
Rent-vs-buy
Country/currency expansion
Research caching

### 61–90 days
Alerts
Pro subscription
Analytics
Investor-grade reporting
More markets
Licensed data integrations

## Investor demo story

Start with one sentence.

Show the AI understanding it.

Show research sources.

Show 3–5 candidates.

Show the comparison.

Show financial calculations.

End with:
"Flat Finder doesn't ask the user to research real estate. It researches real estate for them."

## Important caveat

The product should clearly distinguish verified source information, calculations, estimates and facts that require user verification. Legal/tax information must be presented with source dates and appropriate caveats.
