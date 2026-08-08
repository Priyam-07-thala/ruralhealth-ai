import uuid
import os
from typing import List, Optional
from datetime import datetime
from fastapi import FastAPI, Depends, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from pydantic import BaseModel
from dotenv import load_dotenv

# Load .env from the same directory as this file
load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), '.env'))

from database import init_db, get_db, PatientModel, AssessmentModel
from schemas import (
    PatientCreate, PatientResponse,
    AssessmentCreate, AssessmentResponse,
    ReferralUpdate, SyncPayload, SyncResponse
)
from ml_engine import screening_engine, MEDICAL_DISCLAIMER

app = FastAPI(
    title="RuralHealth AI Backend",
    description="AI-Powered Early Disease Risk Prediction & Rural Health Access Platform API",
    version="1.0.0"
)

# Enable CORS for local Vite dev server and mobile devices
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("startup")
def startup_event():
    init_db()

@app.get("/api/health")
def health_check():
    return {"status": "online", "system": "RuralHealth AI Backend", "version": "1.0.0"}

# --- PATIENTS ENDPOINTS ---

@app.post("/api/patients", response_model=PatientResponse)
def create_patient(patient: PatientCreate, db: Session = Depends(get_db)):
    p_id = patient.id or str(uuid.uuid4())
    existing = db.query(PatientModel).filter(PatientModel.id == p_id).first()
    if existing:
        return existing

    db_patient = PatientModel(
        id=p_id,
        name=patient.name,
        age=patient.age,
        gender=patient.gender,
        village=patient.village,
        phone=patient.phone,
        patient_id=patient.patient_id or f"RH-{p_id[:6].upper()}",
        created_at=datetime.utcnow().isoformat()
    )
    db.add(db_patient)
    db.commit()
    db.refresh(db_patient)
    return db_patient

@app.get("/api/patients", response_model=List[PatientResponse])
def get_patients(db: Session = Depends(get_db)):
    return db.query(PatientModel).order_by(PatientModel.created_at.desc()).all()

# --- ASSESSMENTS & AI RISK ENDPOINTS ---

@app.post("/api/assess", response_model=AssessmentResponse)
def create_assessment(assessment: AssessmentCreate, db: Session = Depends(get_db)):
    # 1. Fetch or verify patient
    patient = db.query(PatientModel).filter(PatientModel.id == assessment.patient_id).first()
    patient_name = patient.name if patient else "Unknown Patient"
    village = patient.village if patient else "Unknown Village"

    # 2. Run AI Screening Engine
    eval_result = screening_engine.evaluate(assessment.model_dump())

    # 3. Store in DB
    ass_id = assessment.id or str(uuid.uuid4())
    existing = db.query(AssessmentModel).filter(AssessmentModel.id == ass_id).first()
    
    if not existing:
        db_ass = AssessmentModel(
            id=ass_id,
            patient_id=assessment.patient_id,
            symptom_duration_days=assessment.symptom_duration_days,
            temperature_f=assessment.temperature_f,
            systolic_bp=assessment.systolic_bp,
            diastolic_bp=assessment.diastolic_bp,
            glucose_mg_dl=assessment.glucose_mg_dl,
            heart_rate_bpm=assessment.heart_rate_bpm,
            height_cm=assessment.height_cm,
            weight_kg=assessment.weight_kg,
            bmi=assessment.bmi,
            smoking_status=assessment.smoking_status,
            alcohol_status=assessment.alcohol_status,
            physical_activity=assessment.physical_activity,
            risk_level=eval_result["risk_level"],
            risk_score=eval_result["risk_score"],
            recommended_action=eval_result["recommended_action"],
            referral_status="NOT_REFERRED" if eval_result["risk_level"] != "HIGH" else "REFERRED",
            created_at=datetime.utcnow().isoformat()
        )
        db_ass.symptoms = assessment.symptoms
        db_ass.family_history = assessment.family_history
        db_ass.likely_conditions = eval_result["likely_conditions"]
        db_ass.contributing_factors = eval_result["contributing_factors"]
        
        db.add(db_ass)
        db.commit()
        db.refresh(db_ass)
        target_ass = db_ass
    else:
        target_ass = existing

    return AssessmentResponse(
        id=target_ass.id,
        patient_id=target_ass.patient_id,
        patient_name=patient_name,
        village=village,
        symptoms=target_ass.symptoms,
        symptom_duration_days=target_ass.symptom_duration_days,
        temperature_f=target_ass.temperature_f,
        systolic_bp=target_ass.systolic_bp,
        diastolic_bp=target_ass.diastolic_bp,
        glucose_mg_dl=target_ass.glucose_mg_dl,
        heart_rate_bpm=target_ass.heart_rate_bpm,
        height_cm=target_ass.height_cm,
        weight_kg=target_ass.weight_kg,
        bmi=target_ass.bmi,
        smoking_status=target_ass.smoking_status,
        alcohol_status=target_ass.alcohol_status,
        physical_activity=target_ass.physical_activity or "Moderate",
        family_history=target_ass.family_history,
        risk_level=target_ass.risk_level,
        risk_score=target_ass.risk_score,
        likely_conditions=target_ass.likely_conditions,
        contributing_factors=target_ass.contributing_factors,
        recommended_action=target_ass.recommended_action,
        referral_status=target_ass.referral_status,
        created_at=target_ass.created_at,
        disclaimer=MEDICAL_DISCLAIMER
    )

