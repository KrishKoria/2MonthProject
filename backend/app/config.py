"""Application configuration loaded from environment variables."""

from pathlib import Path

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """Application settings from environment variables."""

    OPENAI_API_KEY: str = ""
    DATA_DIR: Path = Path("./data")
    CHROMA_DIR: Path = Path("./data/chroma")
    LLM_MODEL: str = "gpt-4o"
    RISK_THRESHOLD: float = 40.0
    LOG_LEVEL: str = "INFO"

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

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8"}


settings = Settings()
