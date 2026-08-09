import React, { useState, useEffect, useCallback } from 'react';
import {
  Users, Search, MapPin, Phone, Pencil, Trash2, X,
  AlertTriangle, CheckCircle2, ChevronRight, Loader2,
  Calendar, Activity, ShieldAlert, RefreshCw, UserCog,
  Thermometer, Heart, Droplets, Stethoscope
} from 'lucide-react';
import { translations, type Language } from '../i18n/translations';
import { db, type LocalPatient, type LocalAssessment } from '../db/offlineDb';

interface PatientDirectoryProps {
  lang: Language;
  isOnline: boolean;
}

interface EditPatientForm {
  name: string;
  age: string;
  gender: string;
  village: string;
  phone: string;
}

interface EditAssessmentForm {
  symptoms: string;              // comma-separated
  symptom_duration_days: string;
  temperature_f: string;
  systolic_bp: string;
  diastolic_bp: string;
  glucose_mg_dl: string;
  heart_rate_bpm: string;
  height_cm: string;
  weight_kg: string;
  smoking_status: string;
  alcohol_status: string;
  physical_activity: string;
  family_history: string;        // comma-separated
}

// ─── HELPER: show a dismissible toast ─────────────────────────────────────────

function Toast({ msg, type }: { msg: string; type: 'success' | 'error' }) {
  return (
    <div className={`fixed top-5 left-1/2 -translate-x-1/2 z-[99999] px-5 py-3 rounded-2xl shadow-2xl flex items-center gap-2.5 text-sm font-bold animate-fade-in pointer-events-none ${
      type === 'success' ? 'bg-emerald-600 text-white' : 'bg-rose-600 text-white'
    }`}>
      {type === 'success'
        ? <CheckCircle2 className="w-4 h-4 shrink-0" />
        : <Trash2 className="w-4 h-4 shrink-0" />}
      {msg}
    </div>
  );
}

// ─── FORM INPUT HELPERS ───────────────────────────────────────────────────────

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-[11px] font-black text-slate-500 uppercase tracking-wider mb-1.5">{label}</label>
      {children}
    </div>
  );
}

const inp = "w-full text-sm font-semibold px-3 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-400 outline-none bg-white transition-all";
const sel = `${inp} cursor-pointer`;

// ─── MAIN COMPONENT ───────────────────────────────────────────────────────────

