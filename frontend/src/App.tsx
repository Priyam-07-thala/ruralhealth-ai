import { useState, useEffect } from 'react';
import { Header } from './components/Header';
import { AshaScreeningFlow } from './components/AshaScreeningFlow';
import { PhcDashboard } from './components/PhcDashboard';
import { PatientDirectory } from './components/PatientDirectory';
import type { Language } from './i18n/translations';
import { db } from './db/offlineDb';
import { useLiveQuery } from 'dexie-react-hooks';

export function App() {
  const [currentTab, setCurrentTab] = useState<'asha' | 'phc' | 'patients' | 'high-risk'>('asha');
  const [lang, setLang] = useState<Language>('en');
  const [isOnline, setIsOnline] = useState<boolean>(navigator.onLine);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [notification, setNotification] = useState<string | null>(null);

  // Unsynced count from Dexie IndexedDB
  const unsyncedPatients = useLiveQuery(() => db.patients.where('synced').equals(0).toArray()) || [];
  const unsyncedAssessments = useLiveQuery(() => db.assessments.where('synced').equals(0).toArray()) || [];
  const pendingSyncCount = unsyncedPatients.length + unsyncedAssessments.length;

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      showNotification('Network connection restored. Syncing records...');
      triggerSync();
    };

    const handleOffline = () => {
      setIsOnline(false);
      showNotification('Operating in OFFLINE mode. All data saved to IndexedDB.');
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Initial backend ping check
    fetch('http://127.0.0.1:8000/api/health')
      .then((res) => {
        if (res.ok) setIsOnline(true);
      })
      .catch(() => {
        // Backend not reachable
      });

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const showNotification = (msg: string) => {
    setNotification(msg);
    setTimeout(() => {
      setNotification(null);
    }, 4000);
  };

  const triggerSync = async () => {
    if (isSyncing || !isOnline) return;
    setIsSyncing(true);

    try {
      const pList = await db.patients.where('synced').equals(0).toArray();
      const aList = await db.assessments.where('synced').equals(0).toArray();

      if (pList.length === 0 && aList.length === 0) {
        setIsSyncing(false);
        return;
      }

      const response = await fetch('http://127.0.0.1:8000/api/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          patients: pList,
          assessments: aList
        })
      });

      if (response.ok) {
        // Mark locally synced
        for (const p of pList) {
          await db.patients.update(p.id, { synced: true });
        }
        for (const a of aList) {
          await db.assessments.update(a.id, { synced: true });
        }
        showNotification(`Sync Complete! ${pList.length} patients and ${aList.length} assessments synced to PHC server.`);
      }
    } catch (err) {
      console.warn('Sync failed', err);
    } finally {
      setIsSyncing(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900 flex flex-col font-sans selection:bg-emerald-500 selection:text-white">
      
      {/* Top Header */}
      <Header
        currentTab={currentTab}
        onTabChange={setCurrentTab}
        lang={lang}
        onLangChange={setLang}
        isOnline={isOnline}
        pendingSyncCount={pendingSyncCount}
        onSyncTrigger={triggerSync}
        isSyncing={isSyncing}
      />

      {/* Toast Notification Banner */}
      {notification && (
        <div className="bg-slate-900 text-emerald-400 border-b border-emerald-500/40 px-4 py-2.5 text-center text-xs sm:text-sm font-bold shadow-lg animate-fade-in flex items-center justify-center gap-2">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping"></span>
          <span>{notification}</span>
        </div>
      )}

      {/* Main Content View */}
      <main className="flex-1 pb-12">
        {currentTab === 'asha' && (
          <AshaScreeningFlow
            lang={lang}
            isOnline={isOnline}
            onAssessmentComplete={() => {
              if (isOnline && pendingSyncCount > 0) {
                triggerSync();
              }
            }}
          />
        )}

        {(currentTab === 'phc' || currentTab === 'high-risk') && (
          <PhcDashboard
            lang={lang}
            isOnline={isOnline}
            defaultRiskFilter={currentTab === 'high-risk' ? 'HIGH' : 'ALL'}
          />
        )}

        {currentTab === 'patients' && (
          <PatientDirectory
            lang={lang}
            isOnline={isOnline}
          />
        )}
      </main>

      {/* Footer */}
      <footer className="bg-slate-900 text-slate-400 text-[11px] py-4 text-center border-t border-slate-800">
        <p className="font-semibold">
          RuralHealth AI • Hackathon Prototype for Early Disease Risk Prediction & Rural Access
        </p>
        <p className="text-slate-500 mt-0.5">
          Decision Support Tool only • Not a substitute for professional clinical diagnosis
        </p>
      </footer>

    </div>
  );
}

export default App;
