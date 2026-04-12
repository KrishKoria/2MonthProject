"""Evidence setup script: ingest policy corpus into ChromaDB and verify NCCI CSV.

Usage:
    uv run python -m scripts.setup_evidence
"""

from __future__ import annotations

import logging
import sys

from app.config import settings
from app.evidence.ncci_engine import NCCIEngine
from app.evidence.rag_embeddings import collection_size, index_chunks
from app.evidence.rag_ingest import ingest_policy_corpus

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s - %(message)s")
logger = logging.getLogger("setup_evidence")


MIN_POLICY_CHUNKS = 1000


def main() -> int:
    logger.info("Step 1/2: ingesting CMS policy corpus from %s", settings.policy_docs_dir)
    chunks = ingest_policy_corpus()
    if not chunks:
        logger.error("No policy chunks produced — populate %s with .txt/.md files", settings.policy_docs_dir)
        return 1

    indexed = index_chunks(chunks)
    total = collection_size()
    logger.info("Chroma collection cms_policy now holds %d chunks (indexed this run: %d)", total, indexed)

    if total < MIN_POLICY_CHUNKS:
        logger.error(
            "Validation failed: cms_policy collection has %d chunks, need >= %d",
            total,
            MIN_POLICY_CHUNKS,
        )
        return 2

    logger.info("Step 2/2: verifying NCCI CSV is loadable")
    engine = NCCIEngine()
    edits = engine.edits_df
    if edits.empty:
        logger.error("NCCI CSV at %s produced zero edit rows", engine.csv_path)
        return 3
    logger.info("NCCI CSV loaded with %d edit rows", len(edits))

    logger.info("Evidence setup complete.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
