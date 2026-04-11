"""Core claim and risk Pydantic v2 models."""

from datetime import date, datetime
from enum import StrEnum

from pydantic import BaseModel, Field


class ClaimStatus(StrEnum):
    PENDING_REVIEW = "pending_review"
    ACCEPTED = "accepted"
    REJECTED = "rejected"
    ESCALATED = "escalated"
    MANUAL_REVIEW_REQUIRED = "manual_review_required"


class AnomalyType(StrEnum):
    UPCODING = "upcoding"
    NCCI_VIOLATION = "ncci_violation"
    DUPLICATE = "duplicate"


class RiskBand(StrEnum):
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"


class ClaimRecord(BaseModel):
    """A medical claim record loaded from Parquet."""

    claim_id: str
    member_id: str
    provider_id: str
    service_date: date
    claim_receipt_date: date
    procedure_codes: list[str]
    diagnosis_codes: list[str]
    modifiers: list[str]
    charge_amount: float
    allowed_amount: float
    paid_amount: float
    place_of_service: str
    claim_status: ClaimStatus = ClaimStatus.PENDING_REVIEW
    anomaly_type: AnomalyType | None = None


class RiskScore(BaseModel):
    """XGBoost risk score with SHAP explanations."""

    claim_id: str
    xgboost_score: float = Field(ge=0, le=100)
    shap_values: dict[str, float]
    rules_flags: list[str]
    risk_band: RiskBand
    scored_at: datetime


class AnomalyLabel(BaseModel):
    """Ground-truth anomaly label from injection."""

    claim_id: str
    anomaly_type: AnomalyType
    anomaly_subtype: str | None = None
    injection_params: dict = Field(default_factory=dict)
    split: str  # "train" or "test"


class Provider(BaseModel):
    """Provider roster record."""

    provider_id: str
    specialty: str
    name: str
    location_state: str
