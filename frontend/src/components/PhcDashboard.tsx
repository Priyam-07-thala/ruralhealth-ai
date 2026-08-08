import React, { useState, useEffect } from 'react';
import { 
  Users, AlertTriangle, Clock, 
  Search, Activity, MapPin, Stethoscope
} from 'lucide-react';
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { translations, type Language } from '../i18n/translations';
import { db, type LocalAssessment } from '../db/offlineDb';

interface PhcDashboardProps {
  lang: Language;
  isOnline: boolean;
  defaultRiskFilter?: string;
}

export const PhcDashboard: React.FC<PhcDashboardProps> = ({ lang, isOnline, defaultRiskFilter = 'ALL' }) => {
  const t = translations[lang];
  const [assessments, setAssessments] = useState<LocalAssessment[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [riskFilter, setRiskFilter] = useState(defaultRiskFilter);

  useEffect(() => {
    setRiskFilter(defaultRiskFilter);
  }, [defaultRiskFilter]);

  const loadData = async () => {
    if (isOnline) {
      try {
        const res = await fetch('http://127.0.0.1:8000/api/assessments');
        const data = await res.json();
        setAssessments(data);
        return;
      } catch (err) {
        console.warn('Backend offline, loading Dexie local assessments', err);
      }
    }

    const localList = await db.assessments.orderBy('created_at').reverse().toArray();
    setAssessments(localList);
  };

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 5000);
    return () => clearInterval(interval);
  }, [isOnline]);

  const updateReferralStatus = async (
    assessmentId: string,
    newStatus: 'NOT_REFERRED' | 'REFERRED' | 'APPOINTMENT_REQUESTED' | 'CONSULTATION_COMPLETED'
  ) => {
    // Update local state immediately
    setAssessments((prev) =>
      prev.map((a) => (a.id === assessmentId ? { ...a, referral_status: newStatus } : a))
    );

    await db.assessments.update(assessmentId, { referral_status: newStatus });

    if (isOnline) {
      try {
        await fetch(`http://127.0.0.1:8000/api/assessments/${assessmentId}/referral`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ referral_status: newStatus })
        });
      } catch (err) {
        console.warn('Referral update offline queueing', err);
      }
    }
  };

  // Metrics derived dynamically from data
  const totalPatientsCount = new Set(assessments.map((a) => a.patient_id)).size;
  const totalAssessmentsCount = assessments.length;
  const highRiskCount = assessments.filter((a) => a.risk_level === 'HIGH').length;
  const modRiskCount = assessments.filter((a) => a.risk_level === 'MODERATE').length;
  const lowRiskCount = assessments.filter((a) => a.risk_level === 'LOW').length;
  const pendingReferralsCount = assessments.filter((a) =>
    ['REFERRED', 'APPOINTMENT_REQUESTED'].includes(a.referral_status)
  ).length;

  // Chart Data
  const pieData = [
    { name: 'High Risk', value: highRiskCount || 0, color: '#f43f5e' },
    { name: 'Moderate Risk', value: modRiskCount || 0, color: '#f59e0b' },
    { name: 'Low Risk', value: lowRiskCount || 0, color: '#10b981' }
  ];

  const villagesList = Array.from(new Set(assessments.map((a) => a.village || 'Unknown'))).filter(Boolean);

  const villageChartData = villagesList.map((v) => ({
    village: v,
    count: assessments.filter((a) => a.village === v).length
  }));

  // Filtering
  const filteredAssessments = assessments.filter((a) => {
    const matchesSearch =
      (a.patient_name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (a.village || '').toLowerCase().includes(searchTerm.toLowerCase());
    const matchesRisk = riskFilter === 'ALL' || a.risk_level === riskFilter;
    return matchesSearch && matchesRisk;
  });

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">
      
      {/* Header Title */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-white p-6 rounded-3xl shadow-sm border border-slate-100">
        <div>
          <h2 className="text-2xl font-black text-slate-900 flex items-center gap-2">
            <Stethoscope className="w-7 h-7 text-teal-600" />
            <span>{t.phcTitle}</span>
          </h2>
          <p className="text-xs text-slate-500 font-semibold mt-1">
            Real-time screening triage, referral tracking & epidemic surveillance
          </p>
        </div>

        <button
          onClick={loadData}
          className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold rounded-xl transition-all"
        >
          Refresh Data ↻
        </button>
      </div>

      {/* Metric Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
        
        <div className="bg-white p-5 rounded-3xl shadow-sm border border-slate-100 flex items-center justify-between">
          <div>
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">{t.totalPatients}</span>
            <div className="text-3xl font-black text-slate-900 mt-1">{totalPatientsCount}</div>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center font-bold">
            <Users className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-white p-5 rounded-3xl shadow-sm border border-slate-100 flex items-center justify-between">
          <div>
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">{t.todayAssessments}</span>
            <div className="text-3xl font-black text-teal-600 mt-1">{totalAssessmentsCount}</div>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-teal-50 text-teal-600 flex items-center justify-center font-bold">
            <Activity className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-white p-5 rounded-3xl shadow-sm border border-slate-100 flex items-center justify-between">
          <div>
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">{t.highRiskPatients}</span>
            <div className="text-3xl font-black text-rose-600 mt-1">{highRiskCount}</div>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center font-bold">
            <AlertTriangle className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-white p-5 rounded-3xl shadow-sm border border-slate-100 flex items-center justify-between">
          <div>
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">{t.pendingReferrals}</span>
            <div className="text-3xl font-black text-amber-600 mt-1">{pendingReferralsCount}</div>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center font-bold">
            <Clock className="w-6 h-6" />
          </div>
        </div>

      </div>

      {/* Analytics Charts Row */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        
        {/* Risk Distribution Pie Chart */}
        <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100">
          <h3 className="text-sm font-extrabold uppercase tracking-wider text-slate-800 mb-4">
            Disease Risk Level Distribution
          </h3>
          <div className="h-56 w-full flex items-center justify-center">
            {totalAssessmentsCount > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={55}
                    outerRadius={80}
                    paddingAngle={5}
                    dataKey="value"
                    label={({ name, percent }) => `${name} (${((percent ?? 0) * 100).toFixed(0)}%)`}
                  >
                    {pieData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-xs text-slate-400 font-semibold">No assessments recorded yet.</p>
            )}
          </div>
        </div>

        {/* Village Screening Count Bar Chart */}
        <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100">
          <h3 className="text-sm font-extrabold uppercase tracking-wider text-slate-800 mb-4">
            Village-wise Patient Triage Count
          </h3>
          <div className="h-56 w-full">
            {villageChartData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={villageChartData}>
                  <XAxis dataKey="village" stroke="#64748b" fontSize={11} />
                  <YAxis stroke="#64748b" fontSize={11} allowDecimals={false} />
                  <Tooltip />
                  <Bar dataKey="count" fill="#0d9488" radius={[8, 8, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-xs text-slate-400 font-semibold">
                No village data available.
              </div>
            )}
          </div>
        </div>

      </div>

      {/* High-Risk Triage & Referral Queue Table */}
      <div className="bg-white rounded-3xl p-6 shadow-xl border border-slate-100 space-y-4">
        
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-4 border-b border-slate-100">
          <div>
            <h3 className="text-lg font-black text-slate-900">{t.patientTable}</h3>
            <p className="text-xs text-slate-500 font-semibold">Manage doctor appointments and consultation workflow</p>
          </div>

          {/* Search & Filters */}
          <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto">
            <div className="relative flex-1 sm:w-64">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
              <input
                type="text"
                placeholder={t.searchVillage}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full text-xs font-semibold pl-9 pr-3 py-2 rounded-xl border border-slate-300 focus:ring-2 focus:ring-teal-500 outline-none"
              />
            </div>

            <select
              value={riskFilter}
              onChange={(e) => setRiskFilter(e.target.value)}
              className="text-xs font-semibold px-3 py-2 rounded-xl border border-slate-300 bg-white"
            >
              <option value="ALL">All Risks</option>
              <option value="HIGH">High Risk</option>
              <option value="MODERATE">Moderate Risk</option>
              <option value="LOW">Low Risk</option>
            </select>
          </div>
        </div>

        {/* Table: Patient | Village | Risk | Concern | Action */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-50 text-slate-500 font-extrabold uppercase tracking-wider border-b border-slate-200">
                <th className="p-3">Patient</th>
                <th className="p-3">Village</th>
                <th className="p-3">Risk</th>
                <th className="p-3">Concern / Condition</th>
                <th className="p-3">Vitals (BP / Glucose)</th>
                <th className="p-3">Referral Status</th>
                <th className="p-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-semibold">
              {filteredAssessments.length > 0 ? (
                filteredAssessments.map((ass) => (
                  <tr key={ass.id} className="hover:bg-slate-50/80 transition-all">
                    <td className="p-3 font-bold text-slate-900">
                      {ass.patient_name || 'Patient Record'}
                    </td>
                    <td className="p-3 text-slate-600">
                      <span className="inline-flex items-center gap-1">
                        <MapPin className="w-3.5 h-3.5 text-slate-400" />
                        {ass.village || 'N/A'}
                      </span>
                    </td>
                    <td className="p-3">
                      <span
                        className={`inline-block px-2.5 py-1 rounded-full text-[11px] font-black ${
                          ass.risk_level === 'HIGH'
                            ? 'bg-rose-100 text-rose-800'
                            : ass.risk_level === 'MODERATE'
                            ? 'bg-amber-100 text-amber-800'
                            : 'bg-emerald-100 text-emerald-800'
                        }`}
                      >
                        {ass.risk_level}
                      </span>
                    </td>
                    <td className="p-3 text-slate-700 max-w-xs truncate">
                      {(ass.likely_conditions || []).join(', ')}
                    </td>
                    <td className="p-3 text-slate-600">
                      BP: {ass.systolic_bp}/{ass.diastolic_bp} | Glu: {ass.glucose_mg_dl} mg/dL
                    </td>
                    <td className="p-3">
                      <span
                        className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold ${
                          ass.referral_status === 'CONSULTATION_COMPLETED'
                            ? 'bg-emerald-100 text-emerald-900 border border-emerald-300'
                            : ass.referral_status === 'APPOINTMENT_REQUESTED'
                            ? 'bg-blue-100 text-blue-900 border border-blue-300'
                            : ass.referral_status === 'REFERRED'
                            ? 'bg-rose-100 text-rose-900 border border-rose-300'
                            : 'bg-slate-100 text-slate-600'
                        }`}
                      >
                        {ass.referral_status === 'CONSULTATION_COMPLETED'
                          ? t.consultationCompleted
                          : ass.referral_status === 'APPOINTMENT_REQUESTED'
                          ? t.apptRequested
                          : ass.referral_status === 'REFERRED'
                          ? t.referred
                          : 'Not Referred'}
                      </span>
                    </td>
                    <td className="p-3 text-right">
                      <select
                        value={ass.referral_status}
                        onChange={(e) => updateReferralStatus(ass.id, e.target.value as any)}
                        className="text-xs font-bold p-1.5 rounded-lg border border-slate-300 bg-white cursor-pointer focus:ring-2 focus:ring-teal-500"
                      >
                        <option value="NOT_REFERRED">Not Referred</option>
                        <option value="REFERRED">Referred to PHC</option>
                        <option value="APPOINTMENT_REQUESTED">Appointment Requested</option>
                        <option value="CONSULTATION_COMPLETED">Consultation Completed</option>
                      </select>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={7} className="p-6 text-center text-slate-400 font-semibold">
                    No matching high-risk records found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

      </div>

    </div>
  );
};
