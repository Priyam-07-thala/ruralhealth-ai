# RuralHealth AI - Features & Tech Stack

> **Last Updated:** Phase 1 - P0 Core MVP Vertical Slice
> This document is updated automatically after every new feature or structural change.

---

## What This App Does

RuralHealth AI is an AI-powered early disease risk prediction and rural health access platform, designed for use by ASHA/ANM health workers, PHC doctors, rural patients, and district health officers in India.

It enables a complete screening workflow:

**PATIENT REGISTRATION -> HEALTH ASSESSMENT -> AI SCREENING -> EXPLAINABLE RESULT -> SAVE -> PHC DASHBOARD**

---

## Implemented Features

### Phase 1 - P0 Core MVP (COMPLETE)

#### 1. Patient Registration
- Mobile-first registration form
- Fields: Full Name, Age, Gender, Village, Phone Number, Patient ID (optional)
- Required field validation with inline error messages (name, age, gender, village)
- Patient record stored in SQLite (online) or IndexedDB (offline)

#### 2. Health Assessment (3-Step Wizard)
- Step 1: Patient registration
- Step 2: Health data collection
  - 12 touch-friendly symptom pill selectors: Fever, Cough, Fatigue, Headache, Dizziness, Shortness of Breath, Chest Discomfort, Frequent Urination, Increased Thirst, Weakness, Swelling, Nausea
  - Vitals: Temperature (F), Systolic BP, Diastolic BP, Heart Rate, Blood Glucose (mg/dL), Height (cm), Weight (kg)
  - Auto-calculated BMI from height and weight
  - Lifestyle: Smoking status, Alcohol use, Physical Activity level
  - Family History: multi-select condition checkboxes
  - Symptom Duration (days)
  - Voice input via Web Speech API for any field
- Step 3: Screening result

#### 3. AI Screening Engine
- Deterministic, transparent, rule-based clinical decision-support engine
- Evaluates: age, symptoms, vitals, BMI, lifestyle, family history, symptom duration
- Outputs:
  - Risk Level: LOW / MODERATE / HIGH
  - Risk Score: 0-100%
  - Likely Conditions (non-diagnostic wording only)
  - Contributing Factors (explainability)
  - Recommended Next Action
- Clinical domains assessed:
  - Diabetes risk (glucose, BMI, age, family history, urinary symptoms)
  - Hypertension/Cardiovascular risk (BP thresholds, age, smoking)
  - TB/Respiratory risk (cough duration, fever, SOB, weight loss)
  - General/Anemia risk (weakness, fatigue, demographics)
- Never claims clinical diagnosis. Uses language like:
  - "Elevated Diabetes Screening Risk - Further Evaluation Recommended"
  - "Possible Hypertension-Related Concern"
  - "Elevated TB Screening Concern - Sputum Smear Recommended"

#### 4. Explainability
- Every screening result includes human-readable contributing factors
- Examples: "Blood Glucose >= 200 mg/dL", "Persistent Cough > 14 days", "Stage 2 Blood Pressure"
- Color-coded risk badge (green/amber/red)
- Structured recommendation for ASHA worker or PHC doctor

#### 5. Medical Safety Disclaimer
- Prominent disclaimer displayed on every screening result:
  "This tool is a screening and decision-support prototype. It does not provide a medical diagnosis and does not replace evaluation by a qualified healthcare professional."
- No medicine prescription logic

#### 6. Patient Record Persistence
- Full assessment record saved with:
  - Patient info, symptoms, vitals, lifestyle, family history, BMI
  - Screening score, risk level, likely conditions, contributing factors
  - Timestamp, referral status
- Survives browser page refresh (IndexedDB + SQLite)

#### 7. PHC Dashboard
- Live metrics from actual patient data (not hardcoded):
  - Total Patients
  - Today's Assessments
  - High-Risk Patients
  - Pending Referrals
- Risk Distribution chart (Recharts - LOW/MODERATE/HIGH breakdown)
- High-Risk Priority Queue table with columns: Patient | Village | Risk | Concern | Referral Status | Action
- Inline "Mark as Referred" action per patient row
- Updates dynamically when new assessments are saved

#### 8. Patient Directory
- Searchable list of all registered patients
- Filter by name or village
- Click any patient to view full assessment history modal

#### 9. Navigation
- Prominent "+ New Assessment" CTA button (always visible in header)
- Tab navigation: Dashboard | Patients | High-Risk Cases
- Clicking "High-Risk Cases" tab filters directly to high-risk patients

#### 10. Offline-First Architecture
- All writes go to browser IndexedDB immediately (works without internet)
- Offline risk calculator mirrors server engine for fallback screening
- On network reconnect: auto-syncs pending records via POST /api/sync
- Online/Offline status pill always visible in header
- **Online detection (fixed)**: Dual-signal system in App.tsx:
  - `window` `online`/`offline` browser events catch real network drops
  - 5-second heartbeat pings `/api/health` — pill turns red if the **local backend** goes down (not just internet)
  - `isOnline` becomes `false` if EITHER signal fails; auto-sync + toast fires on reconnect


#### 11. Multilingual Support
- UI strings available in: English, Hindi (हिंदी), Bengali (বাংলা)
- Language selector in header - switches app-wide instantly