@app.get("/api/assessments", response_model=List[AssessmentResponse])
def list_assessments(db: Session = Depends(get_db)):
    assessments = db.query(AssessmentModel).order_by(AssessmentModel.created_at.desc()).all()
    results = []
    for ass in assessments:
        patient = db.query(PatientModel).filter(PatientModel.id == ass.patient_id).first()
        p_name = patient.name if patient else "Unknown Patient"
        p_village = patient.village if patient else "Unknown Village"
        results.append(
            AssessmentResponse(
                id=ass.id,
                patient_id=ass.patient_id,
                patient_name=p_name,
                village=p_village,
                symptoms=ass.symptoms,
                symptom_duration_days=ass.symptom_duration_days,
                temperature_f=ass.temperature_f,
                systolic_bp=ass.systolic_bp,
                diastolic_bp=ass.diastolic_bp,
                glucose_mg_dl=ass.glucose_mg_dl,
                heart_rate_bpm=ass.heart_rate_bpm,
                height_cm=ass.height_cm,
                weight_kg=ass.weight_kg,
                bmi=ass.bmi,
                smoking_status=ass.smoking_status,
                alcohol_status=ass.alcohol_status,
                physical_activity=ass.physical_activity or "Moderate",
                family_history=ass.family_history,
                risk_level=ass.risk_level,
                risk_score=ass.risk_score,
                likely_conditions=ass.likely_conditions,
                contributing_factors=ass.contributing_factors,
                recommended_action=ass.recommended_action,
                referral_status=ass.referral_status,
                created_at=ass.created_at,
                disclaimer=MEDICAL_DISCLAIMER
            )
        )
    return results

@app.put("/api/assessments/{assessment_id}/referral")
def update_referral_status(assessment_id: str, body: ReferralUpdate, db: Session = Depends(get_db)):
    ass = db.query(AssessmentModel).filter(AssessmentModel.id == assessment_id).first()
    if not ass:
        raise HTTPException(status_code=404, detail="Assessment not found")
    
    valid_statuses = ["NOT_REFERRED", "REFERRED", "APPOINTMENT_REQUESTED", "CONSULTATION_COMPLETED"]
    if body.referral_status not in valid_statuses:
        raise HTTPException(status_code=400, detail=f"Invalid referral status. Must be one of {valid_statuses}")
    
    ass.referral_status = body.referral_status
    db.commit()
    return {"message": "Referral status updated successfully", "assessment_id": assessment_id, "referral_status": ass.referral_status}

# --- OFFLINE SYNC ENDPOINT ---

