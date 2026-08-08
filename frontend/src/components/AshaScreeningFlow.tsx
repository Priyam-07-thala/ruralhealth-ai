import React, { useState } from 'react';
import { 
  UserPlus, Stethoscope, 
  ArrowRight, Activity, Heart, ShieldAlert, 
  Thermometer, Phone, MapPin, Sparkles, Send, AlertCircle
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { VoiceInputButton } from './VoiceInputButton';
import { MedicalDisclaimer } from './MedicalDisclaimer';
import { translations, type Language } from '../i18n/translations';
import { db, type LocalAssessment, evaluateOfflineRisk } from '../db/offlineDb';

interface AshaScreeningFlowProps {
  lang: Language;
  isOnline: boolean;
  onAssessmentComplete: () => void;
}

export const AshaScreeningFlow: React.FC<AshaScreeningFlowProps> = ({
  lang,
  isOnline,
  onAssessmentComplete
}) => {
  const t = translations[lang];

  // Steps: 1 = Patient Reg, 2 = Vitals/Symptoms, 3 = AI Result
  const [step, setStep] = useState<1 | 2 | 3>(1);

  // Form State
  const [patientId, setPatientId] = useState<string>('');
  const [name, setName] = useState<string>('');
  const [age, setAge] = useState<number | ''>(45);
  const [gender, setGender] = useState<string>('Female');
  const [village, setVillage] = useState<string>('Sonpur');
  const [phone, setPhone] = useState<string>('9876543210');
  const [customId, setCustomId] = useState<string>('');

  // Validation Error State
  const [errors, setErrors] = useState<{ name?: string; age?: string; village?: string; gender?: string }>({});

  // Assessment Inputs
  const [symptomsText, setSymptomsText] = useState<string>('');
  const [symptomDuration, setSymptomDuration] = useState<number>(3);
  const [tempF, setTempF] = useState<number>(98.6);
  const [systolic, setSystolic] = useState<number>(135);
  const [diastolic, setDiastolic] = useState<number>(85);
  const [glucose, setGlucose] = useState<number>(150);
  const [heartRate, setHeartRate] = useState<number>(78);
  const [heightCm, setHeightCm] = useState<number>(160);
  const [weightKg, setWeightKg] = useState<number>(62);
  const [smoking, setSmoking] = useState<string>('Never');
  const [alcohol, setAlcohol] = useState<string>('Never');
  const [physicalActivity, setPhysicalActivity] = useState<string>('Moderate');
  const [familyHistory, setFamilyHistory] = useState<string[]>(['Diabetes']);

  // Calculated BMI
  const bmi = heightCm > 0 ? Number((weightKg / ((heightCm / 100) ** 2)).toFixed(1)) : 24.2;

  // Analysis State
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [activeAssessment, setActiveAssessment] = useState<LocalAssessment | null>(null);

  // Common symptoms
  const commonSymptoms = [
    'Fever',
    'Cough',
    'Fatigue',
    'Headache',
    'Dizziness',
    'Shortness of breath',
    'Chest discomfort',
    'Frequent urination',
    'Increased thirst',
    'Weakness',
    'Swelling',
    'Nausea'
  ];

  const toggleSymptomPill = (sym: string) => {
    let currentList = symptomsText ? symptomsText.split(',').map(s => s.trim()).filter(Boolean) : [];
    if (currentList.includes(sym)) {
      currentList = currentList.filter(s => s !== sym);
    } else {
      currentList.push(sym);
    }
    setSymptomsText(currentList.join(', '));
  };

  const validatePatientForm = (): boolean => {
    const errs: { name?: string; age?: string; village?: string; gender?: string } = {};
    if (!name.trim()) errs.name = 'Full Name is required';
    if (!age || age <= 0 || age > 120) errs.age = 'Please enter a valid age between 1 and 120';
    if (!village.trim()) errs.village = 'Village / Ward is required';
    if (!gender) errs.gender = 'Gender is required';

    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handlePatientSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!validatePatientForm()) return;
    const generatedId = patientId || `p_${Date.now()}`;
    setPatientId(generatedId);
    setStep(2);
  };

  const runAnalysis = async () => {
    setIsAnalyzing(true);
    const symptomsList = symptomsText ? symptomsText.split(',').map(s => s.trim()).filter(Boolean) : [];

    const payload = {
      patient_id: patientId,
      symptoms: symptomsList,
      symptom_duration_days: Number(symptomDuration),
      temperature_f: Number(tempF),
      systolic_bp: Number(systolic),
      diastolic_bp: Number(diastolic),
      glucose_mg_dl: Number(glucose),
      heart_rate_bpm: Number(heartRate),
      height_cm: Number(heightCm),
      weight_kg: Number(weightKg),
      bmi: Number(bmi),
      smoking_status: smoking,
      alcohol_status: alcohol,
      physical_activity: physicalActivity,
      family_history: familyHistory
    };

    let resultData: any = null;

    if (isOnline) {
      try {
        // Register/Save patient online
        await fetch('http://127.0.0.1:8000/api/patients', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: patientId,
            name,
            age: Number(age),
            gender,
            village,
            phone,
            patient_id: customId || `RH-${patientId.slice(-4).toUpperCase()}`
          })
        });

        // Run AI Screening
        const aRes = await fetch('http://127.0.0.1:8000/api/assess', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        resultData = await aRes.json();

        // Save locally to Dexie as synced
        const localAss: LocalAssessment = {
          ...resultData,
          patient_name: name,
          village,
          synced: true
        };
        await db.patients.put({
          id: patientId,
          name,
          age: Number(age),
          gender,
          village,
          phone,
          patient_id: customId || `RH-${patientId.slice(-4).toUpperCase()}`,
          created_at: new Date().toISOString(),
          synced: true
        });
        await db.assessments.put(localAss);
      } catch (err) {
        console.warn('Online API call failed, falling back to offline Dexie mode', err);
        resultData = null;
      }
    }

    // Offline fallback or failed online request
    if (!resultData) {
      const offlineEval = evaluateOfflineRisk(payload as any);
      const assId = `ass_${Date.now()}`;
      resultData = {
        ...payload,
        id: assId,
        patient_name: name,
        village,
        ...offlineEval,
        referral_status: offlineEval.risk_level === 'HIGH' ? 'REFERRED' : 'NOT_REFERRED',
        created_at: new Date().toISOString(),
        synced: false
      };

      // Save locally to IndexedDB as un-synced
      await db.patients.put({
        id: patientId,
        name,
        age: Number(age),
        gender,
        village,
        phone,
        patient_id: customId || `RH-${patientId.slice(-4).toUpperCase()}`,
        created_at: new Date().toISOString(),
        synced: false
      });
      await db.assessments.put(resultData);
    }

    setActiveAssessment(resultData);
    setIsAnalyzing(false);
    setStep(3);
    onAssessmentComplete();

    if (resultData.risk_level === 'HIGH') {
      confetti({
        particleCount: 50,
        spread: 60,
        origin: { y: 0.6 }
      });
    }
  };

  const updateReferral = async (newStatus: 'REFERRED' | 'APPOINTMENT_REQUESTED' | 'CONSULTATION_COMPLETED') => {
    if (!activeAssessment) return;

    // Update state locally
    const updated = { ...activeAssessment, referral_status: newStatus };
    setActiveAssessment(updated);
    await db.assessments.put({ ...updated, synced: false });

    if (isOnline) {
      try {
        await fetch(`http://127.0.0.1:8000/api/assessments/${activeAssessment.id}/referral`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ referral_status: newStatus })
        });
        await db.assessments.put({ ...updated, synced: true });
      } catch (err) {
        console.warn('Referral sync pending offline', err);
      }
    }

    confetti({
      particleCount: 70,
      spread: 70,
      origin: { y: 0.7 }
    });
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-6">
      
      {/* Wizard Progress Bar */}
      <div className="mb-8">
        <div className="flex items-center justify-between text-xs sm:text-sm font-bold text-slate-600 mb-2">
          <span className={`flex items-center gap-1 ${step >= 1 ? 'text-emerald-700 font-extrabold' : ''}`}>
            <UserPlus className="w-4 h-4" /> 1. {t.regTitle}
          </span>
          <span className={`flex items-center gap-1 ${step >= 2 ? 'text-emerald-700 font-extrabold' : ''}`}>
            <Stethoscope className="w-4 h-4" /> 2. {t.assessmentTitle}
          </span>
          <span className={`flex items-center gap-1 ${step >= 3 ? 'text-emerald-700 font-extrabold' : ''}`}>
            <Activity className="w-4 h-4" /> 3. {t.riskResultTitle}
          </span>
        </div>
        <div className="w-full bg-slate-200 rounded-full h-2 overflow-hidden shadow-inner">
          <div
            className="bg-gradient-to-r from-emerald-500 to-teal-400 h-2 transition-all duration-300 rounded-full"
            style={{ width: step === 1 ? '33%' : step === 2 ? '66%' : '100%' }}
          ></div>
        </div>
      </div>

      {/* STEP 1: PATIENT REGISTRATION */}
      {step === 1 && (
        <div className="bg-white rounded-3xl p-6 sm:p-8 shadow-xl border border-slate-100">
          <div className="flex items-center gap-3 mb-6 pb-4 border-b border-slate-100">
            <div className="w-12 h-12 rounded-2xl bg-emerald-100 text-emerald-800 flex items-center justify-center font-bold">
              <UserPlus className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-xl font-extrabold text-slate-900">{t.regTitle}</h2>
              <p className="text-xs text-slate-500 font-medium">Step 1 of 3: Enter patient demographical details</p>
            </div>
          </div>

          <form onSubmit={handlePatientSubmit} className="space-y-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                  {t.fullName} *
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value);
                    if (errors.name) setErrors((prev) => ({ ...prev, name: undefined }));
                  }}
                  placeholder="e.g. Ramesh Kumar / Devi"
                  className={`w-full text-base font-semibold px-4 py-3 rounded-xl border ${
                    errors.name ? 'border-rose-500 bg-rose-50' : 'border-slate-300'
                  } focus:ring-2 focus:ring-emerald-500 outline-none transition-all`}
                />
                {errors.name && (
                  <p className="text-xs font-bold text-rose-600 mt-1 flex items-center gap-1">
                    <AlertCircle className="w-3.5 h-3.5" /> {errors.name}
                  </p>
                )}
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                  {t.village} *
                </label>
                <div className="relative">
                  <MapPin className="w-5 h-5 text-slate-400 absolute left-3.5 top-3.5" />
                  <input
                    type="text"
                    value={village}
                    onChange={(e) => {
                      setVillage(e.target.value);
                      if (errors.village) setErrors((prev) => ({ ...prev, village: undefined }));
                    }}
                    placeholder="e.g. Sonpur, Rampur, Belur"
                    className={`w-full text-base font-semibold pl-11 pr-4 py-3 rounded-xl border ${
                      errors.village ? 'border-rose-500 bg-rose-50' : 'border-slate-300'
                    } focus:ring-2 focus:ring-emerald-500 outline-none transition-all`}
                  />
                </div>
                {errors.village && (
                  <p className="text-xs font-bold text-rose-600 mt-1 flex items-center gap-1">
                    <AlertCircle className="w-3.5 h-3.5" /> {errors.village}
                  </p>
                )}
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                  {t.age} *
                </label>
                <input
                  type="number"
                  min={1}
                  max={120}
                  value={age}
                  onChange={(e) => {
                    setAge(e.target.value ? Number(e.target.value) : '');
                    if (errors.age) setErrors((prev) => ({ ...prev, age: undefined }));
                  }}
                  className={`w-full text-base font-semibold px-4 py-3 rounded-xl border ${
                    errors.age ? 'border-rose-500 bg-rose-50' : 'border-slate-300'
                  } focus:ring-2 focus:ring-emerald-500 outline-none transition-all`}
                />
                {errors.age && (
                  <p className="text-xs font-bold text-rose-600 mt-1 flex items-center gap-1">
                    <AlertCircle className="w-3.5 h-3.5" /> {errors.age}
                  </p>
                )}
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                  {t.gender} *
                </label>
                <select
                  value={gender}
                  onChange={(e) => setGender(e.target.value)}
                  className="w-full text-base font-semibold px-4 py-3 rounded-xl border border-slate-300 focus:ring-2 focus:ring-emerald-500 outline-none transition-all bg-white"
                >
                  <option value="Female">{t.female}</option>
                  <option value="Male">{t.male}</option>
                  <option value="Other">{t.other}</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                  {t.phone}
                </label>
                <div className="relative">
                  <Phone className="w-5 h-5 text-slate-400 absolute left-3.5 top-3.5" />
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="10-digit mobile number"
                    className="w-full text-base font-semibold pl-11 pr-4 py-3 rounded-xl border border-slate-300 focus:ring-2 focus:ring-emerald-500 outline-none transition-all"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                  {t.optionalId}
                </label>
                <input
                  type="text"
                  value={customId}
                  onChange={(e) => setCustomId(e.target.value)}
                  placeholder="e.g. ABHA ID or RH-102"
                  className="w-full text-base font-semibold px-4 py-3 rounded-xl border border-slate-300 focus:ring-2 focus:ring-emerald-500 outline-none transition-all"
                />
              </div>
            </div>

            <div className="pt-4 flex justify-end">
              <button
                type="submit"
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-8 py-4 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-base rounded-2xl shadow-lg shadow-emerald-600/30 hover:scale-[1.02] active:scale-95 transition-all"
              >
                <span>{t.registerBtn}</span>
                <ArrowRight className="w-5 h-5" />
              </button>
            </div>
          </form>
        </div>
      )}

      {/* STEP 2: CLINICAL VITALS & SYMPTOMS */}
      {step === 2 && (
        <div className="bg-white rounded-3xl p-6 sm:p-8 shadow-xl border border-slate-100">
          
          {/* Header info */}
          <div className="flex items-center justify-between pb-4 mb-6 border-b border-slate-100">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-teal-100 text-teal-800 flex items-center justify-center font-bold">
                <Stethoscope className="w-6 h-6" />
              </div>
              <div>
                <h2 className="text-xl font-extrabold text-slate-900">{t.assessmentTitle}</h2>
                <p className="text-xs text-slate-500 font-medium">Patient: <span className="font-bold text-slate-800">{name}</span> ({age}y, {village})</p>
              </div>
            </div>

            <button
              onClick={() => setStep(1)}
              className="text-xs font-bold text-slate-500 hover:text-slate-800 underline"
            >
              Edit Patient
            </button>
          </div>

          <div className="space-y-6">
            
            {/* Symptoms Input with Voice Support */}
            <div className="bg-slate-50 p-5 rounded-2xl border border-slate-200">
              <div className="flex items-center justify-between mb-2">
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-800">
                  {t.symptomsLabel}
                </label>
                <VoiceInputButton
                  lang={lang}
                  onTranscript={(transcript) => {
                    setSymptomsText((prev) => (prev ? `${prev}, ${transcript}` : transcript));
                  }}
                />
              </div>

              <textarea
                rows={3}
                value={symptomsText}
                onChange={(e) => setSymptomsText(e.target.value)}
                placeholder={t.symptomsPlaceholder}
                className="w-full text-sm font-semibold p-3 rounded-xl border border-slate-300 focus:ring-2 focus:ring-teal-500 focus:border-teal-500 outline-none transition-all"
              ></textarea>

              {/* Touch-Friendly Symptom Tag Pills */}
              <div className="mt-3">
                <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2">Touch-Friendly Symptoms Select:</p>
                <div className="flex flex-wrap gap-2">
                  {commonSymptoms.map((sym) => {
                    const isSelected = symptomsText.includes(sym);
                    return (
                      <button
                        key={sym}
                        type="button"
                        onClick={() => toggleSymptomPill(sym)}
                        className={`text-xs font-bold px-3.5 py-2 rounded-xl transition-all border ${
                          isSelected
                            ? 'bg-teal-700 text-white border-teal-800 shadow-md scale-105'
                            : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
                        }`}
                      >
                        {sym} {isSelected ? '✓' : '+'}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Vitals Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1">
                  {t.symptomDuration}
                </label>
                <input
                  type="number"
                  min={1}
                  value={symptomDuration}
                  onChange={(e) => setSymptomDuration(Number(e.target.value))}
                  className="w-full text-base font-semibold px-4 py-2.5 rounded-xl border border-slate-300 focus:ring-2 focus:ring-teal-500 outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1">
                  {t.temp}
                </label>
                <div className="relative">
                  <Thermometer className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                  <input
                    type="number"
                    step="0.1"
                    value={tempF}
                    onChange={(e) => setTempF(Number(e.target.value))}
                    className="w-full text-base font-semibold pl-9 pr-4 py-2.5 rounded-xl border border-slate-300 focus:ring-2 focus:ring-teal-500 outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1">
                  {t.glucose}
                </label>
                <input
                  type="number"
                  value={glucose}
                  onChange={(e) => setGlucose(Number(e.target.value))}
                  className="w-full text-base font-semibold px-4 py-2.5 rounded-xl border border-slate-300 focus:ring-2 focus:ring-teal-500 outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1">
                  {t.bpSystolic}
                </label>
                <input
                  type="number"
                  value={systolic}
                  onChange={(e) => setSystolic(Number(e.target.value))}
                  className="w-full text-base font-semibold px-4 py-2.5 rounded-xl border border-slate-300 focus:ring-2 focus:ring-teal-500 outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1">
                  {t.bpDiastolic}
                </label>
                <input
                  type="number"
                  value={diastolic}
                  onChange={(e) => setDiastolic(Number(e.target.value))}
                  className="w-full text-base font-semibold px-4 py-2.5 rounded-xl border border-slate-300 focus:ring-2 focus:ring-teal-500 outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1">
                  {t.heartRate}
                </label>
                <input
                  type="number"
                  value={heartRate}
                  onChange={(e) => setHeartRate(Number(e.target.value))}
                  className="w-full text-base font-semibold px-4 py-2.5 rounded-xl border border-slate-300 focus:ring-2 focus:ring-teal-500 outline-none"
                />
              </div>
            </div>

            {/* Height, Weight & Computed BMI */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 bg-emerald-50/50 p-4 rounded-2xl border border-emerald-100">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1">
                  {t.height}
                </label>
                <input
                  type="number"
                  value={heightCm}
                  onChange={(e) => setHeightCm(Number(e.target.value))}
                  className="w-full text-base font-semibold px-4 py-2 rounded-xl border border-slate-300 bg-white focus:ring-2 focus:ring-teal-500 outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1">
                  {t.weight}
                </label>
                <input
                  type="number"
                  value={weightKg}
                  onChange={(e) => setWeightKg(Number(e.target.value))}
                  className="w-full text-base font-semibold px-4 py-2 rounded-xl border border-slate-300 bg-white focus:ring-2 focus:ring-teal-500 outline-none"
                />
              </div>

              <div className="flex flex-col justify-center">
                <span className="block text-xs font-bold uppercase tracking-wider text-emerald-800">
                  {t.bmiLabel}
                </span>
                <div className="text-xl font-black text-emerald-900 mt-1 flex items-center gap-2">
                  <span>{bmi} kg/m²</span>
                  <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                    bmi >= 30 ? 'bg-rose-200 text-rose-800' : bmi >= 25 ? 'bg-amber-200 text-amber-800' : 'bg-emerald-200 text-emerald-800'
                  }`}>
                    {bmi >= 30 ? 'Obese' : bmi >= 25 ? 'Overweight' : 'Normal'}
                  </span>
                </div>
              </div>
            </div>

            {/* Habits & Physical Activity */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1">
                  {t.smoking}
                </label>
                <select
                  value={smoking}
                  onChange={(e) => setSmoking(e.target.value)}
                  className="w-full text-sm font-semibold p-3 rounded-xl border border-slate-300 bg-white focus:ring-2 focus:ring-teal-500 outline-none"
                >
                  <option value="Never">Never</option>
                  <option value="Former">Former Smoker</option>
                  <option value="Current">Current Tobacco User</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1">
                  {t.alcohol}
                </label>
                <select
                  value={alcohol}
                  onChange={(e) => setAlcohol(e.target.value)}
                  className="w-full text-sm font-semibold p-3 rounded-xl border border-slate-300 bg-white focus:ring-2 focus:ring-teal-500 outline-none"
                >
                  <option value="Never">Never</option>
                  <option value="Occasional">Occasional</option>
                  <option value="Regular">Regular Consumption</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1">
                  Physical Activity
                </label>
                <select
                  value={physicalActivity}
                  onChange={(e) => setPhysicalActivity(e.target.value)}
                  className="w-full text-sm font-semibold p-3 rounded-xl border border-slate-300 bg-white focus:ring-2 focus:ring-teal-500 outline-none"
                >
                  <option value="Active">Active / Heavy Labour</option>
                  <option value="Moderate">Moderate Daily Activity</option>
                  <option value="Sedentary">Sedentary / Inactive</option>
                </select>
              </div>
            </div>

            {/* Family History Checkboxes */}
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-2">
                {t.familyHistory}
              </label>
              <div className="flex flex-wrap gap-4">
                {['Diabetes', 'Hypertension', 'Tuberculosis (TB)', 'Heart Disease', 'Asthma'].map((item) => (
                  <label key={item} className="inline-flex items-center gap-2 cursor-pointer text-xs font-semibold text-slate-700">
                    <input
                      type="checkbox"
                      checked={familyHistory.includes(item)}
                      onChange={(e) => {
                        if (e.target.checked) setFamilyHistory([...familyHistory, item]);
                        else setFamilyHistory(familyHistory.filter(f => f !== item));
                      }}
                      className="w-4 h-4 text-emerald-600 rounded border-slate-300 focus:ring-emerald-500"
                    />
                    <span>{item}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* Analysis Trigger Button */}
            <div className="pt-4 flex items-center justify-between">
              <button
                type="button"
                onClick={() => setStep(1)}
                className="px-6 py-3 rounded-xl border border-slate-300 font-bold text-xs text-slate-600 hover:bg-slate-50"
              >
                Back
              </button>

              <button
                type="button"
                onClick={runAnalysis}
                disabled={isAnalyzing}
                className="inline-flex items-center gap-2 px-8 py-4 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white font-extrabold text-base rounded-2xl shadow-xl shadow-emerald-600/30 hover:scale-[1.02] active:scale-95 transition-all disabled:opacity-50"
              >
                {isAnalyzing ? (
                  <>
                    <Activity className="w-5 h-5 animate-spin" />
                    <span>Evaluating Risk...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-5 h-5 text-amber-300 animate-pulse" />
                    <span>{t.analyzeBtn}</span>
                  </>
                )}
              </button>
            </div>

          </div>
        </div>
      )}

      {/* STEP 3: EXPLAINABLE AI RISK RESULT */}
      {step === 3 && activeAssessment && (
        <div className="space-y-6">
          <div className="bg-white rounded-3xl p-6 sm:p-8 shadow-2xl border border-slate-100">
            
            {/* Patient Header */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-6 border-b border-slate-100">
              <div>
                <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">ASHA Patient Screening Card</span>
                <h2 className="text-2xl font-black text-slate-900 mt-0.5">{name}</h2>
                <p className="text-xs font-semibold text-slate-500 mt-1">
                  Age {age} • {gender} • Village: <span className="text-slate-800 font-bold">{village}</span> • Mobile: {phone}
                </p>
              </div>

              {/* Risk Level Badge */}
              <div className={`px-6 py-3 rounded-2xl text-center border shadow-lg ${
                activeAssessment.risk_level === 'HIGH'
                  ? 'bg-rose-50 border-rose-300 text-rose-900 shadow-rose-200'
                  : activeAssessment.risk_level === 'MODERATE'
                  ? 'bg-amber-50 border-amber-300 text-amber-900 shadow-amber-200'
                  : 'bg-emerald-50 border-emerald-300 text-emerald-900 shadow-emerald-200'
              }`}>
                <span className="block text-[10px] font-black uppercase tracking-widest opacity-80">Screening Classification</span>
                <span className="text-lg font-black tracking-tight flex items-center justify-center gap-1.5">
                  {activeAssessment.risk_level === 'HIGH' && <ShieldAlert className="w-5 h-5 text-rose-600 animate-bounce" />}
                  {activeAssessment.risk_level === 'HIGH' ? t.highRisk : activeAssessment.risk_level === 'MODERATE' ? t.modRisk : t.lowRisk}
                </span>
                <span className="text-xs font-bold opacity-75">Score: {Math.round(activeAssessment.risk_score * 100)}%</span>
              </div>
            </div>

            {/* Explainability Breakdown & Likely Conditions */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 my-6">
              
              {/* Contributing Risk Factors */}
              <div className="bg-slate-50 p-5 rounded-2xl border border-slate-200">
                <h3 className="text-sm font-extrabold uppercase tracking-wider text-slate-800 flex items-center gap-2 mb-3">
                  <Activity className="w-4 h-4 text-emerald-600" />
                  {t.contributingFactors}
                </h3>
                <ul className="space-y-2">
                  {activeAssessment.contributing_factors.map((factor, idx) => (
                    <li key={idx} className="text-xs font-semibold text-slate-700 flex items-start gap-2 bg-white p-2.5 rounded-xl border border-slate-200/60 shadow-sm">
                      <span className="w-2 h-2 rounded-full bg-emerald-500 mt-1 shrink-0"></span>
                      <span>{factor}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Likely Conditions & Triage Recommendation */}
              <div className="space-y-4">
                <div className="bg-teal-50/70 p-5 rounded-2xl border border-teal-200">
                  <h3 className="text-sm font-extrabold uppercase tracking-wider text-teal-900 flex items-center gap-2 mb-2">
                    <Heart className="w-4 h-4 text-teal-700" />
                    {t.likelyConditions}
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    {activeAssessment.likely_conditions.map((cond, idx) => (
                      <span key={idx} className="bg-teal-700 text-white font-bold text-xs px-3 py-1.5 rounded-xl shadow-sm">
                        {cond}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="bg-slate-900 text-white p-5 rounded-2xl shadow-md">
                  <h3 className="text-xs font-extrabold uppercase tracking-widest text-emerald-400 flex items-center gap-2 mb-2">
                    <Activity className="w-4 h-4" />
                    {t.recommendedAction}
                  </h3>
                  <p className="text-xs font-medium leading-relaxed text-slate-200">
                    {activeAssessment.recommended_action}
                  </p>
                </div>
              </div>
            </div>

            {/* Healthcare Safety Disclaimer Component */}
            <MedicalDisclaimer lang={lang} />

            {/* Referral Trigger Actions */}
            <div className="pt-4 flex flex-col sm:flex-row items-center justify-between gap-4 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setStep(2)}
                className="w-full sm:w-auto px-6 py-3 rounded-xl border border-slate-300 font-bold text-xs text-slate-700 hover:bg-slate-50"
              >
                Re-assess Vitals
              </button>

              <div className="flex items-center gap-3 w-full sm:w-auto">
                <button
                  type="button"
                  onClick={() => updateReferral('REFERRED')}
                  disabled={activeAssessment.referral_status === 'REFERRED' || activeAssessment.referral_status === 'CONSULTATION_COMPLETED'}
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-3.5 bg-rose-600 hover:bg-rose-700 text-white font-extrabold text-sm rounded-xl shadow-md shadow-rose-600/30 transition-all disabled:opacity-50"
                >
                  <Send className="w-4 h-4" />
                  <span>
                    {activeAssessment.referral_status === 'REFERRED'
                      ? t.referred
                      : activeAssessment.referral_status === 'CONSULTATION_COMPLETED'
                      ? t.consultationCompleted
                      : t.initiateReferral}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setStep(1);
                    setName('');
                    setPatientId('');
                    setSymptomsText('');
                    setErrors({});
                  }}
                  className="w-full sm:w-auto px-6 py-3.5 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-sm rounded-xl shadow-md"
                >
                  + New Assessment
                </button>
              </div>
            </div>

          </div>
        </div>
      )}

    </div>
  );
};
