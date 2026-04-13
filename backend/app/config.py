"""Application configuration loaded from environment variables."""

from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

# Anchor default data paths to project root (parent of backend/), so scripts
# produce the same files regardless of working directory.
_PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
_BACKEND_ROOT = Path(__file__).resolve().parent.parent


class Settings(BaseSettings):
    """Application settings from environment variables."""

    OPENAI_API_KEY: str = ""
    DATA_DIR: Path = _PROJECT_ROOT / "data"
    CHROMA_DIR: Path = _PROJECT_ROOT / "data" / "chroma"
    LLM_MODEL: str = "gpt-4o"
    RISK_THRESHOLD: float = 40.0
    LOG_LEVEL: str = "INFO"
    CORS_ALLOW_ORIGINS: str = "http://localhost:3000"
    API_HOST: str = "127.0.0.1"
    API_PORT: int = 8000
    API_RELOAD: bool = False

    # Derived paths
    @property
    def raw_dir(self) -> Path:
        return self.DATA_DIR / "raw"

    @property
    def processed_dir(self) -> Path:
        return self.DATA_DIR / "processed"

    @property
    def features_dir(self) -> Path:
        return self.DATA_DIR / "features"

    @property
    def scores_dir(self) -> Path:
        return self.DATA_DIR / "scores"

    @property
    def ncci_dir(self) -> Path:
        return self.DATA_DIR / "ncci"

    @property
    def policy_docs_dir(self) -> Path:
        return self.DATA_DIR / "policy_docs"

    @property
    def cors_allow_origins(self) -> list[str]:
        return [origin.strip() for origin in self.CORS_ALLOW_ORIGINS.split(",") if origin.strip()]

    model_config = SettingsConfigDict(
        env_file=_BACKEND_ROOT / ".env",
        env_file_encoding="utf-8",
    )


settings = Settings()