@app.post("/api/sync", response_model=SyncResponse)
def batch_sync(payload: SyncPayload, db: Session = Depends(get_db)):
    p_synced = 0
    a_synced = 0

    # 1. Sync Patients
    for p in payload.patients:
        p_id = p.id or str(uuid.uuid4())
        existing_p = db.query(PatientModel).filter(PatientModel.id == p_id).first()
        if not existing_p:
            new_p = PatientModel(
                id=p_id,
                name=p.name,
                age=p.age,
                gender=p.gender,
                village=p.village,
                phone=p.phone,
                patient_id=p.patient_id or f"RH-{p_id[:6].upper()}",
                created_at=datetime.utcnow().isoformat()
            )
            db.add(new_p)
            p_synced += 1

    db.commit()

    # 2. Sync Assessments
    for a in payload.assessments:
        ass_id = a.id or str(uuid.uuid4())
        existing_a = db.query(AssessmentModel).filter(AssessmentModel.id == ass_id).first()
        if not existing_a:
            eval_res = screening_engine.evaluate(a.model_dump())
            new_a = AssessmentModel(
                id=ass_id,
                patient_id=a.patient_id,
                symptom_duration_days=a.symptom_duration_days,
                temperature_f=a.temperature_f,
                systolic_bp=a.systolic_bp,
                diastolic_bp=a.diastolic_bp,
                glucose_mg_dl=a.glucose_mg_dl,
                heart_rate_bpm=a.heart_rate_bpm,
                height_cm=a.height_cm,
                weight_kg=a.weight_kg,
                bmi=a.bmi,
                smoking_status=a.smoking_status,
                alcohol_status=a.alcohol_status,
                physical_activity=a.physical_activity,
                risk_level=eval_res["risk_level"],
                risk_score=eval_res["risk_score"],
                recommended_action=eval_res["recommended_action"],
                referral_status="REFERRED" if eval_res["risk_level"] == "HIGH" else "NOT_REFERRED",
                created_at=datetime.utcnow().isoformat()
            )
            new_a.symptoms = a.symptoms
            new_a.family_history = a.family_history
            new_a.likely_conditions = eval_res["likely_conditions"]
            new_a.contributing_factors = eval_res["contributing_factors"]
            db.add(new_a)
            a_synced += 1

    db.commit()

    return SyncResponse(
        synced_patients_count=p_synced,
        synced_assessments_count=a_synced,
        message=f"Sync completed. Processed {p_synced} patients and {a_synced} health assessments."
    )

# --- PHC DASHBOARD STATS ---

@app.get("/api/dashboard/stats")
def get_dashboard_stats(db: Session = Depends(get_db)):
    total_patients = db.query(PatientModel).count()
    assessments = db.query(AssessmentModel).all()
    
    total_assessments = len(assessments)
    high_risk_count = sum(1 for a in assessments if a.risk_level == "HIGH")
    moderate_risk_count = sum(1 for a in assessments if a.risk_level == "MODERATE")
    low_risk_count = sum(1 for a in assessments if a.risk_level == "LOW")

    pending_referrals = sum(1 for a in assessments if a.referral_status in ["REFERRED", "APPOINTMENT_REQUESTED"])
    completed_consultations = sum(1 for a in assessments if a.referral_status == "CONSULTATION_COMPLETED")

    # Risk Distribution for charts
    risk_distribution = [
        {"name": "High Risk", "value": high_risk_count, "color": "#f43f5e"},
        {"name": "Moderate Risk", "value": moderate_risk_count, "color": "#f59e0b"},
        {"name": "Low Risk", "value": low_risk_count, "color": "#10b981"}
    ]

    # Village distribution
    village_counts: dict = {}
    for a in assessments:
        patient = db.query(PatientModel).filter(PatientModel.id == a.patient_id).first()
        v = patient.village if patient else "Unknown"
        village_counts[v] = village_counts.get(v, 0) + 1
    
    village_data = [{"village": k, "count": v} for k, v in village_counts.items()]

    return {
        "total_patients": total_patients,
        "total_assessments": total_assessments,
        "high_risk_count": high_risk_count,
        "pending_referrals": pending_referrals,
        "completed_consultations": completed_consultations,
        "risk_distribution": risk_distribution,
        "village_distribution": village_data
    }


# ─── HEALTH CHATBOT ENDPOINT ─────────────────────────────────────────────────

CHAT_SYSTEM_PROMPT = """
You are a rural health assistant AI integrated into the RuralHealth AI platform used by ASHA 
(Accredited Social Health Activist) workers and patients in rural India.

Your role:
- Help users understand their symptoms and what they might indicate
- Provide practical, actionable home-care tips for mild conditions
- Clearly tell users when symptoms are serious and require IMMEDIATE medical attention or hospital visit
- Be warm, simple, and easy to understand — many users are rural health workers or patients with limited medical knowledge
- Support responses in English, Hindi, or Bengali based on the user's language

Common conditions to be aware of in rural India:
Fever, Malaria, Dengue, Typhoid, TB (Tuberculosis), Diabetes, Hypertension, Anaemia,
Diarrhoea, Respiratory infections, Snake bite, Malnutrition, Maternal health issues.

STRICT RULES:
1. NEVER prescribe specific medicines or dosages
2. ALWAYS recommend consulting a qualified doctor or PHC (Primary Health Centre) for any concerning symptom
3. For emergency symptoms (chest pain, breathing difficulty, unconsciousness, severe bleeding, high fever >104°F), 
   IMMEDIATELY tell the user to call 108 (India emergency) or go to the nearest hospital
4. Always end your response with: "\n\n⚕️ *This is AI guidance only — not a medical diagnosis. Please consult a doctor for proper evaluation.*"
5. Keep responses concise and structured (use bullet points)

Remember: Your guidance could impact the health of vulnerable rural populations. Be responsible.
"""

