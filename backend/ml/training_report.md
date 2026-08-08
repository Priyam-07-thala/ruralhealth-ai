# ML Training & Preprocessing Report

**Generated:** 2026-08-09 02:08:59

## 1. Dataset Preprocessing Summary
- **Original Rows:** 246,945
- **Duplicate Rows Removed:** 57,298
- **Cleaned Rows:** 189,647
- **Filtered Rows (>= 20 samples):** 187,850
- **Original Features:** 377
- **Removed Constant Features:** 49
- **Remaining Features:** 328

## 2. Class Distribution Summary
- **Total Unique Diseases:** 773
- **Classes Supported (>= 20 samples):** 512
- **Classes < 5 samples:** 115
- **Classes < 10 samples:** 186
- **Classes < 20 samples:** 261

## 3. Train / Validation / Test Split
- **Split Ratio:** 70% Train / 15% Validation / 15% Test (Stratified)
- **Random State:** 42
- **Train Samples:** 131,494
- **Validation Samples:** 28,178
- **Test Samples:** 28,178

## 4. Model Comparison Results

| Metric | Primary Model (Logistic Regression) | Baseline Model (Random Forest) |
|---|---|---|
| **Test Accuracy** | 0.8399 | 0.4436 |
| **Top-3 Accuracy** | 0.9524 | 0.5494 |
| **Macro Precision** | 0.7696 | 0.6370 |
| **Macro Recall** | 0.8755 | 0.5198 |
| **Macro F1** | 0.7982 | 0.5101 |
| **Weighted F1** | 0.8460 | 0.5076 |
| **Training Time** | 37.46s | 8.34s |

## 5. Model Selection Decision
Selected **Logistic Regression (L-BFGS, class_weight='balanced')** for production deployment because:
1. Excellent Top-3 accuracy (95.24%) and Macro F1 (0.7982).
2. Extremely fast inference time (< 5ms per prediction).
3. Direct explainability via learned class feature coefficients (`model contributing features`).
