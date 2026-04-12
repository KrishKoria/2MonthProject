"""Generate synthetic policy/NCCI content where real public data is unavailable.

Idempotent. Fills any gaps after fetch_public_data.py:
- CPT/HCPCS descriptors (always synthetic — AMA copyright on CPT)
- CMS manual supplement (synthetic) if real chapters missing or thin
- Fraud-guidance supplement if real OIG PDFs missing or thin
- NCCI CSV fallback if real scrape failed

The synthetic content is labeled as SYNTHETIC at the top of each file so RAG
citations can always be traced back to real vs synthetic provenance.

Usage:
    uv run python -m scripts.generate_synthetic_corpus
"""

from __future__ import annotations

import csv
import logging
import random
import sys
from pathlib import Path

from app.config import settings

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s - %(message)s")
logger = logging.getLogger("generate_synthetic_corpus")

RNG = random.Random(42)

MIN_BYTES_PER_FILE = 4000
MIN_CMS_TOTAL_BYTES = 40_000
MIN_FRAUD_TOTAL_BYTES = 15_000


# ---------------------------------------------------------------------------
# Helpers


def _dir_bytes(d: Path) -> int:
    if not d.exists():
        return 0
    return sum(p.stat().st_size for p in d.rglob("*.txt") if p.is_file())


