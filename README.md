# RuralHealth AI 🏥🤖

An AI-Powered Early Disease Risk Prediction & Rural Health Access Platform designed for ASHA workers, PHC doctors, and rural patients in India.

## 🌟 Overview
RuralHealth AI is an offline-first, mobile-responsive web application that bridges the gap in rural healthcare access. It allows health workers to register patients, record their vitals and symptoms (even offline and via voice dictation in multiple languages), and receive immediate, explainable AI-driven clinical risk assessments.

## ✨ Key Features
- **Mobile & Offline-First**: Fully functional in low-connectivity rural areas. Data is stored in the browser using IndexedDB and automatically syncs to the server when an internet connection is restored.
- **Explainable AI Risk Engine**: A deterministic clinical decision-support engine that evaluates vitals, symptoms, and lifestyle factors to predict health risks (Low/Moderate/High) with clear explanations.
- **Real ML Disease Classifier**: A secondary symptom-based disease classification engine powered by a Logistic Regression model trained on a 246,000+ row dataset, deployed as a FastApi singleton.
- **Teleconsultation Booking (Dual-Map)**: An interactive hospital finder. Uses Google Maps as the primary engine and seamlessly falls back to OpenStreetMap (Leaflet) if no API key is provided or Google Maps fails.
- **Multilingual Support & Voice Input**: Switch the entire UI instantly between English, Hindi, and Bengali. Supports hands-free voice dictation of symptoms using the Web Speech API (with a seamless fallback to an offline typing panel).
- **AI Health Assistant Chatbot**: Integrated OpenAI GPT-4o mini floating chat widget that provides home care tips with strict medical safety guardrails.
- **Engaging UI/UX**: Includes an interactive context-aware Doctor Mascot that reacts dynamically to patient risk scores, and a beautiful medical-themed trailing cursor animation.
- **PHC Doctor Dashboard**: District officers and doctors can view real-time risk distribution metrics and a priority queue of high-risk patients awaiting referral.

## 🛠️ Technology Stack
- **Frontend**: React 19, TypeScript, Vite, Tailwind CSS, Lucide Icons, Dexie.js (IndexedDB), Recharts.
- **Backend**: Python 3.13, FastAPI, Uvicorn, SQLAlchemy, SQLite, Pydantic, Scikit-Learn.
- **APIs**: Web Speech API, OpenAI API, Google Maps Platform.

## 🚀 How to Run Locally

### Prerequisites
- [Node.js 18+](https://nodejs.org/)
- [Python 3.10+](https://www.python.org/)

### 1. Clone the repository
```bash
git clone https://github.com/Priyam-07-thala/ruralhealth-ai.git
cd ruralhealth-ai
```

### 2. Backend Setup
Open a terminal and navigate to the backend folder:
```bash
cd backend

# Create and activate a virtual environment (optional but recommended)
python -m venv venv
# On Windows:
venv\Scripts\activate
# On Mac/Linux:
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Set up environment variables
cp .env.example .env
# Edit .env and add your OPENAI_API_KEY

# Run the FastAPI server
python -m uvicorn main:app --host 127.0.0.1 --port 8000 --reload
```
*The backend API will run at `http://127.0.0.1:8000`. You can view the interactive Swagger docs at `http://127.0.0.1:8000/docs`.*

### 3. Frontend Setup
Open a second terminal and navigate to the frontend folder:
```bash
cd frontend

# Install dependencies
npm install

# Set up environment variables
cp .env.example .env
# Edit .env and add your VITE_GOOGLE_MAPS_API_KEY (optional, falls back to OpenStreetMap if omitted)

# Start the development server
npm run dev
```
*The frontend will run at `http://localhost:5173`. Open this URL in your browser to start using RuralHealth AI!*

## Drive Video Link
### https://drive.google.com/file/d/1h_03v0dPRL_zMRVGjCnYnOE2QUSFpCmz/view?usp=drive_link
## 📜 License
This project was built for the RuralHealth AI Hackathon.
