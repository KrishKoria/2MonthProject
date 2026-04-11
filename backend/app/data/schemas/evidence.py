"""Evidence and rationale Pydantic v2 models."""

from pydantic import BaseModel, Field


class PolicyCitation(BaseModel):
    """A retrieved RAG chunk with source metadata."""

    text: str
    source: str
    chapter: str | None = None
    section: str | None = None
    relevance_score: float = Field(ge=0.0, le=1.0)


class NCCIFinding(BaseModel):
    """NCCI conflict lookup result."""

    conflict_exists: bool
    edit_type: str | None = None
    effective_date: str | None = None
    rationale: str | None = None


class DuplicateMatch(BaseModel):
    """A potential duplicate claim match."""

    claim_id: str
    service_date: str
    procedure_codes: list[str]
    similarity_score: float


class SourceRecord(BaseModel):
    """Status record for each evidence source consulted."""

    tool: str  # ncci_lookup|rag_retrieval|provider_history|duplicate_search
    status: str  # success|unavailable
    reason: str | None = None


class EvidenceEnvelope(BaseModel):
    """All evidence gathered by the evidence node."""

    policy_citations: list[PolicyCitation] = Field(default_factory=list)
    ncci_findings: NCCIFinding | None = None
    provider_context: str | None = None
    duplicate_matches: list[DuplicateMatch] = Field(default_factory=list)
    sources_consulted: list[SourceRecord] = Field(default_factory=list)


class RationaleResult(BaseModel):
    """LLM-generated rationale output validated by Pydantic."""

    summary: str
    supporting_evidence: list[str]
    policy_citations: list[PolicyCitation]
    anomaly_flags_addressed: dict[str, str | None]  # all 3 types must be present
    recommended_action: str
    confidence: float = Field(ge=0.0, le=1.0)
    review_needed: bool