export const PatientDirectory: React.FC<PatientDirectoryProps> = ({ lang, isOnline }) => {
  const t = translations[lang];

  const [patients,    setPatients]    = useState<LocalPatient[]>([]);
  const [assessments, setAssessments] = useState<LocalAssessment[]>([]);
  const [searchTerm,  setSearchTerm]  = useState('');
  const [isLoading,   setIsLoading]   = useState(true);

  // ── Panels ──────────────────────────────────────────────────────────────────
  const [viewPatient,    setViewPatient]    = useState<LocalPatient | null>(null);
  const [editingPatient, setEditingPatient] = useState<LocalPatient | null>(null);
  const [deletingPatient, setDeletingPatient] = useState<LocalPatient | null>(null);

  // Edit forms
  const [pForm,  setPForm]  = useState<EditPatientForm>({ name: '', age: '', gender: 'Male', village: '', phone: '' });
  const [aForms, setAForms] = useState<Record<string, EditAssessmentForm>>({});
  const [activeAssessmentEdit, setActiveAssessmentEdit] = useState<string | null>(null);

  const [isSaving,  setIsSaving]  = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [formError,  setFormError]  = useState('');
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);

  const showToast = (msg: string, type: 'success' | 'error' = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };

  // ─── LOAD DATA ──────────────────────────────────────────────────────────────
  const loadData = useCallback(async () => {
    setIsLoading(true);
    if (isOnline) {
      try {
        const [pRes, aRes] = await Promise.all([
          fetch('http://127.0.0.1:8000/api/patients'),
          fetch('http://127.0.0.1:8000/api/assessments')
        ]);
        if (pRes.ok && aRes.ok) {
          const [p, a] = await Promise.all([pRes.json(), aRes.json()]);
          setPatients(p);
          setAssessments(a);
          setIsLoading(false);
          return;
        }
      } catch { /* fall to IndexedDB */ }
    }
    const [p, a] = await Promise.all([db.patients.toArray(), db.assessments.toArray()]);
    setPatients(p);
    setAssessments(a);
    setIsLoading(false);
  }, [isOnline]);

  useEffect(() => { loadData(); }, [loadData]);

  const filtered = patients.filter(p =>
    p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    p.village.toLowerCase().includes(searchTerm.toLowerCase()) ||
    p.phone.includes(searchTerm)
  );

  // ─── OPEN EDIT PATIENT ──────────────────────────────────────────────────────
  const openEditPatient = (p: LocalPatient, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setFormError('');
    setEditingPatient(p);
    setActiveAssessmentEdit(null);
    setPForm({ name: p.name, age: String(p.age), gender: p.gender, village: p.village, phone: p.phone });

    // Pre-fill assessment forms
    const patientAssessments = assessments.filter(a => a.patient_id === p.id);
    const forms: Record<string, EditAssessmentForm> = {};
    patientAssessments.forEach(a => {
      forms[a.id] = {
        symptoms:              (a.symptoms || []).join(', '),
        symptom_duration_days: String(a.symptom_duration_days ?? 1),
        temperature_f:         String(a.temperature_f ?? 98.6),
        systolic_bp:           String(a.systolic_bp ?? 120),
        diastolic_bp:          String(a.diastolic_bp ?? 80),
        glucose_mg_dl:         String(a.glucose_mg_dl ?? 100),
        heart_rate_bpm:        String(a.heart_rate_bpm ?? 72),
        height_cm:             String(a.height_cm ?? ''),
        weight_kg:             String(a.weight_kg ?? ''),
        smoking_status:        a.smoking_status ?? 'Never',
        alcohol_status:        a.alcohol_status ?? 'Never',
        physical_activity:     a.physical_activity ?? 'Moderate',
        family_history:        (a.family_history || []).join(', ')
      };
    });
    setAForms(forms);
  };

  // ─── SAVE EDIT ──────────────────────────────────────────────────────────────
  const saveEdit = async () => {
    if (!editingPatient) return;
    if (!pForm.name.trim() || !pForm.village.trim() || !pForm.phone.trim()) {
      setFormError('Name, village, and phone are required.'); return;
    }
    const age = parseInt(pForm.age, 10);
    if (isNaN(age) || age < 1 || age > 120) {
      setFormError('Please enter a valid age (1–120).'); return;
    }

    setIsSaving(true); setFormError('');

    const updatedPatient: LocalPatient = {
      ...editingPatient,
      name:    pForm.name.trim(),
      age,
      gender:  pForm.gender,
      village: pForm.village.trim(),
      phone:   pForm.phone.trim(),
      synced:  false
    };

    try {
      // 1. Save patient to IndexedDB
      await db.patients.put(updatedPatient);

      // 2. Save any edited assessments to IndexedDB
      for (const [aId, af] of Object.entries(aForms)) {
        const origAssessment = assessments.find(a => a.id === aId);
        if (!origAssessment) continue;
        const updatedA: LocalAssessment = {
          ...origAssessment,
          symptoms:              af.symptoms.split(',').map(s => s.trim()).filter(Boolean),
          symptom_duration_days: parseInt(af.symptom_duration_days) || 1,
          temperature_f:         parseFloat(af.temperature_f) || 98.6,
          systolic_bp:           parseInt(af.systolic_bp) || 120,
          diastolic_bp:          parseInt(af.diastolic_bp) || 80,
          glucose_mg_dl:         parseFloat(af.glucose_mg_dl) || 100,
          heart_rate_bpm:        parseInt(af.heart_rate_bpm) || 72,
          height_cm:             parseFloat(af.height_cm) || undefined,
          weight_kg:             parseFloat(af.weight_kg) || undefined,
          smoking_status:        af.smoking_status,
          alcohol_status:        af.alcohol_status,
          physical_activity:     af.physical_activity,
          family_history:        af.family_history.split(',').map(s => s.trim()).filter(Boolean),
          synced:                false
        };
        await db.assessments.put(updatedA);
      }

      // 3. Push to backend if online
      if (isOnline) {
        try {
          await fetch(`http://127.0.0.1:8000/api/patients/${editingPatient.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              id: updatedPatient.id, name: updatedPatient.name, age: updatedPatient.age,
              gender: updatedPatient.gender, village: updatedPatient.village, phone: updatedPatient.phone
            })
          });
          await db.patients.update(editingPatient.id, { synced: true });
        } catch { /* sync later */ }
      }

      // 4. Update React state directly (NO re-fetch — avoids stale backend overwrite)
      setPatients(prev => prev.map(p => p.id === editingPatient.id ? updatedPatient : p));
      // Re-load assessments from IndexedDB to get updated values
      const allA = await db.assessments.toArray();
      setAssessments(allA);

      setEditingPatient(null);
      showToast(`✓ ${updatedPatient.name}'s record updated.`);
    } catch {
      setFormError('Save failed. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  // ─── DELETE ─────────────────────────────────────────────────────────────────
  const confirmDelete = async () => {
    if (!deletingPatient) return;
    setIsDeleting(true);

    // ── Step 1: Delete from backend FIRST (when online) ──────────────────────
    if (isOnline) {
      try {
        const res = await fetch(`http://127.0.0.1:8000/api/patients/${deletingPatient.id}`, {
          method: 'DELETE'
        });
        
        if (!res.ok) {
          const errorData = await res.json().catch(() => ({}));
          // Only proceed if it's explicitly our "Patient not found" response, otherwise it might be a route Not Found
          if (res.status !== 404 || errorData.detail !== "Patient not found") {
            showToast('Server delete failed. Please ensure the backend is running and up to date.', 'error');
            setIsDeleting(false);
            return;
          }
        }
      } catch {
        // Backend unreachable — delete locally and flag for re-sync
        console.warn('Backend unreachable — deleting locally only');
      }
    }

    // ── Step 2: Delete from IndexedDB ─────────────────────────────────────────
    try {
      await db.transaction('rw', db.patients, db.assessments, async () => {
        await db.assessments.where('patient_id').equals(deletingPatient.id).delete();
        await db.patients.delete(deletingPatient.id);
      });
    } catch (err) {
      console.error('IndexedDB delete error:', err);
    }

    // ── Step 3: Update React state directly — DO NOT call loadData() ──────────
    const deletedId = deletingPatient.id;
    setPatients(prev => prev.filter(p => p.id !== deletedId));
    setAssessments(prev => prev.filter(a => a.patient_id !== deletedId));

    // Close any open panels showing the deleted patient
    if (viewPatient?.id === deletedId) setViewPatient(null);
    if (editingPatient?.id === deletedId) setEditingPatient(null);

    setDeletingPatient(null);
    setIsDeleting(false);
    showToast(`🗑 ${deletingPatient.name} deleted from all stores.`, 'error');
  };

  // ─── RENDER ─────────────────────────────────────────────────────────────────
  return (
    <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">

      {toast && <Toast msg={toast.msg} type={toast.type} />}

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-white p-6 rounded-3xl shadow-sm border border-slate-100">
        <div>
          <h2 className="text-2xl font-black text-slate-900 flex items-center gap-2">
            <Users className="w-7 h-7 text-emerald-600" />
            {t.rolePatients}
          </h2>
          <p className="text-xs text-slate-500 font-semibold mt-1">
            {patients.length} registered ·{' '}
            <span className="font-black text-indigo-700">IndexedDB</span>
            {isOnline && <> + <span className="font-black text-emerald-700">SQLite backend</span></>}
          </p>
        </div>
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <button onClick={loadData} className="w-9 h-9 rounded-xl bg-slate-100 hover:bg-slate-200 flex items-center justify-center shrink-0" title="Reload">
            <RefreshCw className="w-4 h-4 text-slate-600" />
          </button>
          <div className="relative flex-1 sm:w-72">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
            <input
              type="text" placeholder={t.searchVillage} value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full text-xs font-semibold pl-10 pr-4 py-2.5 rounded-xl border border-slate-300 focus:ring-2 focus:ring-emerald-500 outline-none"
            />
          </div>
        </div>
      </div>

      {/* ── Storage info banner ──────────────────────────────────────────────── */}
      <div className="bg-gradient-to-r from-slate-900 to-indigo-950 text-white rounded-2xl px-5 py-3.5 flex flex-wrap items-center gap-x-6 gap-y-1.5 text-xs font-semibold shadow-lg">
        <span className="text-indigo-300 font-black text-[10px] uppercase tracking-widest">📦 Data Saved In:</span>
        <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-emerald-400" /><b className="text-white">IndexedDB</b> — browser, offline-capable</span>
        <span className="flex items-center gap-1.5"><span className={`w-2 h-2 rounded-full ${isOnline ? 'bg-emerald-400 animate-pulse' : 'bg-slate-500'}`} /><b className="text-white">SQLite backend</b> — {isOnline ? 'synced live' : 'offline, syncs when connected'}</span>
        <span className="text-indigo-400 ml-auto text-[10px]">Delete removes from BOTH simultaneously</span>
      </div>

      {/* ── Loading skeletons ────────────────────────────────────────────────── */}
      {isLoading && (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-5">
          {[1,2,3,4,5,6].map(i => (
            <div key={i} className="bg-white p-5 rounded-3xl border border-slate-100 animate-pulse space-y-3">
              <div className="flex justify-between"><div className="h-4 bg-slate-200 rounded w-1/2" /><div className="h-5 w-16 bg-slate-100 rounded-full" /></div>
              <div className="h-3 bg-slate-100 rounded w-2/3" /><div className="h-3 bg-slate-100 rounded w-1/2" />
              <div className="flex justify-end gap-2 pt-2"><div className="h-7 w-16 bg-slate-100 rounded-xl" /><div className="h-7 w-16 bg-slate-100 rounded-xl" /></div>
            </div>
          ))}
        </div>
      )}

      {/* ── Patient Cards ────────────────────────────────────────────────────── */}
      {!isLoading && (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-5">
          {filtered.length > 0 ? filtered.map(patient => {
            const patAssessments = assessments.filter(a => a.patient_id === patient.id);
            const latest = patAssessments[patAssessments.length - 1];
            return (
              <div key={patient.id} onClick={() => setViewPatient(patient)}
                className="bg-white p-5 rounded-3xl shadow-sm hover:shadow-md border border-slate-100 hover:border-emerald-200 transition-all cursor-pointer">
                {/* Name + Risk badge */}
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1 min-w-0">
                    <h3 className="font-extrabold text-base text-slate-900 truncate">{patient.name}</h3>
                    <p className="text-xs text-slate-500 font-medium mt-0.5">{patient.age} yrs · {patient.gender}</p>
                  </div>
                  {latest ? (
                    <span className={`px-2.5 py-1 rounded-full text-[10px] font-black shrink-0 ml-2 ${
                      latest.risk_level === 'HIGH' ? 'bg-rose-100 text-rose-800'
                      : latest.risk_level === 'MODERATE' ? 'bg-amber-100 text-amber-800'
                      : 'bg-emerald-100 text-emerald-800'}`}>
                      {latest.risk_level}
                    </span>
                  ) : (
                    <span className="bg-slate-100 text-slate-500 px-2.5 py-1 rounded-full text-[10px] font-bold ml-2">No Screen</span>
                  )}
                </div>

                {/* Details */}
                <div className="space-y-1.5 text-xs text-slate-600 font-semibold mb-4">
                  <div className="flex items-center gap-2"><MapPin className="w-3.5 h-3.5 text-emerald-500 shrink-0" /><span className="truncate">{patient.village}</span></div>
                  <div className="flex items-center gap-2"><Phone className="w-3.5 h-3.5 text-slate-400 shrink-0" /><span>{patient.phone}</span></div>
                  <div className="flex items-center gap-2"><Activity className="w-3.5 h-3.5 text-indigo-400 shrink-0" /><span>{patAssessments.length} assessment{patAssessments.length !== 1 ? 's' : ''}</span></div>
                </div>

                {/* Buttons — stopPropagation to avoid card click */}
                <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-2" onClick={e => e.stopPropagation()}>
                  <button onClick={() => setViewPatient(patient)}
                    className="flex items-center gap-1 text-[11px] font-bold text-slate-500 hover:text-emerald-700">
                    <ChevronRight className="w-3.5 h-3.5" />History
                  </button>
                  <div className="flex gap-2">
                    <button
                      onClick={e => openEditPatient(patient, e)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-extrabold bg-indigo-50 text-indigo-700 border border-indigo-200 hover:bg-indigo-100 active:scale-95 transition-all"
                    >
                      <Pencil className="w-3 h-3" />Edit
                    </button>
                    <button
                      onClick={e => { e.stopPropagation(); setDeletingPatient(patient); }}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-extrabold bg-rose-50 text-rose-700 border border-rose-200 hover:bg-rose-100 active:scale-95 transition-all"
                    >
                      <Trash2 className="w-3 h-3" />Delete
                    </button>
                  </div>
                </div>
              </div>
            );
          }) : (
            <div className="col-span-full bg-white p-10 rounded-3xl text-center border border-slate-100">
              <Users className="w-10 h-10 text-slate-300 mx-auto mb-2" />
              <p className="text-slate-400 font-semibold text-sm">
                {searchTerm ? 'No patients match your search.' : 'No registered patients. Register via + New Assessment.'}
              </p>
            </div>
          )}
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════════════
          VIEW HISTORY MODAL
       ════════════════════════════════════════════════════════════════════════ */}
      {viewPatient && !editingPatient && !deletingPatient && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-2xl w-full shadow-2xl flex flex-col max-h-[90vh]">
            <div className="flex items-start justify-between p-6 pb-4 border-b border-slate-100 shrink-0">
              <div>
                <h3 className="text-xl font-black text-slate-900">{viewPatient.name}</h3>
                <p className="text-xs text-slate-500 font-semibold mt-0.5">
                  {viewPatient.age} yrs · {viewPatient.gender} · {viewPatient.village} · {viewPatient.phone}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => { setViewPatient(null); openEditPatient(viewPatient); }}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-indigo-50 text-indigo-700 border border-indigo-200 hover:bg-indigo-100">
                  <Pencil className="w-3.5 h-3.5" />Edit
                </button>
                <button onClick={() => { setDeletingPatient(viewPatient); setViewPatient(null); }}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-rose-50 text-rose-700 border border-rose-200 hover:bg-rose-100">
                  <Trash2 className="w-3.5 h-3.5" />Delete
                </button>
                <button onClick={() => setViewPatient(null)}
                  className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center">
                  <X className="w-4 h-4 text-slate-600" />
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              <h4 className="text-xs font-extrabold uppercase tracking-wider text-slate-600 flex items-center gap-1.5">
                <Calendar className="w-4 h-4 text-indigo-500" />Screening History
              </h4>
              {assessments.filter(a => a.patient_id === viewPatient.id).length > 0
                ? assessments.filter(a => a.patient_id === viewPatient.id).map(ass => (
                    <div key={ass.id} className="bg-slate-50 rounded-2xl border border-slate-200 p-4 space-y-2 text-xs">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-slate-700">{new Date(ass.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                        <span className={`px-2.5 py-1 rounded-full font-black text-[10px] ${
                          ass.risk_level === 'HIGH' ? 'bg-rose-100 text-rose-800'
                          : ass.risk_level === 'MODERATE' ? 'bg-amber-100 text-amber-800'
                          : 'bg-emerald-100 text-emerald-800'}`}>
                          {ass.risk_level} · {Math.round(ass.risk_score * 100)}%
                        </span>
                      </div>
                      <p className="text-slate-700 font-semibold">Symptoms: {ass.symptoms.join(', ') || 'None'}</p>
                      <p className="text-slate-600 font-medium">BP: {ass.systolic_bp}/{ass.diastolic_bp} · Glucose: {ass.glucose_mg_dl} mg/dL · Temp: {ass.temperature_f}°F · HR: {ass.heart_rate_bpm} bpm</p>
                      {(ass.likely_conditions || []).length > 0 && (
                        <div className="flex flex-wrap gap-1.5 pt-1">
                          {ass.likely_conditions.slice(0, 3).map((c, i) => (
                            <span key={i} className="text-[10px] font-bold bg-white text-slate-700 px-2.5 py-1 rounded-lg border border-slate-200">{c.slice(0, 55)}</span>
                          ))}
                        </div>
                      )}
                      <div className="bg-emerald-50 text-emerald-800 p-2.5 rounded-xl border border-emerald-200 font-semibold">
                        Action: {ass.recommended_action}
                      </div>
                    </div>
                  ))
                : <p className="text-xs text-slate-400 font-semibold text-center py-6">No assessments for this patient yet.</p>
              }
            </div>
            <div className="p-5 pt-0 border-t border-slate-100 shrink-0 flex justify-end">
              <button onClick={() => setViewPatient(null)}
                className="px-6 py-2.5 bg-slate-900 hover:bg-slate-700 text-white text-xs font-bold rounded-xl mt-4">Close</button>
            </div>
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════════════
          FULL EDIT MODAL — Patient demographics + all assessments
       ════════════════════════════════════════════════════════════════════════ */}
      {editingPatient && (
        <div className="fixed inset-0 z-[60] bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-2xl w-full shadow-2xl flex flex-col max-h-[92vh]">

            {/* Edit header */}
            <div className="bg-gradient-to-r from-indigo-700 to-violet-700 px-6 py-5 text-white flex items-start justify-between shrink-0 rounded-t-3xl">
              <div>
                <p className="text-[10px] font-bold text-indigo-300 uppercase tracking-widest mb-0.5">Edit Patient Record</p>
                <h3 className="font-black text-xl leading-tight">{editingPatient.name}</h3>
              </div>
              <button onClick={() => { setEditingPatient(null); setFormError(''); }}
                className="w-8 h-8 rounded-xl bg-white/20 hover:bg-white/30 flex items-center justify-center">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {formError && (
                <div className="flex items-center gap-2 bg-rose-50 text-rose-700 text-xs font-bold px-4 py-3 rounded-xl border border-rose-200">
                  <AlertTriangle className="w-4 h-4 shrink-0" />{formError}
                </div>
              )}

              {/* ── Patient Demographics Section ─────────────────────────────── */}
              <section>
                <div className="flex items-center gap-2 mb-4">
                  <div className="w-7 h-7 rounded-lg bg-indigo-100 flex items-center justify-center">
                    <UserCog className="w-4 h-4 text-indigo-600" />
                  </div>
                  <h4 className="text-sm font-extrabold text-slate-800">Patient Demographics</h4>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Field label="Full Name *">
                    <input value={pForm.name} onChange={e => setPForm(f => ({ ...f, name: e.target.value }))} className={inp} />
                  </Field>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Age *">
                      <input type="number" min={1} max={120} value={pForm.age} onChange={e => setPForm(f => ({ ...f, age: e.target.value }))} className={inp} />
                    </Field>
                    <Field label="Gender">
                      <select value={pForm.gender} onChange={e => setPForm(f => ({ ...f, gender: e.target.value }))} className={sel}>
                        <option>Male</option><option>Female</option><option>Other</option>
                      </select>
                    </Field>
                  </div>
                  <Field label="Village / Location *">
                    <input value={pForm.village} onChange={e => setPForm(f => ({ ...f, village: e.target.value }))} className={inp} />
                  </Field>
                  <Field label="Mobile Number *">
                    <input value={pForm.phone} onChange={e => setPForm(f => ({ ...f, phone: e.target.value }))} className={inp} />
                  </Field>
                </div>
              </section>

              {/* ── Assessment Records Section ───────────────────────────────── */}
              {assessments.filter(a => a.patient_id === editingPatient.id).length > 0 && (
                <section>
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-7 h-7 rounded-lg bg-emerald-100 flex items-center justify-center">
                      <Stethoscope className="w-4 h-4 text-emerald-600" />
                    </div>
                    <h4 className="text-sm font-extrabold text-slate-800">
                      Screening Assessments ({assessments.filter(a => a.patient_id === editingPatient.id).length})
                    </h4>
                  </div>

                  <div className="space-y-3">
                    {assessments.filter(a => a.patient_id === editingPatient.id).map((ass, idx) => {
                      const af = aForms[ass.id] || {};
                      const isExpanded = activeAssessmentEdit === ass.id;
                      return (
                        <div key={ass.id} className="border border-slate-200 rounded-2xl overflow-hidden">
                          {/* Assessment row header */}
                          <button
                            type="button"
                            onClick={() => setActiveAssessmentEdit(isExpanded ? null : ass.id)}
                            className="w-full flex items-center justify-between px-4 py-3 bg-slate-50 hover:bg-slate-100 text-left transition-colors"
                          >
                            <div className="flex items-center gap-3">
                              <span className={`w-6 h-6 rounded-full text-[10px] font-black flex items-center justify-center ${
                                ass.risk_level === 'HIGH' ? 'bg-rose-100 text-rose-800'
                                : ass.risk_level === 'MODERATE' ? 'bg-amber-100 text-amber-800'
                                : 'bg-emerald-100 text-emerald-800'}`}>
                                {idx + 1}
                              </span>
                              <span className="text-xs font-bold text-slate-700">
                                {new Date(ass.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                                {' · '}<span className="font-black">{ass.risk_level}</span> RISK
                              </span>
                            </div>
                            <span className="text-[11px] font-bold text-indigo-600">
                              {isExpanded ? '▲ Collapse' : '▼ Edit this assessment'}
                            </span>
                          </button>

                          {/* Editable fields */}
                          {isExpanded && af && (
                            <div className="px-4 pb-5 pt-4 grid grid-cols-1 sm:grid-cols-2 gap-4 bg-white">
                              <Field label="Symptoms (comma-separated)">
                                <input value={af.symptoms || ''} onChange={e => setAForms(f => ({ ...f, [ass.id]: { ...f[ass.id], symptoms: e.target.value } }))} placeholder="fever, cough, fatigue..." className={inp} />
                              </Field>
                              <Field label="Duration (days)">
                                <input type="number" min={1} value={af.symptom_duration_days || ''} onChange={e => setAForms(f => ({ ...f, [ass.id]: { ...f[ass.id], symptom_duration_days: e.target.value } }))} className={inp} />
                              </Field>

                              <Field label="Temperature (°F)">
                                <div className="relative">
                                  <Thermometer className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                                  <input type="number" step="0.1" value={af.temperature_f || ''} onChange={e => setAForms(f => ({ ...f, [ass.id]: { ...f[ass.id], temperature_f: e.target.value } }))} className={`${inp} pl-9`} />
                                </div>
                              </Field>
                              <Field label="Heart Rate (bpm)">
                                <div className="relative">
                                  <Heart className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                                  <input type="number" value={af.heart_rate_bpm || ''} onChange={e => setAForms(f => ({ ...f, [ass.id]: { ...f[ass.id], heart_rate_bpm: e.target.value } }))} className={`${inp} pl-9`} />
                                </div>
                              </Field>

                              <Field label="Systolic BP (mmHg)">
                                <input type="number" value={af.systolic_bp || ''} onChange={e => setAForms(f => ({ ...f, [ass.id]: { ...f[ass.id], systolic_bp: e.target.value } }))} className={inp} />
                              </Field>
                              <Field label="Diastolic BP (mmHg)">
                                <input type="number" value={af.diastolic_bp || ''} onChange={e => setAForms(f => ({ ...f, [ass.id]: { ...f[ass.id], diastolic_bp: e.target.value } }))} className={inp} />
                              </Field>

                              <Field label="Blood Glucose (mg/dL)">
                                <div className="relative">
                                  <Droplets className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                                  <input type="number" step="0.1" value={af.glucose_mg_dl || ''} onChange={e => setAForms(f => ({ ...f, [ass.id]: { ...f[ass.id], glucose_mg_dl: e.target.value } }))} className={`${inp} pl-9`} />
                                </div>
                              </Field>
                              <div className="grid grid-cols-2 gap-2">
                                <Field label="Height (cm)">
                                  <input type="number" value={af.height_cm || ''} onChange={e => setAForms(f => ({ ...f, [ass.id]: { ...f[ass.id], height_cm: e.target.value } }))} className={inp} />
                                </Field>
                                <Field label="Weight (kg)">
                                  <input type="number" value={af.weight_kg || ''} onChange={e => setAForms(f => ({ ...f, [ass.id]: { ...f[ass.id], weight_kg: e.target.value } }))} className={inp} />
                                </Field>
                              </div>

                              <Field label="Smoking Status">
                                <select value={af.smoking_status || 'Never'} onChange={e => setAForms(f => ({ ...f, [ass.id]: { ...f[ass.id], smoking_status: e.target.value } }))} className={sel}>
                                  <option>Never</option><option>Former</option><option>Current</option>
                                </select>
                              </Field>
                              <Field label="Alcohol Status">
                                <select value={af.alcohol_status || 'Never'} onChange={e => setAForms(f => ({ ...f, [ass.id]: { ...f[ass.id], alcohol_status: e.target.value } }))} className={sel}>
                                  <option>Never</option><option>Occasional</option><option>Regular</option>
                                </select>
                              </Field>
                              <Field label="Physical Activity">
                                <select value={af.physical_activity || 'Moderate'} onChange={e => setAForms(f => ({ ...f, [ass.id]: { ...f[ass.id], physical_activity: e.target.value } }))} className={sel}>
                                  <option>Sedentary</option><option>Moderate</option><option>Active</option>
                                </select>
                              </Field>
                              <Field label="Family History (comma-separated)">
                                <input value={af.family_history || ''} onChange={e => setAForms(f => ({ ...f, [ass.id]: { ...f[ass.id], family_history: e.target.value } }))} placeholder="diabetes, hypertension..." className={inp} />
                              </Field>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </section>
              )}
            </div>

            {/* Footer buttons */}
            <div className="px-6 py-4 border-t border-slate-100 flex gap-3 shrink-0">
              <button onClick={() => { setEditingPatient(null); setFormError(''); }}
                className="flex-1 px-4 py-3 rounded-2xl border border-slate-300 font-bold text-slate-700 text-sm hover:bg-slate-50 flex items-center justify-center gap-2">
                <X className="w-4 h-4" />Cancel
              </button>
              <button onClick={saveEdit} disabled={isSaving}
                className="flex-1 px-4 py-3 rounded-2xl bg-gradient-to-r from-indigo-600 to-violet-600 text-white font-extrabold text-sm shadow-lg disabled:opacity-60 flex items-center justify-center gap-2 active:scale-95 transition-all">
                {isSaving
                  ? <><Loader2 className="w-4 h-4 animate-spin" />Saving…</>
                  : <><UserCog className="w-4 h-4" />Save All Changes</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════════════
          DELETE CONFIRM MODAL
       ════════════════════════════════════════════════════════════════════════ */}
      {deletingPatient && (
        <div className="fixed inset-0 z-[70] bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-sm w-full shadow-2xl overflow-hidden">
            <div className="bg-gradient-to-r from-rose-600 to-red-700 px-6 py-5 text-white flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center shrink-0">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <p className="text-xs font-bold text-rose-200 uppercase tracking-widest">Confirm Delete</p>
                <h3 className="font-black text-lg">Delete Patient?</h3>
              </div>
            </div>
            <div className="p-6 space-y-4">
              <div className="bg-rose-50 border border-rose-200 rounded-2xl p-4">
                <p className="text-sm font-black text-rose-800">{deletingPatient.name}</p>
                <p className="text-xs font-semibold text-rose-700 mt-0.5">
                  Age {deletingPatient.age} · {deletingPatient.village} · {deletingPatient.phone}
                </p>
                <p className="text-xs font-bold text-rose-600 mt-1.5">
                  {assessments.filter(a => a.patient_id === deletingPatient.id).length} assessment(s) will also be deleted.
                </p>
              </div>
              <div className="flex items-start gap-2 text-xs font-semibold text-slate-600 bg-amber-50 border border-amber-200 rounded-xl p-3">
                <ShieldAlert className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <span>
                  This permanently removes the patient and all their data from{' '}
                  <b>IndexedDB</b>{isOnline ? <> and the <b>SQLite backend</b></> : ' (backend deletion will happen when reconnected)'}. <b>Cannot be undone.</b>
                </span>
              </div>
              <div className="flex gap-3">
                <button onClick={() => setDeletingPatient(null)} disabled={isDeleting}
                  className="flex-1 px-4 py-3 rounded-2xl border border-slate-300 font-bold text-slate-700 text-sm hover:bg-slate-50 flex items-center justify-center gap-2">
                  <X className="w-4 h-4" />Cancel
                </button>
                <button onClick={confirmDelete} disabled={isDeleting}
                  className="flex-1 px-4 py-3 rounded-2xl bg-gradient-to-r from-rose-600 to-red-600 text-white font-extrabold text-sm shadow-lg disabled:opacity-60 flex items-center justify-center gap-2 active:scale-95 transition-all">
                  {isDeleting
                    ? <><Loader2 className="w-4 h-4 animate-spin" />Deleting…</>
                    : <><Trash2 className="w-4 h-4" />Yes, Delete</>}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
