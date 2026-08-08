# File Structure & Architecture Map

> **Last Updated:** Phase 1 - P0 Core MVP Vertical Slice
> This document is updated automatically after every new feature or structural change.

---

## Project Root

```
RuralHealth AI/
+-- .gitignore              <- Git ignore rules (root-level)
+-- PROJECT_AUDIT.md        <- Initial audit of implemented vs. missing features
+-- FILE_STRUCTURE.md       <- This file - architecture map (auto-updated)
+-- FEATURES_AND_STACK.md   <- Feature list & tech stack reference (auto-updated)
+-- backend/                <- Python FastAPI server
+-- frontend/               <- React + Vite web application
```

---

## Backend (backend/)

The backend is a Python FastAPI REST API that handles data persistence, AI screening logic, and dashboard aggregation. It communicates with the frontend over HTTP on http://127.0.0.1:8000.

```
backend/
+-- main.py           <- FastAPI application entry point & all API routes
+-- ml_engine.py      <- Deterministic clinical risk screening engine (vitals + lifestyle)
+-- database.py       <- SQLAlchemy ORM models + SQLite connection
+-- schemas.py        <- Pydantic request/response validation schemas
+-- requirements.txt  <- Python package dependencies
+-- .env              <- Local environment variables (OPENAI_API_KEY) — not committed
+-- data/
|   +-- Final_Augmented_dataset_Diseases_and_Symptoms.csv  <- Disease & Symptoms dataset (246,945 rows, not committed)
+-- ml/
    +-- train_model.py    <- One-time training script: preprocess, train LR+RF, evaluate, save artifacts
    +-- predictor.py      <- Singleton ML prediction service: loaded once at startup
    +-- test_predictor.py <- Automated tests for predictor.py (5 test cases)
    +-- test_api.py       <- Automated tests for POST /api/ml/predict endpoint
    +-- training_report.md  <- Auto-generated training & evaluation report
    +-- models/
        +-- disease_model.joblib      <- Trained Logistic Regression classifier
        +-- label_encoder.joblib      <- LabelEncoder for disease class names
        +-- feature_names.json        <- Ordered list of 328 symptom feature names
        +-- supported_classes.json    <- 512 supported disease classes (>= 20 samples)
        +-- model_metadata.json       <- Training metrics, cleaning stats, model info
```

### main.py
**Role:** API entry point. Defines all HTTP endpoints and orchestrates calls between the database, ML engine, and real ML predictor.

| Endpoint | Method | Purpose |
|---|---|---|
| /api/health | GET | Health check - confirms server is alive |
| /api/patients | POST | Register a new patient |
| /api/patients | GET | List all registered patients |
| /api/assess | POST | Submit health assessment -> calls ml_engine -> saves result |
| /api/assessments | GET | List all assessments (optional: filter by patient_id) |
| /api/assessments/{id}/referral | PUT | Update referral status of an assessment |
| /api/sync | POST | Batch-sync offline patient/assessment records from IndexedDB |
| /api/dashboard/stats | GET | Aggregate dashboard metrics |
| /api/ml/predict | POST | Real ML disease classification from symptom list (Top-3 predictions) |
| /api/chat | POST | OpenAI GPT-4o mini health chatbot endpoint |

**Connections:**
- Imports database.py for ORM session and models
- Imports schemas.py for request/response validation
- Imports ml_engine.py to run risk screening on each assessment
- Imports ml/predictor.py (singleton) for real symptom-based disease classification
- Called by the React frontend via fetch() API calls

---

### ml_engine.py
**Role:** The AI/clinical decision-support brain. Takes patient vitals, symptoms, lifestyle, and family history and produces a structured risk report.

**Output fields:** risk_level (LOW/MODERATE/HIGH), score (0-100), likely_conditions, contributing_factors, recommendation, disclaimer

**Logic uses threshold-based clinical rules for:**
- Diabetes risk (glucose, BMI, age, family history, frequent urination)
- Hypertension risk (systolic/diastolic BP, age, smoking)
- TB/Respiratory risk (cough duration, fever, weight loss, shortness of breath)
- Anemia/General weakness risk (symptoms + demographics)

