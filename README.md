# Project Title

**Claims Investigation Intelligence Assistant for Medicare Part B Professional Claims**

## Developer Quick Start

This repository has two runnable applications:

- `backend/`: FastAPI API, scoring, evidence retrieval, and investigation orchestration
- `frontend/`: Next.js review workbench

Primary developer docs:

- `backend/README.md`
- `frontend/README.md`

### Start the Backend

```powershell
cd backend
uv sync --extra dev
Copy-Item .env.example .env
uv run app/main.py
```

The backend listens on `http://127.0.0.1:8000` by default.

### Start the Frontend

```powershell
cd frontend
bun install
bun run dev
```

The frontend listens on `http://localhost:3000` by default.

### Frontend Env File

`frontend/.env.example` is now committed for the frontend.

- You do not need a frontend env file for the default local setup.
- Without `.env.local`, browser requests stay on `/api/...` and Next.js proxies them to the backend on `http://127.0.0.1:8000`.
- Copy `frontend/.env.example` to `frontend/.env.local` only when you need to point the frontend at a different backend origin.
- Leave `NEXT_PUBLIC_API_BASE_URL` unset unless the browser must call the backend directly.

### Default Local URLs

- Frontend: `http://localhost:3000`
- Backend: `http://127.0.0.1:8000`
- Backend health: `http://127.0.0.1:8000/api/health`

## Background / Business Context

Improper payments in U.S. public health programs are a documented and material problem. The U.S. Government Accountability Office (GAO) reported that the Department of Health and Human Services estimated **over $100 billion in improper payments across Medicare and Medicaid in fiscal year 2023**.[1] CMS's own Comprehensive Error Rate Testing (CERT) program further reported that the **Medicare Fee-for-Service improper payment rate was 6.55% ($28.83 billion) in fiscal year 2025**, and that **Part B provider claims accounted for an 8.44% improper payment rate ($9.62 billion)**.[2]

This project focuses on **Medicare Part B professional claims**, meaning claims for physicians' services, outpatient hospital services, and other outpatient medical services covered under Medicare Part B.[3] This claims category is appropriate for the project because CMS already evaluates such claims under formal **coverage, coding, billing, and documentation rules**, making it a strong fit for an investigation-support solution.[2]

This problem is also strategically relevant to **Abacus Insights**. Abacus publicly positions itself as a healthcare data usability platform built specifically for U.S. payers, with a unified data foundation that helps standardize analytics on data and business rules and supports broad operational and analytical use cases.[7] Abacus also states that its data solutions are designed to deliver transformed and validated data for payer business functions and faster decision-making.[8] Most directly, Abacus's March 23, 2026 partnership announcement with CoverSelf states that the combined capability strengthens payment integrity by using structured and unstructured data assets, including claims history, clinical records, and longitudinal member information, to surface cost-containment opportunities earlier in the claims lifecycle and help payers catch billing anomalies, coding patterns, and clinical inconsistencies before payment.[9] In that context, this project is a relevant prototype for demonstrating how an AI-assisted investigation workflow could align with Abacus Insights' publicly stated focus on usable payer data, operational transparency, and payment integrity.

## Evidence Supporting the Problem

- **Scale of the problem:** GAO states that Medicare and Medicaid together accounted for **over $100 billion** in improper payments in fiscal year 2023.[1]
- **Direct relevance to Part B claims:** CMS reports that **Part B provider claims** alone represented **$9.62 billion** in improper payments in fiscal year 2025.[2]
- **Claims are reviewed against formal payment rules:** CMS states that CERT reviews Medicare Fee-for-Service claims to determine whether they were paid properly under **Medicare coverage, coding, and billing rules**.[2]
- **Documentation and medical necessity are major error drivers:** CMS states that the majority of Medicare Fee-for-Service improper payments fall into **insufficient documentation** and cases where documentation does not sufficiently demonstrate **medical necessity**.[4]
- **Coding accuracy is a recognized control point:** CMS states that the National Correct Coding Initiative (NCCI) was developed to promote correct coding of **Medicare Part B claims**, and that NCCI Procedure-to-Procedure edits exist to **prevent improper payment when incorrect code combinations are reported**.[5]
- **Professional services are historically vulnerable to coding and documentation errors:** HHS OIG reported that Medicare inappropriately paid **$6.7 billion** for Evaluation and Management claims in 2010 due to **incorrect coding and/or insufficient documentation**, showing that physician-billed professional services are a real payment-integrity risk area.[6]

## Problem Statement