class ChatMessage(BaseModel):
    role: str  # "user" or "assistant"
    content: str

class ChatRequest(BaseModel):
    messages: List[ChatMessage]
    language: Optional[str] = "en"  # "en", "hi", or "bn"

class ChatResponse(BaseModel):
    reply: str
    error: Optional[str] = None

@app.post("/api/chat", response_model=ChatResponse)
async def health_chat(request: ChatRequest):
    """
    Health chatbot endpoint powered by OpenAI GPT.
    The API key is read server-side from .env — never exposed to the browser.
    """
    api_key = os.getenv("OPENAI_API_KEY", "")
    
    if not api_key or api_key == "your_openai_api_key_here":
        raise HTTPException(
            status_code=503,
            detail="OpenAI API key not configured. Please add OPENAI_API_KEY to backend/.env"
        )
    
    try:
        from openai import OpenAI
        client = OpenAI(api_key=api_key)
        
        # Build message list: system prompt + conversation history
        lang_hint = {
            "hi": "Please respond in Hindi (हिंदी).",
            "bn": "Please respond in Bengali (বাংলা).",
            "en": "Please respond in English."
        }.get(request.language or "en", "Please respond in English.")
        
        openai_messages = [
            {"role": "system", "content": CHAT_SYSTEM_PROMPT + f"\n\nLanguage instruction: {lang_hint}"}
        ]
        
        # Add conversation history (last 20 messages max to stay within token limits)
        for msg in request.messages[-20:]:
            openai_messages.append({"role": msg.role, "content": msg.content})
        
        response = client.chat.completions.create(
            model="gpt-4o-mini",   # Fast and cost-effective
            messages=openai_messages,
            max_tokens=600,
            temperature=0.4,        # More deterministic for medical guidance
        )
        
        reply = response.choices[0].message.content or "I could not generate a response. Please try again."
        return ChatResponse(reply=reply)
    
    except HTTPException:
        raise
    except Exception as e:
        err_str = str(e)
        if "insufficient_quota" in err_str or "credit_balance_exhausted" in err_str or "429" in err_str:
            # Fallback response for offline / credit-exhausted state
            user_msg = (request.messages[-1].content if request.messages else "").lower()
            
            # Simple rule-based guidance for hackathon demo resilience
            advice = []
            if "fever" in user_msg or "बुखार" in user_msg or "জ্বর" in user_msg:
                advice.append("• **Fever Management:** Stay hydrated with clean water/ORS, take adequate rest, and use a cool damp cloth on forehead to reduce temp.")
                advice.append("• **Red Flags:** If fever >102°F lasts more than 2 days or is accompanied by severe headache, rash, or vomiting, visit the nearest PHC immediately.")
            elif "cough" in user_msg or "cold" in user_msg or "खांसी" in user_msg:
                advice.append("• **Cough & Cold Care:** Drink warm water or herbal tea (tulsi/ginger), practice steam inhalation, and rest.")
                advice.append("• **Warning:** If cough persists >2 weeks or produces blood/chest pain, get tested for TB/respiratory infection at PHC.")
            elif "sugar" in user_msg or "diabetes" in user_msg or "शुगर" in user_msg:
                advice.append("• **Blood Sugar Management:** Avoid direct sweets, sugary tea, and refined flour. Eat whole grains, green leafy vegetables, and stay active.")
                advice.append("• **Screening:** Regular glucose monitoring at PHC is recommended.")
            elif "bp" in user_msg or "blood pressure" in user_msg or "बीपी" in user_msg:
                advice.append("• **Blood Pressure Guidance:** Reduce daily salt intake, manage stress, avoid tobacco/alcohol, and exercise daily.")
                advice.append("• **Critical:** If BP >160/100 or experiencing severe dizziness/blurred vision, seek emergency care.")
            else:
                advice.append("• **General Health Care:** Ensure clean drinking water, proper nutrition, adequate sleep, and hygiene.")
                advice.append("• **Consultation:** Please visit your local ASHA worker or Primary Health Centre (PHC) for a clinical evaluation.")

            fallback_reply = (
                "⚠️ *Note: OpenAI API quota exhausted. Operating in Rule-Based Medical Decision Support Mode.*\n\n"
                + "\n".join(advice)
                + "\n\n⚕️ *This is AI guidance only — not a medical diagnosis. Please consult a doctor for proper evaluation.*"
            )
            return ChatResponse(reply=fallback_reply)

        raise HTTPException(status_code=500, detail=f"Chat error: {err_str}")