**Connections:** Called exclusively by main.py (POST /api/assess)

---

### database.py
**Role:** Defines the SQLite database connection and SQLAlchemy ORM table models.

| Model | Table | Key Fields |
|---|---|---|
| PatientModel | patients | id, name, age, gender, village, phone, patient_id, created_at |
| AssessmentModel | assessments | id, patient_id (FK), symptoms, vitals (JSON), risk_level, score, likely_conditions, contributing_factors, recommendation, referral_status, timestamp |

**Connections:** Imported by main.py; ruralhealth.db auto-created on first server start; .gitignored

---

### schemas.py
**Role:** Pydantic data schemas for automatic request validation and response serialization.

Key schemas: PatientCreate, PatientResponse, AssessmentCreate, AssessmentResponse, SyncPayload, DashboardStats

**Connections:** Used as type annotations in main.py; auto-generates OpenAPI docs at http://127.0.0.1:8000/docs

---

### requirements.txt
| Package | Purpose |
|---|---|
| fastapi | Web framework |
| uvicorn | ASGI server |
| pydantic | Data validation |
| sqlalchemy | ORM for database |
| scikit-learn | (Reserved) Future ML model training |
| numpy | (Reserved) Numerical operations |
| pandas | (Reserved) Data manipulation |

---

## Frontend (frontend/)

The frontend is a React + Vite + TypeScript single-page application for ASHA health workers, PHC doctors, and district officers.

```
frontend/
+-- index.html
+-- vite.config.ts            <- API proxy to port 8000
+-- package.json
+-- tsconfig.json / tsconfig.app.json / tsconfig.node.json
+-- .gitignore / .oxlintrc.json
+-- public/
|   +-- favicon.svg
|   +-- icons.svg
+-- src/
    +-- main.tsx              <- React bootstrap
    +-- App.tsx               <- Root component (routing, network, sync)
    +-- App.css
    +-- index.css             <- Global styles and design tokens
    +-- assets/
    |   +-- hero.png
    +-- components/
    |   +-- Header.tsx             <- Top navigation bar
    |   +-- AshaScreeningFlow.tsx  <- 3-step screening wizard (CORE)
    |   +-- PhcDashboard.tsx       <- PHC doctor analytics dashboard
    |   +-- PatientDirectory.tsx   <- Patient list + history viewer
    |   +-- MedicalDisclaimer.tsx  <- Reusable disclaimer banner
    |   +-- VoiceInputButton.tsx   <- Voice input (online mic) / keyboard panel (offline fallback)
    |   +-- HealthChatbot.tsx      <- Floating AI health assistant (OpenAI GPT-4o mini)
    +-- db/
    |   +-- offlineDb.ts           <- Dexie IndexedDB + offline risk fallback
    +-- i18n/
        +-- translations.ts        <- EN/HI/BN multilingual dictionary
```

---

### Component Descriptions

**main.tsx** - Bootstraps the React app into index.html. Renders App.tsx and imports index.css.

**App.tsx** - Root component. Manages view routing (Dashboard/Patients/Assessment/High-Risk), network online/offline detection, offline sync, and language state.
- **Online detection**: Dual-signal system — (1) native `window` `online`/`offline` browser events for real network drops + (2) a 5-second heartbeat pinging `/api/health` to detect if the local backend is down. `isOnline` becomes `false` if EITHER the network disconnects OR the backend stops responding.
- Watches `isOnline` via a separate `useEffect` to show toast notifications and auto-trigger sync on reconnect.

**Header.tsx** - Top nav bar. Contains: "+ New Assessment" CTA, tab navigation, language selector (EN/HI/BN), and Online/Offline status pill. Receives props from App.tsx.

**AshaScreeningFlow.tsx** - Core 3-step mobile-first screening wizard:
- Step 1: Patient registration with validation (name, age, gender, village required)
- Step 2: Health assessment (12 symptom pills, vitals, auto-BMI, lifestyle, family history, symptom duration, voice input)
- Step 3: Screening result (risk badge, score, conditions, contributing factors, recommendation, disclaimer, save button)