The validated business problem is that Medicare Part B professional claims are subject to significant improper payments, and their review depends on applying coverage, coding, billing, and documentation requirements correctly. CMS and HHS evidence shows that improper payments in this domain are driven in large part by documentation deficiencies, medical necessity issues, and coding errors rather than by a single failure point.[2][4][6]

As a result, there is a legitimate need for a focused investigation-support solution that can help reviewers identify suspicious claims, check them against relevant coding and policy rules, and assemble evidence in a more structured and explainable way. This is a payment integrity support problem, not a generic or assumed AI use case.

## Objective

The objective of this project is to design and demonstrate an **AI-powered Claims Investigation Intelligence Assistant** for Medicare Part B professional claims. The system will support early-stage review by combining deterministic rule checks, machine learning-based risk scoring, and evidence retrieval from public CMS policy and coding resources.

The project is intended to show how an AI-assisted workflow can help organize claim-level evidence and support human investigators with transparent, citation-backed rationales. Final decisions will remain with the human reviewer.

## Scope

### In Scope

- Medicare Part B professional claims, specifically physician and clinician-billed outpatient services
- Three focused anomaly categories for prototype investigation support:
  - upcoding
  - NCCI code-pair violations
  - duplicate billing
- Deterministic checks against structured coding and billing rules
- ML-based claim risk scoring for prioritization
- Retrieval of supporting evidence from public CMS policy and coding sources
- Generation of structured investigation summaries with citations
- A user-facing workflow for claim review, investigation, and human action

### Out of Scope

- Real PHI/PII handling or HIPAA-compliant production deployment
- Integration with live payer adjudication systems
- Full enterprise payment integrity coverage across all claim types
- Provider dispute resolution or downstream audit operations
- Use of private payer policy libraries
- Final automated claim denial decisions without human review

## Expected Deliverable / Intended Outcome

The deliverable will be a working prototype that demonstrates a credible, evidence-grounded approach to supporting payment integrity review for Medicare Part B professional claims. The intended outcome is not to prove production fraud detection performance, but to show that a structured AI-assisted workflow can combine risk signals, coding checks, and public policy evidence into a single investigation experience.

## Key Constraints / Assumptions

- The project is a capability demonstration built on synthetic claims data, not a production payment integrity system.
- Evidence retrieval is limited to publicly available CMS and other government sources.
- Improper payments are not the same as fraud; the project addresses investigation support, not fraud adjudication.[4]
- Human-in-the-loop review is a core requirement.

## References

[1] GAO, _Medicare and Medicaid: Additional Actions Needed to Enhance Program Integrity and Save Billions_ (Apr. 16, 2024): https://www.gao.gov/products/gao-24-107487  
[2] CMS, _Comprehensive Error Rate Testing (CERT)_ (last modified Jan. 16, 2026): https://www.cms.gov/data-research/monitoring-programs/improper-payment-measurement-programs/comprehensive-error-rate-testing-cert  
[3] CMS, _2025 Medicare Parts A & B Premiums and Deductibles_ (Nov. 8, 2024): https://www.cms.gov/newsroom/fact-sheets/2025-medicare-parts-b-premiums-and-deductibles  
[4] CMS, _Fiscal Year 2024 Improper Payments Fact Sheet_ (Nov. 15, 2024): https://www.cms.gov/newsroom/fact-sheets/fiscal-year-2024-improper-payments-fact-sheet  
[5] CMS, _NCCI for Medicare_ (accessed from CMS site, current as surfaced in 2026): https://www.cms.gov/medicare/coding-billing/national-correct-coding-initiative-ncci-edits  
[6] HHS OIG, _Improper Payments for Evaluation and Management Services Cost Medicare Billions in 2010_ (May 28, 2014): https://oig.hhs.gov/reports/all/2014/improper-payments-for-evaluation-and-management-services-cost-medicare-billions-in-2010/  
[7] Abacus Insights, _Abacus Insights Overview_ (company overview PDF surfaced from abacusinsights.com): https://abacusinsights.com/wp-content/uploads/2021/07/Abacus-Insights-Overview-Slick_Aug-update-vF.pdf  
[8] Abacus Insights, _Data Solutions_: https://abacusinsights.com/solutions/data-solutions/  
[9] Abacus Insights, _Abacus Insights and CoverSelf Partner to Strengthen Payment Integrity for U.S. Health Plans_ (Mar. 23, 2026): https://abacusinsights.com/abacus-insights-and-coverself-partner-to-strengthen-payment-integrity/
