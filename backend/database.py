import json
from datetime import datetime
from sqlalchemy import create_engine, Column, String, Integer, Float, Text, ForeignKey
from sqlalchemy.orm import declarative_base, sessionmaker, relationship

DATABASE_URL = "sqlite:///./ruralhealth.db"

engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()

class PatientModel(Base):
    __tablename__ = "patients"

    id = Column(String, primary_key=True, index=True)
    name = Column(String, nullable=False)
    age = Column(Integer, nullable=False)
    gender = Column(String, nullable=False)
    village = Column(String, nullable=False)
    phone = Column(String, nullable=False)
    patient_id = Column(String, nullable=True)
    created_at = Column(String, default=lambda: datetime.utcnow().isoformat())

    assessments = relationship("AssessmentModel", back_populates="patient", cascade="all, delete-orphan")

class AssessmentModel(Base):
    __tablename__ = "assessments"

    id = Column(String, primary_key=True, index=True)
    patient_id = Column(String, ForeignKey("patients.id"), nullable=False)
    symptoms_json = Column(Text, default="[]")
    symptom_duration_days = Column(Integer, default=1)
    temperature_f = Column(Float, default=98.6)
    systolic_bp = Column(Integer, default=120)
    diastolic_bp = Column(Integer, default=80)
    glucose_mg_dl = Column(Float, default=100.0)
    heart_rate_bpm = Column(Integer, default=72)
    height_cm = Column(Float, nullable=True)
    weight_kg = Column(Float, nullable=True)
    bmi = Column(Float, nullable=True)
    smoking_status = Column(String, default="Never")
    alcohol_status = Column(String, default="Never")
    physical_activity = Column(String, default="Moderate")
    family_history_json = Column(Text, default="[]")
    
    risk_level = Column(String, default="LOW")
    risk_score = Column(Float, default=0.1)
    likely_conditions_json = Column(Text, default="[]")
    contributing_factors_json = Column(Text, default="[]")
    recommended_action = Column(Text, default="")
    referral_status = Column(String, default="NOT_REFERRED")
    created_at = Column(String, default=lambda: datetime.utcnow().isoformat())

    patient = relationship("PatientModel", back_populates="assessments")

    @property
    def symptoms(self):
        try:
            return json.loads(self.symptoms_json or "[]")
        except:
            return []

    @symptoms.setter
    def symptoms(self, value):
        self.symptoms_json = json.dumps(value or [])

    @property
    def family_history(self):
        try:
            return json.loads(self.family_history_json or "[]")
        except:
            return []

    @family_history.setter
    def family_history(self, value):
        self.family_history_json = json.dumps(value or [])

    @property
    def likely_conditions(self):
        try:
            return json.loads(self.likely_conditions_json or "[]")
        except:
            return []

    @likely_conditions.setter
    def likely_conditions(self, value):
        self.likely_conditions_json = json.dumps(value or [])

    @property
    def contributing_factors(self):
        try:
            return json.loads(self.contributing_factors_json or "[]")
        except:
            return []

    @contributing_factors.setter
    def contributing_factors(self, value):
        self.contributing_factors_json = json.dumps(value or [])

def init_db():
    Base.metadata.create_all(bind=engine)

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
