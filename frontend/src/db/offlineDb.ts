import Dexie, { type Table } from 'dexie';

export interface LocalPatient {
  id: string;
  name: string;
  age: number;
  gender: string;
  village: string;
  phone: string;
  patient_id?: string;
  created_at: string;
  synced: boolean;
}

export interface LocalAssessment {
  id: string;
  patient_id: string;
  patient_name?: string;
  village?: string;
  symptoms: string[];
  symptom_duration_days: number;
  temperature_f: number;
  systolic_bp: number;
  diastolic_bp: number;
  glucose_mg_dl: number;
  heart_rate_bpm: number;
  height_cm?: number;
  weight_kg?: number;
  bmi?: number;
  smoking_status: string;
  alcohol_status: string;
  physical_activity?: string;
  family_history: string[];
  risk_level: 'LOW' | 'MODERATE' | 'HIGH';
  risk_score: number;
  likely_conditions: string[];
  contributing_factors: string[];
  recommended_action: string;
  referral_status: 'NOT_REFERRED' | 'REFERRED' | 'APPOINTMENT_REQUESTED' | 'CONSULTATION_COMPLETED';
  created_at: string;
  synced: boolean;
}

export interface LocalAppointment {
  id: string;
  patient_name: string;
  patient_phone: string;
  doctor_name: string;
  doctor_specialty: string;
  doctor_address: string;
  appointment_date: string;    // ISO date string e.g. "2026-08-12"
  appointment_time: string;    // e.g. "10:00 AM"
  notes: string;
  status: 'PENDING' | 'CONFIRMED' | 'CANCELLED' | 'COMPLETED';
  risk_level?: string;
  likely_conditions?: string[];
  created_at: string;
  synced: boolean;
}

class RuralHealthDatabase extends Dexie {
  patients!: Table<LocalPatient>;
  assessments!: Table<LocalAssessment>;
  appointments!: Table<LocalAppointment>;

  constructor() {
    super('RuralHealthOfflineDB');
    this.version(1).stores({
      patients: 'id, name, village, phone, synced, created_at',
      assessments: 'id, patient_id, risk_level, referral_status, synced, created_at'
    });
    // Version 2: adds appointments table
    this.version(2).stores({
      patients: 'id, name, village, phone, synced, created_at',
      assessments: 'id, patient_id, risk_level, referral_status, synced, created_at',
      appointments: 'id, patient_name, doctor_name, appointment_date, status, created_at'
    });
  }
}

export const db = new RuralHealthDatabase();

// Offline AI Risk Screening Fallback Engine when server connection is lost
export function evaluateOfflineRisk(data: Partial<LocalAssessment>): {
  risk_level: 'LOW' | 'MODERATE' | 'HIGH';
  risk_score: number;
  likely_conditions: string[];
  contributing_factors: string[];
  recommended_action: string;
} {
  const symptoms = (data.symptoms || []).map(s => s.toLowerCase());
  const duration = data.symptom_duration_days || 1;
  const temp = data.temperature_f || 98.6;
  const sys = data.systolic_bp || 120;
  const dia = data.diastolic_bp || 80;
  const gluc = data.glucose_mg_dl || 100;
  const hr = data.heart_rate_bpm || 72;
  const family = (data.family_history || []).map(f => f.toLowerCase());

  const factors: string[] = [];
  const conditions: string[] = [];
  let score = 0.05;

  if (gluc >= 200) {
    factors.push(`Severely Elevated Glucose (${gluc} mg/dL)`);
    score += 0.40;
    conditions.push('Elevated Diabetes Screening Risk — Further Evaluation Recommended');
  } else if (gluc >= 140) {
    factors.push(`Elevated Glucose (${gluc} mg/dL)`);
    score += 0.25;
    conditions.push('Elevated Diabetes Screening Risk — Further Evaluation Recommended');
  }

  if (sys >= 140 || dia >= 90) {
    factors.push(`High Blood Pressure (${sys}/${dia} mmHg)`);
    score += 0.30;
    conditions.push('Possible Hypertension / Cardiovascular-Related Concern');
  }

  if (temp >= 101) {
    factors.push(`Fever (${temp}°F)`);
    score += 0.25;
  }

  if (hr >= 100) {
    factors.push(`Elevated Heart Rate (${hr} bpm)`);
    score += 0.15;
  }

  if (duration >= 14 && symptoms.some(s => s.includes('cough'))) {
    factors.push(`Persistent Cough lasting ${duration} days (TB priority candidate)`);
    score += 0.35;
    conditions.push('Possible TB-Related Concern — Urgent Sputum Screening Recommended');
  }

  if (symptoms.length > 0) {
    factors.push(`Reported Symptoms: ${symptoms.join(', ')}`);
    score += 0.10 * symptoms.length;
  }

  if (family.length > 0) {
    factors.push(`Family risk factors: ${family.join(', ')}`);
  }

  score = Math.min(Math.max(score, 0.05), 0.98);

  let risk_level: 'LOW' | 'MODERATE' | 'HIGH' = 'LOW';
  if (score >= 0.55 || sys >= 160 || gluc >= 200 || (duration >= 14 && symptoms.some(s => s.includes('cough')))) {
    risk_level = 'HIGH';
  } else if (score >= 0.25 || sys >= 130 || gluc >= 140 || temp >= 100) {
    risk_level = 'MODERATE';
  }

  if (conditions.length === 0) conditions.push('Routine Baseline Health Screening — Low Immediate Concern');
  if (factors.length === 0) factors.push('Standard baseline vitals within normal parameters');

  const recommended_action = risk_level === 'HIGH'
    ? 'OFFLINE ASSESSMENT: PHC Evaluation Recommended within 24 hours. Sync data when network is available.'
    : risk_level === 'MODERATE'
    ? 'OFFLINE ASSESSMENT: Routine PHC visit recommended in 3 days.'
    : 'OFFLINE ASSESSMENT: Low risk. Provide standard wellness guidance.';

  return {
    risk_level,
    risk_score: Math.round(score * 100) / 100,
    likely_conditions: conditions,
    contributing_factors: factors,
    recommended_action
  };
}