**PhcDashboard.tsx** - Doctor/district analytics dashboard. Shows summary cards (total patients, today's count, high-risk, pending referrals), Recharts risk distribution chart, and filterable High-Risk Priority Queue table with inline referral actions.

**PatientDirectory.tsx** - Searchable patient registry. Search by name/village. Click patient to open assessment history modal.

**MedicalDisclaimer.tsx** - Reusable disclaimer banner. Displayed on screening result step.

**VoiceInputButton.tsx** - Adaptive dual-mode input button:
- **Online mode**: Web Speech API (webkitSpeechRecognition) — mic button transcribes speech in en-IN / hi-IN / bn-IN. Transcript appended to the symptoms field.
- **Offline mode**: Automatically switches to an inline amber keyboard-input panel because the Web Speech API sends audio to Google's servers and REQUIRES internet. The ASHA worker types symptoms and presses Add or Ctrl+Enter — text is appended identically to voice mode.
- Receives `isOnline` prop from App.tsx (via AshaScreeningFlow.tsx) to switch modes reactively.
- All panel strings are localised in EN / HI / BN via translations.ts.

**HealthChatbot.tsx** - Floating AI health assistant widget:
- Powered by OpenAI GPT-4o mini via backend `POST /api/chat`
- Multi-turn conversation history with quick-prompt pills for fever, cough, blood sugar, etc.
- Localised prompts & strings for English, Hindi, Bengali
- Strict safety guardrails and medical disclaimers on every AI response


**offlineDb.ts** - Two responsibilities:
1. Dexie IndexedDB wrapper (patients + assessments tables; syncs to server on reconnect)
2. Offline risk calculator (JS mirror of ml_engine.py for offline screening)

**translations.ts** - Multilingual string dictionary for en/hi/bn. Used throughout components.

---

## Data Flow

```
[Browser - ASHA Worker / PHC Doctor]
         |
         v
[React Frontend - localhost:5173]
    App.tsx
         |
    +----+-------------------+
    |                        |
Header.tsx          AshaScreeningFlow.tsx
                            |
                    +-------+-------+
                    |               |
             POST /api/patients   POST /api/assess
             (register patient)  (get risk result)
                    |               |
                    v               v
          [FastAPI Backend - localhost:8000]
                    |
          +---------+---------+
          |         |         |
       main.py  ml_engine.py  database.py
                              |
                        ruralhealth.db (SQLite)

PhcDashboard.tsx:
  GET /api/dashboard/stats
  GET /api/assessments
  PUT /api/assessments/{id}/referral

PatientDirectory.tsx:
  GET /api/patients
  GET /api/assessments?patient_id=X

[Offline Mode]
  offlineDb.ts --> IndexedDB (browser storage)
  On reconnect --> POST /api/sync --> server merges records
```

---

## Key Connections Summary

| From | To | Method |
|---|---|---|
| main.tsx | App.tsx | React render |
| App.tsx | Header.tsx | Props |
| App.tsx | AshaScreeningFlow.tsx | Props + callback |
| App.tsx | PhcDashboard.tsx | Props + refresh trigger |
| App.tsx | PatientDirectory.tsx | Props |
| App.tsx | offlineDb.ts | Sync on reconnect |
| AshaScreeningFlow.tsx | /api/patients | HTTP POST |
| AshaScreeningFlow.tsx | /api/assess | HTTP POST |
| AshaScreeningFlow.tsx | offlineDb.ts | Offline fallback |
| PhcDashboard.tsx | /api/dashboard/stats | HTTP GET |
| PhcDashboard.tsx | /api/assessments | HTTP GET |
| PhcDashboard.tsx | /api/assessments/{id}/referral | HTTP PUT |
| main.py | ml_engine.py | Python function call |
| main.py | database.py | SQLAlchemy session |
| main.py | schemas.py | Pydantic validation |

