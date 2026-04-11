"""SHAP TreeExplainer wrapper with invariant check.

Constitution VI: abs(sum(shap_values) - (pred - base_value)) < 1e-5
Must use TreeExplainer only — not generic Explainer.
"""

import logging

import numpy as np
import shap
import xgboost as xgb

logger = logging.getLogger(__name__)

SHAP_TOLERANCE = 1e-5


class SHAPExplainer:
    """Wrapper around SHAP TreeExplainer for XGBoost models."""

    def __init__(self, model: xgb.Booster, feature_names: list[str]):
        self.model = model
        self.feature_names = feature_names
        # MUST use TreeExplainer, not generic Explainer (constitution)
        self.explainer = shap.TreeExplainer(model)

    @property
    def base_value(self) -> float:
        """Expected value (base prediction before any feature contributions)."""
        bv = self.explainer.expected_value
        if isinstance(bv, np.ndarray):
            return float(bv[0])
        return float(bv)

    def explain(self, X: np.ndarray) -> list[dict[str, float]]:
        """Compute SHAP values for a batch of predictions.

        Args:
            X: Feature matrix (n_samples, n_features)

        Returns:
            List of dicts mapping feature name to SHAP value, one per sample.

        Raises:
            ValueError: If SHAP invariant check fails.
        """
        dmatrix = xgb.DMatrix(X, feature_names=self.feature_names)
        predictions = self.model.predict(dmatrix)

        shap_values = self.explainer.shap_values(X)

        results = []
        for i in range(len(X)):
            sv = shap_values[i]
            pred = predictions[i]

            # SHAP invariant check (constitution VI)
            shap_sum = float(np.sum(sv))
            expected_diff = float(pred) - self.base_value
            residual = abs(shap_sum - expected_diff)

            if residual > SHAP_TOLERANCE:
                raise ValueError(
                    f"SHAP invariant violated for sample {i}: "
                    f"|sum(shap)={shap_sum:.8f} - (pred={pred:.8f} - base={self.base_value:.8f})| "
                    f"= {residual:.8f} > {SHAP_TOLERANCE}"
                )

            feature_shap = {
                name: round(float(sv[j]), 6)
                for j, name in enumerate(self.feature_names)
            }
            results.append(feature_shap)

        return results

    def explain_single(self, x: np.ndarray) -> dict[str, float]:
        """Explain a single prediction."""
        if x.ndim == 1:
            x = x.reshape(1, -1)
        return self.explain(x)[0]