#### 12. Voice Input (Online + Offline)
- **Online mode**: Web Speech API (webkitSpeechRecognition) — microphone button transcribes speech in English, Hindi (hi-IN), or Bengali (bn-IN). Transcript appended to symptoms field.
- **Offline mode**: Automatically switches to an inline keyboard-input panel (amber UI). ASHA worker types symptoms and presses Add (or Ctrl+Enter). Text is appended identically to voice mode.
- Root cause: Web Speech API sends audio to Google cloud servers and REQUIRES internet — offline keyboard panel is the graceful degradation.
- Localised in all 3 languages (EN/HI/BN)

#### 13. AI Health Assistant Chatbot (OpenAI GPT-4o mini)
- Floating chat widget accessible across all views
- Powered by OpenAI GPT-4o mini via backend endpoint `POST /api/chat` (API key stored securely in backend `.env`)
- Answers symptom queries (e.g. fever, cough, blood sugar, high BP) with actionable guidance and home care tips
- Enforces strict rural health guardrails: no medicine prescriptions, mandatory PHC/doctor referral warnings, emergency 108 alerts for critical symptoms
- Supports multilingual interaction in English, Hindi, and Bengali with one-click suggestion pills

---

## Tech Stack

### Backend

| Technology | Version | Purpose |
|---|---|---|
| Python | 3.13 | Primary backend language |
| FastAPI | >=0.110.0 | REST API web framework |
| Uvicorn | >=0.28.0 | ASGI server running FastAPI |
| SQLAlchemy | >=2.0.28 | ORM for database operations |
| SQLite | (built-in) | Local relational database (ruralhealth.db) |
| Pydantic | >=2.6.0 | Request/response data validation |
| scikit-learn | >=1.4.0 | (Reserved) Future ML model training |
| numpy | >=1.26.0 | (Reserved) Numerical operations |
| pandas | >=2.2.0 | (Reserved) Data analytics |

### Frontend

| Technology | Version | Purpose |
|---|---|---|
| React | ^19.2.8 | UI component framework |
| TypeScript | ~6.0.2 | Type-safe JavaScript |
| Vite | ^8.2.0 | Build tool and dev server |
| Dexie | ^4.4.4 | IndexedDB wrapper for offline storage |
| dexie-react-hooks | ^4.4.0 | React hooks for Dexie live queries |
| Recharts | ^3.10.1 | Chart library (risk distribution visualization) |
| Lucide React | ^1.30.0 | Icon library |
| canvas-confetti | ^1.9.4 | Confetti animation on successful save |
| clsx | ^2.1.1 | Conditional CSS class utility |
| tailwind-merge | ^3.6.0 | Tailwind CSS class merging utility |
| TailwindCSS | ^4.3.3 | Utility-first CSS framework |
| Oxlint | ^1.75.0 | Fast JavaScript/TypeScript linter |

### Browser APIs Used
| API | Purpose |
|---|---|
| Web Speech API | Voice input transcription on assessment forms |
| IndexedDB (via Dexie) | Offline-first local data storage |
| navigator.onLine / online/offline events | Network status detection |

### Infrastructure
| Component | Details |
|---|---|
| Backend URL | http://127.0.0.1:8000 |
| Frontend URL | http://127.0.0.1:5173 (dev) |
| API Proxy | Vite proxies /api/* to backend in development |
| Database | SQLite file (backend/ruralhealth.db) - auto-created on startup |
| Version Control | Git + GitHub (https://github.com/Priyam-07-thala/ruralhealth-ai) |

---

## API Endpoints Reference

| Method | Endpoint | Request Body | Response | Purpose |
|---|---|---|---|---|
| GET | /api/health | - | {status: "ok"} | Server health check |
| POST | /api/patients | PatientCreate | PatientResponse | Register patient |
| GET | /api/patients | - | PatientResponse[] | List all patients |
| POST | /api/assess | AssessmentCreate | AssessmentResponse | Run AI screening |
| GET | /api/assessments | ?patient_id= | AssessmentResponse[] | List assessments |
| PUT | /api/assessments/{id}/referral | {status} | AssessmentResponse | Update referral |
| POST | /api/sync | SyncPayload | {synced} | Batch offline sync |
| GET | /api/dashboard/stats | - | DashboardStats | Dashboard metrics |

Interactive API docs: http://127.0.0.1:8000/docs

---

## How to Run

### Prerequisites
- Python 3.10+ with pip
- Node.js 18+ with npm

### Terminal 1 - Backend
```powershell
cd "c:\Users\User\Desktop\RuralHealth AI\backend"
pip install -r requirements.txt
python -m uvicorn main:app --host 127.0.0.1 --port 8000
```

### Terminal 2 - Frontend
```powershell
cd "c:\Users\User\Desktop\RuralHealth AI\frontend"
npm install
npm run dev -- --host 127.0.0.1 --port 5173
```

### Open App
http://127.0.0.1:5173

---

## Features NOT Yet Implemented (Future Phases)

| Feature | Phase |
|---|---|
| scikit-learn trained ML model (.pkl) | Phase 2 |
| PDF referral slip export | Phase 2 |
| PWA Service Worker + web manifest | Phase 2 |
| OCR-based form scanning | Phase 3 |
| Teleconsultation integration | Phase 3 |
| SMS/WhatsApp notifications | Phase 3 |
| Google Maps integration | Phase 3 |
| AI chatbot assistant | Phase 3 |
| District-level analytics | Phase 3 |
| Role-based access control | Phase 3 |

