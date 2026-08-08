from typing import List, Dict, Any

MEDICAL_DISCLAIMER = (
    "DISCLAIMER: This tool is a screening and decision-support prototype. "
    "It does NOT provide a medical diagnosis or prescriptions, and does NOT replace evaluation by a qualified healthcare professional."
)

class RiskScreeningEngine:
    def __init__(self):
        pass

    def evaluate(self, data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Deterministic, transparent clinical decision-support screening engine.
        Outputs screening risk level, likely concerns (non-diagnostic), explainable factors, and recommendation.
        """
        symptoms = [s.lower() for s in data.get("symptoms", [])]
        symptom_duration = data.get("symptom_duration_days", 1)
        temp_f = data.get("temperature_f", 98.6)
        systolic = data.get("systolic_bp", 120)
        diastolic = data.get("diastolic_bp", 80)
        glucose = data.get("glucose_mg_dl", 100.0)
        hr = data.get("heart_rate_bpm", 72)
        height_cm = data.get("height_cm") or 165.0
        weight_kg = data.get("weight_kg") or 65.0
        
        bmi = data.get("bmi")
        if not bmi and height_cm > 0:
            bmi = round(weight_kg / ((height_cm / 100) ** 2), 1)

        smoking = data.get("smoking_status", "Never")
        alcohol = data.get("alcohol_status", "Never")
        activity = data.get("physical_activity", "Moderate")
        family_history = [f.lower() for f in data.get("family_history", [])]

        factors: List[str] = []
        conditions: List[str] = []
        raw_risk_score = 0.05

        # --- 1. Diabetes / Metabolic Risk Check ---
        glucose_risk = False
        if glucose >= 200:
            factors.append(f"Severely Elevated Blood Glucose ({glucose} mg/dL >= 200 mg/dL)")
            raw_risk_score += 0.40
            glucose_risk = True
        elif glucose >= 140:
            factors.append(f"Elevated Blood Glucose ({glucose} mg/dL >= 140 mg/dL)")
            raw_risk_score += 0.25
            glucose_risk = True
        elif glucose >= 126:
            factors.append(f"Fasting Blood Glucose in High Risk Range ({glucose} mg/dL)")
            raw_risk_score += 0.20
            glucose_risk = True

        diabetes_symptoms = ["frequent urination", "increased thirst", "excessive thirst", "unexplained weight loss", "blurred vision", "extreme fatigue"]
        matching_diab_symptoms = [s for s in symptoms if any(ds in s for ds in diabetes_symptoms)]
        if matching_diab_symptoms:
            factors.append(f"Reported diabetes-related symptoms: {', '.join(matching_diab_symptoms)}")
            raw_risk_score += 0.15 * len(matching_diab_symptoms)
            glucose_risk = True

        if any("diabetes" in fh for fh in family_history):
            factors.append("Family history of Diabetes mellitus")
            raw_risk_score += 0.10

        if glucose_risk:
            conditions.append("Elevated Diabetes Screening Risk — Further Evaluation Recommended")

        # --- 2. Cardiovascular / Hypertension Risk Check ---
        bp_risk = False
        if systolic >= 180 or diastolic >= 120:
            factors.append(f"Hypertensive Crisis Vitals (BP: {systolic}/{diastolic} mmHg)")
            raw_risk_score += 0.50
            bp_risk = True
        elif systolic >= 140 or diastolic >= 90:
            factors.append(f"Stage 2 Elevated Blood Pressure (BP: {systolic}/{diastolic} mmHg)")
            raw_risk_score += 0.30
            bp_risk = True
        elif systolic >= 130 or diastolic >= 80:
            factors.append(f"Stage 1 Borderline Blood Pressure (BP: {systolic}/{diastolic} mmHg)")
            raw_risk_score += 0.15
            bp_risk = True

        cardio_symptoms = ["chest pain", "chest discomfort", "shortness of breath", "breathlessness", "dizziness", "palpitations", "swelling", "swelling in legs"]
        matching_cardio = [s for s in symptoms if any(cs in s for cs in cardio_symptoms)]
        if matching_cardio:
            factors.append(f"Cardiovascular warning signs: {', '.join(matching_cardio)}")
            raw_risk_score += 0.25
            bp_risk = True

        if smoking == "Current":
            factors.append("Current tobacco / smoking habit (elevated vascular risk)")
            raw_risk_score += 0.15

        if activity == "Sedentary":
            factors.append("Sedentary lifestyle reported")
            raw_risk_score += 0.05
        
        if bp_risk:
            conditions.append("Possible Hypertension / Cardiovascular-Related Concern")

        # --- 3. Respiratory / Infection / TB Triage ---
        resp_risk = False
        if temp_f >= 101.0:
            factors.append(f"High Fever Recorded ({temp_f}°F)")
            raw_risk_score += 0.25
            resp_risk = True
        elif temp_f >= 99.5:
            factors.append(f"Mild Low-Grade Fever ({temp_f}°F)")
            raw_risk_score += 0.10

        tb_symptoms = ["cough", "persistent cough", "coughing blood", "night sweats", "fever", "weight loss"]
        matching_tb = [s for s in symptoms if any(ts in s for ts in tb_symptoms)]
        if matching_tb:
            factors.append(f"Respiratory symptoms: {', '.join(matching_tb)}")
            if symptom_duration >= 14 and any("cough" in s for s in matching_tb):
                factors.append(f"Persistent cough lasting {symptom_duration} days (High priority TB screening criteria)")
                raw_risk_score += 0.35
                resp_risk = True
            else:
                raw_risk_score += 0.15

        if resp_risk:
            if symptom_duration >= 14 and any("cough" in s for s in symptoms):
                conditions.append("Possible TB-Related Concern — Urgent Sputum Screening Recommended")
            else:
                conditions.append("Acute Respiratory Infection Screening Concern")

        # --- 4. Anemia / Weakness Risk ---
        anemia_symptoms = ["weakness", "fatigue", "dizziness", "nausea", "swelling", "pale skin"]
        matching_anemia = [s for s in symptoms if any(ans in s for ans in anemia_symptoms)]
        if len(matching_anemia) >= 2:
            factors.append(f"General constitutional symptoms: {', '.join(matching_anemia)}")
            raw_risk_score += 0.15
            conditions.append("General Nutritional / Anemia Evaluation Recommended")

        # --- 5. BMI & Vitals Check ---
        if bmi and bmi >= 30.0:
            factors.append(f"Obesity Category (BMI {bmi} kg/m²)")
            raw_risk_score += 0.10
        elif bmi and bmi < 18.5:
            factors.append(f"Underweight Category (BMI {bmi} kg/m²)")
            raw_risk_score += 0.10

        if hr >= 100:
            factors.append(f"Elevated Heart Rate ({hr} bpm)")
            raw_risk_score += 0.15

        # Cap risk score
        risk_score = round(min(max(raw_risk_score, 0.05), 0.98), 2)

        # Risk level categorization
        if risk_score >= 0.55 or systolic >= 160 or glucose >= 200 or (symptom_duration >= 14 and "cough" in " ".join(symptoms)):
            risk_level = "HIGH"
        elif risk_score >= 0.25 or systolic >= 130 or glucose >= 140 or temp_f >= 100.0 or len(symptoms) >= 2:
            risk_level = "MODERATE"
        else:
            risk_level = "LOW"

        if not conditions:
            conditions.append("Routine Baseline Health Screening — Low Immediate Concern")

        if not factors:
            factors.append("Normal vitals within expected parameters")
            factors.append("No acute high-risk symptoms reported")

        # Clinical Action Recommendation
        if risk_level == "HIGH":
            recommendation = (
                "PHC EVALUATION RECOMMENDED: High screening risk flagged. Refer patient to Primary Health Centre (PHC) Medical Officer within 24 hours. "
                "Order Fasting Blood Glucose, HbA1c, and Sputum Smear if chronic cough is present."
            )
        elif risk_level == "MODERATE":
            recommendation = (
                "ROUTINE PHC REFERRAL: Moderate screening risk. Schedule PHC visit within 3-5 days. "
                "Advise lifestyle modifications, dietary control, and re-check vitals in 1 week."
            )
        else:
            recommendation = (
                "COMMUNITY CARE: Patient baseline vitals are low risk. Provide standard wellness and preventive health guidance."
            )

        return {
            "risk_level": risk_level,
            "risk_score": risk_score,
            "likely_conditions": conditions,
            "contributing_factors": factors,
            "recommended_action": recommendation,
            "disclaimer": MEDICAL_DISCLAIMER
        }

screening_engine = RiskScreeningEngine()
