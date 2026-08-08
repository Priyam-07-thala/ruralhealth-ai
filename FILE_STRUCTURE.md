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
+-- ml_engine.py      <- Deterministic clinical risk screening engine
+-- database.py       <- SQLAlchemy ORM models + SQLite connection
+-- schemas.py        <- Pydantic request/response validation schemas
+-- requirements.txt  <- Python package dependencies
```

### main.py
**Role:** API entry point. Defines all HTTP endpoints and orchestrates calls between the database and the ML engine.

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

**Connections:**
- Imports database.py for ORM session and models
- Imports schemas.py for request/response validation
- Imports ml_engine.py to run screening on each assessment
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
    |   +-- VoiceInputButton.tsx   <- Web Speech API voice input
    +-- db/
    |   +-- offlineDb.ts           <- Dexie IndexedDB + offline risk fallback
    +-- i18n/
        +-- translations.ts        <- EN/HI/BN multilingual dictionary
```

---

### Component Descriptions

**main.tsx** - Bootstraps the React app into index.html. Renders App.tsx and imports index.css.

**App.tsx** - Root component. Manages view routing (Dashboard/Patients/Assessment/High-Risk), network online/offline detection, offline sync via POST /api/sync, and language state.

**Header.tsx** - Top nav bar. Contains: "+ New Assessment" CTA, tab navigation, language selector (EN/HI/BN), and Online/Offline status pill. Receives props from App.tsx.

**AshaScreeningFlow.tsx** - Core 3-step mobile-first screening wizard:
- Step 1: Patient registration with validation (name, age, gender, village required)
- Step 2: Health assessment (12 symptom pills, vitals, auto-BMI, lifestyle, family history, symptom duration, voice input)
- Step 3: Screening result (risk badge, score, conditions, contributing factors, recommendation, disclaimer, save button)

**PhcDashboard.tsx** - Doctor/district analytics dashboard. Shows summary cards (total patients, today's count, high-risk, pending referrals), Recharts risk distribution chart, and filterable High-Risk Priority Queue table with inline referral actions.

**PatientDirectory.tsx** - Searchable patient registry. Search by name/village. Click patient to open assessment history modal.

**MedicalDisclaimer.tsx** - Reusable disclaimer banner. Displayed on screening result step.

**VoiceInputButton.tsx** - Microphone button using Web Speech API. Gracefully disabled if browser unsupported.

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

