import React, { useState, useEffect } from 'react';
import { Users, Search, MapPin, Phone } from 'lucide-react';
import { translations, type Language } from '../i18n/translations';
import { db, type LocalPatient, type LocalAssessment } from '../db/offlineDb';

interface PatientDirectoryProps {
  lang: Language;
  isOnline: boolean;
}

export const PatientDirectory: React.FC<PatientDirectoryProps> = ({ lang, isOnline }) => {
  const t = translations[lang];
  const [patients, setPatients] = useState<LocalPatient[]>([]);
  const [assessments, setAssessments] = useState<LocalAssessment[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedPatient, setSelectedPatient] = useState<LocalPatient | null>(null);

  const loadPatients = async () => {
    if (isOnline) {
      try {
        const res = await fetch('http://127.0.0.1:8000/api/patients');
        const pList = await res.json();
        setPatients(pList);
        const aRes = await fetch('http://127.0.0.1:8000/api/assessments');
        const aList = await aRes.json();
        setAssessments(aList);
        return;
      } catch (err) {
        console.warn('Backend offline, loading local IndexedDB patient list', err);
      }
    }

    const localP = await db.patients.toArray();
    const localA = await db.assessments.toArray();
    setPatients(localP);
    setAssessments(localA);
  };

  useEffect(() => {
    loadPatients();
  }, [isOnline]);

  const filteredPatients = patients.filter(
    (p) =>
      p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.village.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.phone.includes(searchTerm)
  );

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">
      
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-white p-6 rounded-3xl shadow-sm border border-slate-100">
        <div>
          <h2 className="text-2xl font-black text-slate-900 flex items-center gap-2">
            <Users className="w-7 h-7 text-emerald-600" />
            <span>{t.rolePatients}</span>
          </h2>
          <p className="text-xs text-slate-500 font-semibold mt-1">
            Registered village health records and historical assessment logs
          </p>
        </div>

        <div className="relative w-full sm:w-72">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
          <input
            type="text"
            placeholder={t.searchVillage}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full text-xs font-semibold pl-10 pr-4 py-2.5 rounded-xl border border-slate-300 focus:ring-2 focus:ring-emerald-500 outline-none"
          />
        </div>
      </div>

      {/* Patient Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-5">
        {filteredPatients.length > 0 ? (
          filteredPatients.map((patient) => {
            const patientAssesments = assessments.filter((a) => a.patient_id === patient.id);
            const latestAss = patientAssesments[0];

            return (
              <div
                key={patient.id}
                onClick={() => setSelectedPatient(patient)}
                className="bg-white p-6 rounded-3xl shadow-sm hover:shadow-md border border-slate-100 hover:border-emerald-300 transition-all cursor-pointer space-y-4"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="font-extrabold text-base text-slate-900">{patient.name}</h3>
                    <p className="text-xs text-slate-500 font-medium">{patient.age} Yrs • {patient.gender}</p>
                  </div>
                  {latestAss ? (
                    <span
                      className={`px-2.5 py-1 rounded-full text-[10px] font-black ${
                        latestAss.risk_level === 'HIGH'
                          ? 'bg-rose-100 text-rose-800'
                          : latestAss.risk_level === 'MODERATE'
                          ? 'bg-amber-100 text-amber-800'
                          : 'bg-emerald-100 text-emerald-800'
                      }`}
                    >
                      {latestAss.risk_level} RISK
                    </span>
                  ) : (
                    <span className="bg-slate-100 text-slate-500 px-2.5 py-1 rounded-full text-[10px] font-bold">
                      No Screening
                    </span>
                  )}
                </div>

                <div className="space-y-1.5 text-xs text-slate-600 font-semibold">
                  <div className="flex items-center gap-2">
                    <MapPin className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>Village: {patient.village}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Phone className="w-4 h-4 text-slate-400 shrink-0" />
                    <span>{patient.phone}</span>
                  </div>
                </div>

                <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-[11px] font-bold text-slate-500">
                  <span>Assessments: {patientAssesments.length}</span>
                  <span className="text-emerald-700 hover:underline">View History →</span>
                </div>
              </div>
            );
          })
        ) : (
          <div className="col-span-full bg-white p-8 rounded-3xl text-center text-slate-400 font-semibold">
            No registered patients found. Register a new patient in the ASHA tab.
          </div>
        )}
      </div>

      {/* Patient Details Modal */}
      {selectedPatient && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-2xl w-full p-6 sm:p-8 shadow-2xl space-y-6 max-h-[90vh] overflow-y-auto">
            
            <div className="flex items-start justify-between pb-4 border-b border-slate-100">
              <div>
                <h3 className="text-xl font-black text-slate-900">{selectedPatient.name}</h3>
                <p className="text-xs font-semibold text-slate-500 mt-0.5">
                  Age {selectedPatient.age} • {selectedPatient.gender} • Village: {selectedPatient.village} • Mobile: {selectedPatient.phone}
                </p>
              </div>
              <button
                onClick={() => setSelectedPatient(null)}
                className="w-8 h-8 rounded-full bg-slate-100 text-slate-600 font-bold text-sm flex items-center justify-center hover:bg-slate-200"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4">
              <h4 className="text-xs font-extrabold uppercase tracking-wider text-slate-700">Screening History</h4>
              {assessments.filter((a) => a.patient_id === selectedPatient.id).length > 0 ? (
                assessments
                  .filter((a) => a.patient_id === selectedPatient.id)
                  .map((ass) => (
                    <div key={ass.id} className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-2 text-xs">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-slate-800">Date: {new Date(ass.created_at).toLocaleDateString()}</span>
                        <span className={`px-2 py-0.5 rounded-full font-black text-[10px] ${
                          ass.risk_level === 'HIGH' ? 'bg-rose-100 text-rose-800' : 'bg-emerald-100 text-emerald-800'
                        }`}>
                          {ass.risk_level} RISK ({Math.round(ass.risk_score * 100)}%)
                        </span>
                      </div>
                      <p className="text-slate-700 font-semibold">Symptoms: {ass.symptoms.join(', ') || 'None'}</p>
                      <p className="text-slate-600 font-medium">Vitals: BP {ass.systolic_bp}/{ass.diastolic_bp} mmHg | Glucose: {ass.glucose_mg_dl} mg/dL | Temp: {ass.temperature_f}°F</p>
                      <div className="text-emerald-900 bg-emerald-50 p-2.5 rounded-xl border border-emerald-200 font-semibold">
                        Action: {ass.recommended_action}
                      </div>
                    </div>
                  ))
              ) : (
                <p className="text-xs text-slate-400 font-semibold">No health assessment logs for this patient yet.</p>
              )}
            </div>

            <div className="pt-4 flex justify-end">
              <button
                onClick={() => setSelectedPatient(null)}
                className="px-6 py-2.5 bg-slate-900 text-white text-xs font-bold rounded-xl"
              >
                Close
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  );
};
