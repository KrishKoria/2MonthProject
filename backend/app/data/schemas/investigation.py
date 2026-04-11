"""Investigation lifecycle Pydantic v2 models."""

from datetime import datetime
from enum import StrEnum
from typing import TypedDict

from pydantic import BaseModel, Field

from .evidence import EvidenceEnvelope, RationaleResult


class InvestigationStatus(StrEnum):
    PENDING = "pending"
    TRIAGE_COMPLETE = "triage_complete"
    EVIDENCE_COMPLETE = "evidence_complete"
    COMPLETE = "complete"
    MANUAL_REVIEW_REQUIRED = "manual_review_required"
    ERROR = "error"


class AnomalyFlagValue(StrEnum):
    DETECTED = "detected"
    NOT_APPLICABLE = "not_applicable"
    INSUFFICIENT_DATA = "insufficient_data"


class TriageResult(BaseModel):
    """Output of the deterministic triage node."""

    anomaly_type: str | None = None
    anomaly_flags: dict[str, str]  # type -> detected|not_applicable|insufficient_data
    confidence: float = Field(ge=0.0, le=1.0)
    priority: str  # high|medium|low
    evidence_tools_to_use: list[str]


class HumanDecision(BaseModel):
    """Investigator decision after reviewing AI rationale."""

    decision: str  # accepted|rejected|escalated
    notes: str | None = None
    decided_at: datetime
    investigator_id: str = "default_user"


class Investigation(BaseModel):
    """Full investigation record."""

    claim_id: str
    investigation_status: InvestigationStatus = InvestigationStatus.PENDING
    triage: TriageResult | None = None
    evidence: EvidenceEnvelope | None = None
    rationale: RationaleResult | None = None
    human_decision: HumanDecision | None = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)


class InvestigationState(TypedDict, total=False):
    """LangGraph state schema for the investigation pipeline."""

    claim_id: str
    claim_data: dict
    xgboost_risk_score: float
    shap_values: dict[str, float]
    rules_flags: list[str]
    anomaly_type: str | None
    anomaly_flags: dict[str, str]
    confidence: float | None
    priority: str | None
    evidence_tools_to_use: list[str]
    evidence_results: dict | None
    rationale: dict | None
    investigation_status: str
    error_message: str | None
