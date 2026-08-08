"""
predictor.py — Real ML Prediction Service
==========================================
Loads saved model artifacts at module import time (once on backend startup).
Exposes predict_disease(symptoms) for use by the FastAPI endpoint.

Model contributing features are derived from Logistic Regression coefficients
for each predicted class, intersected with the symptoms present in the input.
These are 'model contributing features' — NOT clinical causal explanations.
"""

import os
import json
import joblib
import numpy as np
from typing import List, Dict, Any

# ── Artifact paths ─────────────────────────────────────────────────────────────
_BASE = os.path.join(os.path.dirname(__file__), 'models')
_MODEL_PATH   = os.path.join(_BASE, 'disease_model.joblib')
_ENCODER_PATH = os.path.join(_BASE, 'label_encoder.joblib')
_FEATURES_PATH = os.path.join(_BASE, 'feature_names.json')
_CLASSES_PATH  = os.path.join(_BASE, 'supported_classes.json')
_METADATA_PATH = os.path.join(_BASE, 'model_metadata.json')


class DiseasePredictor:
    """Loads model artifacts once and provides predict_disease()."""

    def __init__(self):
        self._ready = False
        self._load_error: str | None = None
        try:
            self.model         = joblib.load(_MODEL_PATH)
            self.label_encoder = joblib.load(_ENCODER_PATH)
            with open(_FEATURES_PATH, 'r') as f:
                self.feature_names: List[str] = json.load(f)
            with open(_CLASSES_PATH, 'r') as f:
                self.supported_classes: List[str] = json.load(f)
            with open(_METADATA_PATH, 'r') as f:
                self.metadata: Dict[str, Any] = json.load(f)
            # Build normalised feature lookup for fast symptom matching
            self._feature_lookup: Dict[str, str] = {
                f.lower().strip(): f for f in self.feature_names
            }
            self._ready = True
            print(
                f"[predictor] Loaded model: {self.metadata.get('model_type')} | "
                f"{len(self.feature_names)} features | "
                f"{len(self.supported_classes)} supported disease classes"
            )
        except FileNotFoundError as e:
            self._load_error = (
                f"Model artifact not found: {e}. "
                "Run backend/ml/train_model.py to generate the model."
            )
            print(f"[predictor] WARNING: {self._load_error}")
        except Exception as e:
            self._load_error = str(e)
            print(f"[predictor] ERROR loading model: {e}")

    @property
    def is_ready(self) -> bool:
        return self._ready

    def _normalise(self, symptom: str) -> str:
        """Lowercase, strip, collapse multiple spaces."""
        return ' '.join(symptom.lower().strip().split())

    def validate_symptoms(self, symptoms: List[str]) -> tuple[List[str], List[str]]:
        """
        Returns (valid_feature_names, unknown_symptoms).
        Matches input symptoms against the known feature list via normalised lookup.
        Unknown symptoms are silently dropped from the feature vector but returned
        so the caller can include them in the response for transparency.
        """
        valid: List[str] = []
        unknown: List[str] = []
        for sym in symptoms:
            key = self._normalise(sym)
            if key in self._feature_lookup:
                valid.append(self._feature_lookup[key])
            else:
                unknown.append(sym)
        return valid, unknown

    def _build_feature_vector(self, valid_features: List[str]) -> np.ndarray:
        """Binary feature vector — 1 if symptom present, 0 otherwise."""
        vec = np.zeros(len(self.feature_names), dtype=np.float32)
        for feat in valid_features:
            idx = self.feature_names.index(feat)
            vec[idx] = 1.0
        return vec.reshape(1, -1)

    def _contributing_symptoms(
        self,
        class_idx: int,
        valid_features: List[str],
        top_n: int = 5
    ) -> List[str]:
        """
        For Logistic Regression: look at coef_[class_idx] for the symptoms
        that are BOTH present in the input AND have the highest positive coefficient
        for this predicted class.
        These are 'model contributing features', NOT causal clinical explanations.
        """
        try:
            coef = self.model.coef_[class_idx]       # shape: (n_features,)
            feature_idx_map = {f: i for i, f in enumerate(self.feature_names)}
            present_with_coef = [
                (feat, float(coef[feature_idx_map[feat]]))
                for feat in valid_features
                if feat in feature_idx_map
            ]
            # Sort by coefficient magnitude, descending — take positives first
            present_with_coef.sort(key=lambda x: x[1], reverse=True)
            return [f for f, c in present_with_coef[:top_n] if c > 0]
        except Exception:
            return valid_features[:top_n]

    def predict_disease(self, symptoms: List[str]) -> Dict[str, Any]:
        """
        Main public API.

        Parameters
        ----------
        symptoms : list of str
            Free-text symptom names (matched case-insensitively to dataset features).

        Returns
        -------
        dict with keys:
          predictions  — top-3 predictions, each with condition / score / contributingSymptoms
          modelInfo    — model name and version
          unknownSymptoms — symptoms not in the training feature set
        """
        if not self._ready:
            raise RuntimeError(
                self._load_error or "Model not loaded. Run train_model.py first."
            )

        valid_features, unknown = self.validate_symptoms(symptoms)

        if not valid_features:
            return {
                "predictions": [],
                "modelInfo": {
                    "name": self.metadata.get("model_type", "Logistic Regression"),
                    "version": self.metadata.get("training_date", "unknown"),
                    "numFeatures": len(self.feature_names),
                    "numClasses": len(self.supported_classes),
                },
                "unknownSymptoms": unknown,
                "note": (
                    "None of the provided symptoms were found in the training feature set. "
                    "No prediction could be made."
                )
            }

        # Build binary feature vector and get class probabilities
        X = self._build_feature_vector(valid_features)
        probas = self.model.predict_proba(X)[0]   # shape: (n_classes,)

        # Top-3 predicted class indices
        top3_indices = np.argsort(probas)[::-1][:3]

        predictions = []
        for rank, class_idx in enumerate(top3_indices):
            condition_name = self.label_encoder.inverse_transform([class_idx])[0]
            score = round(float(probas[class_idx]), 4)
            contributing = self._contributing_symptoms(class_idx, valid_features)
            predictions.append({
                "rank": rank + 1,
                "condition": condition_name,
                "score": score,
                "contributingSymptoms": contributing,
            })

        return {
            "predictions": predictions,
            "modelInfo": {
                "name": self.metadata.get("model_type", "Logistic Regression"),
                "version": self.metadata.get("training_date", "unknown"),
                "numFeatures": len(self.feature_names),
                "numClasses": len(self.supported_classes),
            },
            "unknownSymptoms": unknown,
        }


# ── Module-level singleton — loaded ONCE at backend startup ────────────────────
disease_predictor = DiseasePredictor()
