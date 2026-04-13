"""SHAP TreeExplainer wrapper with invariant check.

Constitution VI: abs(sum(shap_values) - (pred - base_value)) < 1e-5
Must use TreeExplainer only — not generic Explainer.
"""

import logging

import numpy as np
import shap
import xgboost as xgb

from app.ml.model import predict_model

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

    def explain(self, X: np.ndarray, strict: bool = True) -> list[dict[str, float]]:
        """Compute SHAP values for a batch of predictions.

        SHAP TreeExplainer returns values in margin (log-odds) space for binary
        classifiers. The invariant check verifies in that space.

        Args:
            X: Feature matrix (n_samples, n_features)
            strict: If True, raise on invariant violation. If False, log warning.

        Returns:
            List of dicts mapping feature name to SHAP value, one per sample.

        Raises:
            ValueError: If SHAP invariant check fails and strict=True.
        """
        # Use SHAP's Explanation object for correct alignment
        explanation = self.explainer(X)
        shap_values = explanation.values
        base_values = explanation.base_values

        # Get raw margin predictions for invariant check
        dmatrix = xgb.DMatrix(X, feature_names=self.feature_names)
        predictions = predict_model(self.model, dmatrix, output_margin=True)

        results = []
        for i in range(len(X)):
            sv = shap_values[i]
            pred = float(predictions[i])
            bv = float(base_values[i]) if hasattr(base_values, '__len__') else float(base_values)

            # SHAP invariant check (constitution VI)
            shap_sum = float(np.sum(sv))
            expected_diff = pred - bv
            residual = abs(shap_sum - expected_diff)

            if residual > SHAP_TOLERANCE:
                msg = (
                    f"SHAP invariant residual for sample {i}: "
                    f"|sum(shap)={shap_sum:.8f} - (pred={pred:.8f} - base={bv:.8f})| "
                    f"= {residual:.8f} > {SHAP_TOLERANCE}"
                )
                if strict:
                    raise ValueError(msg)
                logger.warning(msg)

            feature_shap = {
                name: round(float(sv[j]), 6)
                for j, name in enumerate(self.feature_names)
            }
            results.append(feature_shap)

        return results

    def explain_single(self, x: np.ndarray, strict: bool = True) -> dict[str, float]:
        """Explain a single prediction."""
        if x.ndim == 1:
            x = x.reshape(1, -1)
        return self.explain(x, strict=strict)[0]