def _write(path: Path, content: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")
    logger.info("Wrote %s (%d bytes)", path, path.stat().st_size)


# ---------------------------------------------------------------------------
# CPT / HCPCS descriptor corpus (always synthetic — AMA copyright)

EM_TIERS = [
    ("99202", "New patient office visit — straightforward problem, ~15 min, limited history/exam, minimal MDM."),
    ("99203", "New patient office visit — low-complexity problem, ~30 min, expanded history, low MDM."),
    ("99204", "New patient office visit — moderate-complexity problem, ~45 min, detailed history/exam, moderate MDM."),
    ("99205", "New patient office visit — high-complexity problem, ~60 min, comprehensive history/exam, high MDM."),
    ("99212", "Established patient office visit — minor problem, ~10 min, problem-focused, minimal MDM."),
    ("99213", "Established patient office visit — low-complexity problem, ~15 min, expanded history, low MDM."),
    ("99214", "Established patient office visit — moderate-complexity problem, ~25 min, detailed history, moderate MDM."),
    ("99215", "Established patient office visit — high-complexity problem, ~40 min, comprehensive history, high MDM."),
]

PROCEDURE_SAMPLES = [
    ("11102", "Tangential biopsy of skin, single lesion."),
    ("11104", "Punch biopsy of skin, single lesion."),
    ("12001", "Simple repair of superficial wound, 2.5 cm or less."),
    ("17000", "Destruction of premalignant lesion, first lesion."),
    ("20610", "Arthrocentesis, aspiration, major joint or bursa."),
    ("36415", "Collection of venous blood by venipuncture."),
    ("71045", "Radiologic exam, chest, single view."),
    ("71046", "Radiologic exam, chest, two views."),
    ("73030", "Radiologic exam, shoulder, minimum of two views."),
    ("80053", "Comprehensive metabolic panel."),
    ("80061", "Lipid panel — cholesterol, HDL, triglycerides."),
    ("83036", "Hemoglobin A1C measurement."),
    ("85025", "Complete blood count with automated differential."),
    ("93000", "Electrocardiogram, routine, with interpretation and report."),
    ("93306", "Transthoracic echocardiogram with Doppler, complete."),
    ("96372", "Therapeutic, prophylactic, or diagnostic injection — SC/IM."),
    ("97110", "Therapeutic exercise — 15-minute increment of physical therapy."),
    ("99406", "Smoking cessation counseling, 3–10 minutes."),
]


def generate_cpt_descriptors() -> None:
    out_dir = settings.policy_docs_dir / "hcpcs_descriptions"
    out_dir.mkdir(parents=True, exist_ok=True)

    header = (
        "SYNTHETIC corpus — paraphrased procedure code descriptions for a synthetic\n"
        "demo environment. Not AMA CPT reference material.\n\n"
    )

    em_text = [
        header,
        "Evaluation and Management (E/M) Office Visits — Tier Descriptions\n\n",
        (
            "The E/M level reflects the complexity of medical decision making (MDM), the depth of "
            "history and examination, and the total time. Upcoding occurs when a claim reports a "
            "higher-tier E/M code than the clinical documentation supports. Common patterns:\n"
            "  - Routine follow-up billed as 99214 or 99215 without moderate/high MDM.\n"
            "  - New-patient codes (99202-99205) billed for established patients.\n"
            "  - Repeated use of the highest tier by a single provider across unrelated patients.\n\n"
        ),
    ]
    for code, desc in EM_TIERS:
        em_text.append(f"CPT {code}: {desc}\n")
    em_text.append(
        "\nDocumentation supporting higher-tier codes must include: chief complaint, "
        "history of present illness with 4+ elements, review of systems, past medical/family/social "
        "history, physical examination findings, assessment, and plan. Absence of these elements in "
        "the medical record is a red flag for upcoding.\n"
    )
    _write(out_dir / "em_tier_descriptions.txt", "".join(em_text))

    proc_text = [header, "Common Outpatient Procedure Codes — Descriptions\n\n"]
    for code, desc in PROCEDURE_SAMPLES:
        proc_text.append(f"HCPCS/CPT {code}: {desc}\n")
    proc_text.append(
        "\nProcedure codes must be billed consistent with the place-of-service and the "
        "practitioner's scope. Modifier use (25, 59, 76, 77, 91) signals distinct services and is a "
        "frequent target of audits when used to bypass NCCI edits.\n"
    )
    _write(out_dir / "procedure_code_descriptions.txt", "".join(proc_text))

    modifiers_text = header + """Modifier Reference for E/M + Procedure Bundling

Modifier 25 — Significant, separately identifiable E/M service on the same day as a procedure.
The E/M must be above and beyond the usual pre-procedure work. Routine use of modifier 25 to bill
an E/M alongside every minor procedure is a known upcoding pattern.

Modifier 59 — Distinct procedural service. Used to unbundle procedures that would otherwise be
considered mutually exclusive by NCCI edits. CMS considers modifier 59 the most-abused modifier
and has introduced X{E,S,P,U} modifiers to improve specificity.

Modifier 76 — Repeat procedure or service by same physician on the same day.
Modifier 77 — Repeat procedure by different physician on same day.
Modifier 91 — Repeat clinical diagnostic laboratory test performed on the same day to obtain
subsequent reportable test values.

Duplicate-claim indicators include identical claim_id roots, overlapping service dates within
one to three days, identical procedure code sets, and the absence of any repeat modifier.
"""
    _write(out_dir / "modifiers_and_duplicates.txt", modifiers_text)


# ---------------------------------------------------------------------------
# Synthetic CMS-style manual supplement

CMS_SUPPLEMENT_SECTIONS = [
    (
        "em_visit_coding_synthetic",
        "Evaluation and Management (E/M) Service Coding — Synthetic Reference",
        """Chapter 12 synthetic supplement — Physicians and Nonphysician Practitioners

Section 30.6 — Evaluation and Management Service Codes - General (Synthetic)

The level of an E/M service depends on the extent of medical decision making (MDM) or the total
time spent on the date of the encounter. Documentation must support the billed level. The 2021
and 2023 guidelines removed history and examination from level-selection criteria for office and
other outpatient services (99202-99215); selection is now based on MDM or time.

Section 30.6.1 — Selecting the Level (Synthetic)
A claim that reports CPT 99215 (high-complexity established patient visit) without documentation
of a high-risk problem, extensive data review, or high MDM is considered upcoded. When the
pattern is systematic across a provider's panel — for example, 99215 billed for >40% of
established-patient visits — CMS contractors are expected to open a prepayment review.

Section 30.6.2 — Time-Based Billing (Synthetic)
Time-based billing requires documentation of total time on the date of service including
pre-visit review, patient encounter, documentation, and post-visit coordination. Time ranges per
code:
  99212: 10-19 min   99213: 20-29 min   99214: 30-39 min   99215: 40-54 min
  99202: 15-29 min   99203: 30-44 min   99204: 45-59 min   99205: 60-74 min

Section 30.6.3 — Modifier 25 Use (Synthetic)
A separately identifiable E/M service on the same day as a procedure requires its own
documentation. Routine use of modifier 25 to pair an E/M with every minor procedure is a
compliance risk.
""",
    ),
    (
        "ncci_edits_policy_synthetic",
        "NCCI Procedure-to-Procedure Edits — Policy Guidance (Synthetic)",
        """Chapter 23 synthetic supplement — Fee Schedule Administration

Section 20 — National Correct Coding Initiative (NCCI) Policy (Synthetic)

NCCI Procedure-to-Procedure (PTP) edits identify code pairs that cannot be reported together for
the same beneficiary on the same date of service by the same provider. Column 1 is the
comprehensive code; Column 2 is the component that is bundled into Column 1.

Section 20.1 — Modifier Indicator (Synthetic)
Each edit has a modifier indicator:
  0 — not allowed: the edit cannot be bypassed by a modifier.
  1 — allowed: an NCCI-associated modifier (25, 59, X{E,S,P,U}, 76, 77, 91) may bypass the edit
      when clinical circumstances justify it.
  9 — not applicable: historical edit, no current effect.

Section 20.2 — Common Unbundling Patterns (Synthetic)
  - Reporting a surgical incision (Column 2) alongside the comprehensive procedure (Column 1).
  - Reporting a biopsy alongside a definitive excision of the same lesion.
  - Reporting bilateral-procedure components separately without modifier 50.
  - Reporting labs that are components of a comprehensive panel (CBC + differential alongside
    85025, for example).

Section 20.3 — Audit Flags (Synthetic)
A claim with a Column 1 + Column 2 pair on the same service date, with no bypass modifier and a
modifier indicator of 0 or 1, should be flagged for denial or review. Providers with sustained
>5% NCCI hit rates across a rolling quarter warrant targeted review.
""",
    ),
    (
        "duplicate_claim_policy_synthetic",
        "Duplicate Claim Detection — Policy Guidance (Synthetic)",
        """Chapter 1 synthetic supplement — General Billing Requirements

Section 80.3 — Duplicate Claim Review (Synthetic)

A duplicate claim is one that substantially replicates a previously submitted claim for the
same beneficiary, provider, service date, and procedure set without a valid repeat-service
modifier. Contractors perform duplicate detection at intake and prior to payment.

Section 80.3.1 — Exact Duplicate (Synthetic)
Same member, same provider, same service date, same procedure codes, same modifiers. Denied
automatically with remark N111 / duplicate of a previously submitted claim.

Section 80.3.2 — Near-Duplicate (Synthetic)
Same member, same provider, overlapping service dates within ±1-3 days, identical or
near-identical procedure sets, no repeat modifier. Routed for manual review. A near-duplicate
pattern with service-date offsets consistently at ±1 day and no clinical basis for repeat
services is considered a fraud indicator.

Section 80.3.3 — Legitimate Repeat Services (Synthetic)
Modifiers 76 (same provider repeat), 77 (different provider repeat), and 91 (repeat lab test)
identify legitimate repeat services. Documentation must establish medical necessity for the
repeat.
""",
    ),
]


def generate_cms_supplement_if_thin() -> None:
    cms_dir = settings.policy_docs_dir / "cms_claims_manual"
    if _dir_bytes(cms_dir) >= MIN_CMS_TOTAL_BYTES:
        logger.info("CMS claims manual dir already has %d bytes — skipping synthetic supplement", _dir_bytes(cms_dir))
        return
    for slug, title, body in CMS_SUPPLEMENT_SECTIONS:
        header = f"SYNTHETIC supplement — {title}\n\n"
        _write(cms_dir / f"{slug}.txt", header + body)


# ---------------------------------------------------------------------------
# Synthetic fraud-guidelines supplement

FRAUD_SECTIONS = [
    (
        "fraud_alert_em_upcoding_synthetic",
        """Synthetic Fraud Alert — E/M Upcoding Patterns

Upcoding E/M office visits is a leading cause of improper Medicare payments. Indicators include:

  - A single provider whose 99214+99215 share of established-patient visits exceeds 60% in a
    quarter, against a peer median of ~30%.
  - High-tier visits paired with routine chronic-care follow-up diagnoses (e.g. essential
    hypertension, type 2 diabetes) without documentation of new or worsening conditions.
  - New-patient codes (99202-99205) reported for beneficiaries who had an encounter with the
    same provider or group within the prior 3 years.
  - Total time billed across a day exceeding clinical capacity (e.g., >12 hours of billed time
    by a single practitioner).

Investigators should request the full medical record, not just the superbill, and compare the
documented MDM elements against the billed level. When the documentation cannot support the
billed level, the claim should be recoded or denied, and a pattern review should be initiated.
""",
    ),
    (
        "fraud_alert_ncci_bypass_synthetic",
        """Synthetic Fraud Alert — NCCI Modifier Bypass

Providers occasionally append modifier 59 (distinct procedural service) or the more specific
X{E,S,P,U} modifiers to bypass NCCI Procedure-to-Procedure edits without clinical justification.
Audit indicators include:

  - Systematic use of modifier 59 on column-2 codes that are clearly components of column-1
    procedures (e.g., exploration of a surgical site billed alongside the definitive procedure).
  - Bypass rate on edits with modifier indicator 1 that exceeds 20% of edits encountered.
  - Absence of documented separate anatomic site, separate encounter, or separate non-overlapping
    session justifying the bypass.

Overpayment demand letters should request the medical record and the operative note. Recurrent
patterns warrant referral to the OIG.
""",
    ),
    (
        "fraud_alert_duplicate_billing_synthetic",
        """Synthetic Fraud Alert — Duplicate and Split Billing

Duplicate-billing schemes take several forms:
  - Verbatim resubmission of a previously paid claim with a new claim_id.
  - Service-date offset of ±1-3 days with otherwise identical content.
  - Split billing across two providers in the same tax ID without a split-service modifier.
  - Repeated submission of lab panels without modifier 91.

Detection rules should fire when: same member + same provider + procedure-code Jaccard similarity
>= 0.8 + service-date delta within 3 days + no valid repeat modifier. Confirmed duplicates are
recoverable as overpayments under the False Claims Act.
""",
    ),
]


def generate_fraud_supplement_if_thin() -> None:
    fraud_dir = settings.policy_docs_dir / "fraud_guidelines"
    if _dir_bytes(fraud_dir) >= MIN_FRAUD_TOTAL_BYTES:
        logger.info("Fraud guidelines dir already has %d bytes — skipping synthetic supplement", _dir_bytes(fraud_dir))
        return
    for slug, body in FRAUD_SECTIONS:
        header = "SYNTHETIC supplement — OIG-style fraud/compliance guidance\n\n"
        _write(fraud_dir / f"{slug}.txt", header + body)


# ---------------------------------------------------------------------------
# Synthetic NCCI fallback

NCCI_CSV = settings.ncci_dir / "practitioner_ptp_edits.csv"


def _generate_ncci_csv(n_rows: int = 1500) -> None:
    NCCI_CSV.parent.mkdir(parents=True, exist_ok=True)
    # Build pools of plausible CPT-like codes (not real CPT meanings).
    surgery = [f"{i:05d}" for i in range(10021, 10030)] + [f"{i:05d}" for i in range(11000, 11200, 3)]
    em = [c for c, _ in EM_TIERS]
    radiology = [f"{i:05d}" for i in range(71000, 77100, 5)]
    lab = [f"{i:05d}" for i in range(80048, 87500, 7)]
    pt = ["97110", "97112", "97116", "97140", "97530", "97535"]
    injection = ["96372", "96365", "96374", "20600", "20610", "20611"]

    pairs: set[tuple[str, str]] = set()
    # Unbundling: E/M bundled into comprehensive visits
    while len([p for p in pairs]) < n_rows // 3:
        a = RNG.choice(em)
        b = RNG.choice(surgery + injection + pt)
        pairs.add(tuple(sorted((a, b))))
    # Component bundling within same category
    while len(pairs) < (2 * n_rows) // 3:
        pool = RNG.choice([surgery, radiology, lab])
        if len(pool) < 2:
            continue
        a, b = RNG.sample(pool, 2)
        pairs.add(tuple(sorted((a, b))))
    # Historical/deleted edits
    while len(pairs) < n_rows:
        a = RNG.choice(surgery + radiology + lab + pt + injection)
        b = RNG.choice(surgery + radiology + lab + pt + injection)
        if a == b:
            continue
        pairs.add(tuple(sorted((a, b))))

    rows_written = 0
    with NCCI_CSV.open("w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["code_1", "code_2", "effective_date", "deletion_date", "modifier_indicator"])
        for c1, c2 in sorted(pairs):
            effective = RNG.choice(["2015-01-01", "2018-01-01", "2020-04-01", "2021-07-01", "2023-01-01"])
            # ~15% have a deletion_date in the past (historical)
            if RNG.random() < 0.15:
                deletion = RNG.choice(["2019-12-31", "2022-03-31", "2023-12-31"])
            else:
                deletion = ""
            modifier = RNG.choices(["0", "1", "9"], weights=[0.55, 0.35, 0.10])[0]
            w.writerow([c1, c2, effective, deletion, modifier])
            rows_written += 1
    logger.info("Synthetic NCCI CSV written with %d rows at %s", rows_written, NCCI_CSV)


def generate_ncci_if_missing() -> None:
    if NCCI_CSV.exists() and NCCI_CSV.stat().st_size > 1024:
        # Count rows — if real fetch succeeded, skip
        with NCCI_CSV.open(encoding="utf-8") as f:
            n = sum(1 for _ in f) - 1
        if n >= 100:
            logger.info("NCCI CSV already populated with %d rows — skipping synthetic", n)
            return
    _generate_ncci_csv()


# ---------------------------------------------------------------------------
# Main


def main() -> int:
    generate_cpt_descriptors()
    generate_cms_supplement_if_thin()
    generate_fraud_supplement_if_thin()
    generate_ncci_if_missing()
    return 0


if __name__ == "__main__":
    sys.exit(main())
