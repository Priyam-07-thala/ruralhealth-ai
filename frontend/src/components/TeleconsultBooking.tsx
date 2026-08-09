import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  MapPin, Star, Clock, Calendar, CheckCircle2, X,
  Video, Stethoscope, AlertTriangle, Heart, Wind, Droplets,
  UserCheck, Loader2, Navigation2, RefreshCw,
  CalendarCheck, XCircle, Building2, Zap, Phone, Search
} from 'lucide-react';
import { db, type LocalAssessment, type LocalAppointment } from '../db/offlineDb';
import { useLiveQuery } from 'dexie-react-hooks';
import type { Language } from '../i18n/translations';

// ─── TYPES ─────────────────────────────────────────────────────────────────────

interface TeleconsultBookingProps {
  lang: Language;
  isOnline: boolean;
}

interface NearbyDoctor {
  id: string;
  name: string;
  specialty: string;
  address: string;
  phone?: string;
  rating?: number;
  distance?: string;
  isOpen?: boolean;
  lat?: number;
  lng?: number;
  amenity?: string;
  website?: string;
}

interface BookingModalState {
  isOpen: boolean;
  doctor: NearbyDoctor | null;
}

// ─── GOOGLE MAPS TYPE SHIM ────────────────────────────────────────────────────
declare global {
  interface Window {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    google: any;
    initGoogleMap?: () => void;
    gm_authFailure?: () => void;
  }
}

// ─── SPECIALTY MAPPER ─────────────────────────────────────────────────────────

const CONDITION_TO_SPECIALTY: Record<string, {
  specialty: string;
  icon: React.ReactNode;
  color: string;
  tests: string[];
  osmKeyword: string;
}> = {
  diabetes: {
    specialty: 'Endocrinologist / Diabetologist',
    icon: <Droplets className="w-5 h-5" />,
    color: 'from-blue-500 to-cyan-500',
    tests: ['Fasting Blood Glucose (FBG)', 'HbA1c', 'Urine Micro-albumin', 'Lipid Profile'],
    osmKeyword: 'hospital'
  },
  hypertension: {
    specialty: 'Cardiologist / Internal Medicine',
    icon: <Heart className="w-5 h-5" />,
    color: 'from-rose-500 to-pink-500',
    tests: ['ECG / EKG', 'Echocardiogram', 'Serum Creatinine', 'Urinalysis'],
    osmKeyword: 'hospital'
  },
  cardiovascular: {
    specialty: 'Cardiologist',
    icon: <Heart className="w-5 h-5" />,
    color: 'from-rose-500 to-red-500',
    tests: ['ECG', 'Chest X-Ray', 'Troponin Test', 'Lipid Panel'],
    osmKeyword: 'hospital'
  },
  tb: {
    specialty: 'Pulmonologist / TB Specialist',
    icon: <Wind className="w-5 h-5" />,
    color: 'from-amber-500 to-orange-500',
    tests: ['Sputum Smear Microscopy', 'CBNAAT / GeneXpert', 'Chest X-Ray', 'Mantoux Test'],
    osmKeyword: 'hospital'
  },
  respiratory: {
    specialty: 'Pulmonologist',
    icon: <Wind className="w-5 h-5" />,
    color: 'from-sky-500 to-blue-500',
    tests: ['Chest X-Ray', 'Spirometry', 'Blood Culture', 'CBC with Differential'],
    osmKeyword: 'hospital'
  },
  anemia: {
    specialty: 'General Physician / Haematologist',
    icon: <Droplets className="w-5 h-5" />,
    color: 'from-purple-500 to-violet-500',
    tests: ['Complete Blood Count (CBC)', 'Serum Iron & Ferritin', 'Peripheral Blood Smear', 'Vitamin B12 & Folate'],
    osmKeyword: 'hospital'
  },
  default: {
    specialty: 'General Physician (MBBS / MD)',
    icon: <Stethoscope className="w-5 h-5" />,
    color: 'from-emerald-500 to-teal-500',
    tests: ['Complete Blood Count (CBC)', 'Urine Routine', 'Blood Glucose Fasting', 'Chest X-Ray'],
    osmKeyword: 'hospital'
  }
};

function detectSpecialty(conditions: string[]) {
  const t = conditions.join(' ').toLowerCase();
  if (t.includes('tb') || t.includes('tuberculosis') || t.includes('sputum')) return CONDITION_TO_SPECIALTY.tb;
  if (t.includes('diabet')) return CONDITION_TO_SPECIALTY.diabetes;
  if (t.includes('cardiovascular') || t.includes('chest')) return CONDITION_TO_SPECIALTY.cardiovascular;
  if (t.includes('hypertension') || t.includes('blood pressure')) return CONDITION_TO_SPECIALTY.hypertension;
  if (t.includes('respiratory') || t.includes('infection')) return CONDITION_TO_SPECIALTY.respiratory;
  if (t.includes('anemia') || t.includes('nutritional')) return CONDITION_TO_SPECIALTY.anemia;
  return CONDITION_TO_SPECIALTY.default;
}

// ─── TIME SLOTS ───────────────────────────────────────────────────────────────

const TIME_SLOTS = {
  morning:   ['08:00 AM', '08:30 AM', '09:00 AM', '09:30 AM', '10:00 AM', '10:30 AM', '11:00 AM', '11:30 AM'],
  afternoon: ['12:00 PM', '12:30 PM', '01:00 PM', '01:30 PM', '02:00 PM', '02:30 PM', '03:00 PM'],
  evening:   ['04:00 PM', '04:30 PM', '05:00 PM', '05:30 PM', '06:00 PM', '06:30 PM', '07:00 PM']
};

function getNext7Days() {
  const days: { label: string; value: string }[] = [];
  const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const months   = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  for (let i = 0; i < 7; i++) {
    const d = new Date();
    d.setDate(d.getDate() + i);
    days.push({
      value: d.toISOString().split('T')[0],
      label: i === 0
        ? `Today, ${d.getDate()} ${months[d.getMonth()]}`
        : `${weekdays[d.getDay()]}, ${d.getDate()} ${months[d.getMonth()]}`
    });
  }
  return days;
}

// ─── HAVERSINE DISTANCE ───────────────────────────────────────────────────────
function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ─── DYNAMIC FALLBACK DOCTORS (if Overpass fails) ───────────────────────────
function generateFallbackDoctors(lat: number, lng: number): NearbyDoctor[] {
  return [
    { id: 'f1', name: 'Primary Health Centre (Local)', specialty: 'General Physician',
      address: 'Near Main Market, Local District', phone: '9876543210', distance: '1.2 km', lat: lat + 0.01, lng: lng + 0.01 },
    { id: 'f2', name: 'Community Health Centre', specialty: 'Multi-Specialty',
      address: 'Tehsil Road', phone: '9988776655', distance: '3.4 km', lat: lat - 0.02, lng: lng + 0.015 },
    { id: 'f3', name: 'District Hospital', specialty: 'Endocrinology / Diabetes',
      address: 'District Hospital Block', phone: '9765432109', distance: '5.1 km', lat: lat + 0.03, lng: lng - 0.02 },
    { id: 'f4', name: 'TB Control & Chest Disease Centre', specialty: 'Pulmonology / TB',
      address: 'Medical Enclave', phone: '9654321098', distance: '7.8 km', lat: lat - 0.01, lng: lng - 0.03 },
    { id: 'f5', name: 'Mahila Swasthya Kendra', specialty: 'Gynaecology & General',
      address: 'Women Health Block', phone: '9543210987', distance: '9.2 km', lat: lat + 0.04, lng: lng + 0.04 }
  ];
}

// ─── MAP LOADERS ──────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare const L: any;

function loadLeaflet(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (typeof L !== 'undefined') { resolve(); return; }
    if (document.getElementById('leaflet-js')) {
      document.getElementById('leaflet-js')!.addEventListener('load', () => resolve());
      return;
    }
    const link = document.createElement('link');
    link.id = 'leaflet-css'; link.rel = 'stylesheet'; link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
    document.head.appendChild(link);

    const script = document.createElement('script');
    script.id = 'leaflet-js'; script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Leaflet CDN load failed'));
    document.head.appendChild(script);
  });
}

function loadGoogleMaps(apiKey: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (window.google && window.google.maps) {
      resolve();
      return;
    }
    
    // We catch the authentication failure globally
    window.gm_authFailure = () => {
      reject(new Error('GOOGLE_MAPS_AUTH_FAIL'));
    };

    if (document.getElementById('google-maps-script')) {
      const script = document.getElementById('google-maps-script') as HTMLScriptElement;
      script.addEventListener('load', () => resolve());
      script.addEventListener('error', () => reject(new Error('Script load failed')));
      return;
    }
    const script = document.createElement('script');
    script.id = 'google-maps-script';
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places`;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Script load failed'));
    document.head.appendChild(script);
  });
}

// ─── OVERPASS API ─────────────────────────────────────────────────────────────
async function fetchNearbyHospitals(lat: number, lng: number, radiusM = 15000): Promise<NearbyDoctor[]> {
  const query = `
    [out:json][timeout:30];
    (
      node["amenity"~"^(hospital|clinic|doctors|health_post|pharmacy)$"](around:${radiusM},${lat},${lng});
      way["amenity"~"^(hospital|clinic|doctors|health_post)$"](around:${radiusM},${lat},${lng});
    );
    out center tags;
  `;
  const url = `https://overpass-api.de/api/interpreter?data=${encodeURIComponent(query.trim())}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(20000) });
  if (!res.ok) throw new Error(`Overpass error: ${res.status}`);
  const data = await res.json();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const elements: any[] = data.elements || [];
  const doctors: NearbyDoctor[] = elements
    .map((el, idx) => {
      const elLat: number = el.lat ?? el.center?.lat ?? lat;
      const elLng: number = el.lon ?? el.center?.lon ?? lng;
      const tags = el.tags || {};
      const distKm = haversineKm(lat, lng, elLat, elLng);
      const amenity: string = tags.amenity || 'hospital';
      const specialtyTag: string = tags.healthcare_speciality || tags.speciality || '';
      const displayName: string =
        tags['name:en'] || tags.name || tags['name:hi'] || `Health ${amenity.charAt(0).toUpperCase() + amenity.slice(1)} ${idx + 1}`;
      return {
        id: String(el.id),
        name: displayName,
        specialty: specialtyTag
          ? specialtyTag.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase())
          : amenity === 'hospital' ? 'Hospital / Multi-Specialty'
          : amenity === 'clinic'  ? 'Clinic / General Practice'
          : amenity === 'pharmacy' ? 'Pharmacy'
          : 'Health Centre',
        address: [tags['addr:housename'], tags['addr:street'], tags['addr:city'], tags['addr:state']]
          .filter(Boolean).join(', ') || tags.description || `${(distKm).toFixed(1)} km from you`,
        phone:    tags.phone || tags['contact:phone'],
        distance: `${distKm.toFixed(1)} km`,
        lat: elLat,
        lng: elLng,
        amenity,
        website: tags.website || tags['contact:website']
      } as NearbyDoctor;
    })
    .filter(d => d.amenity !== 'pharmacy')
    .sort((a, b) => parseFloat(a.distance!) - parseFloat(b.distance!))
    .slice(0, 12);

  return doctors;
}

// ─── MAIN COMPONENT ───────────────────────────────────────────────────────────

export const TeleconsultBooking: React.FC<TeleconsultBookingProps> = ({ isOnline }) => {
  const mapRef     = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mapObjRef  = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const markersRef = useRef<any[]>([]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const infoWindowRef = useRef<any>(null);

  const [doctors,          setDoctors]          = useState<NearbyDoctor[]>([]);
  const [isLocating,       setIsLocating]        = useState(false);
  const [mapStatus,        setMapStatus]         = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [mapErrorMsg,      setMapErrorMsg]        = useState('');
  const [userLocation,     setUserLocation]       = useState<{ lat: number; lng: number } | null>(null);
  const [selectedId,       setSelectedId]         = useState<string | null>(null);
  
  // DUAL MAP ENGINE STATE
  const [mapProvider, setMapProvider] = useState<'google' | 'leaflet'>('leaflet');

  const [modal,            setModal]             = useState<BookingModalState>({ isOpen: false, doctor: null });
  const [selectedDate,     setSelectedDate]       = useState('');
  const [selectedTime,     setSelectedTime]       = useState('');
  const [patientName,      setPatientName]        = useState('');
  const [patientPhone,     setPatientPhone]       = useState('');
  const [notes,            setNotes]             = useState('');
  const [isBooking,        setIsBooking]          = useState(false);
  const [bookingSuccess,   setBookingSuccess]     = useState(false);

  // Load last assessment from IndexedDB for context
  const lastAssessment = useLiveQuery<LocalAssessment | undefined>(
    () => db.assessments.orderBy('created_at').last()
  );

  const appointments = useLiveQuery<LocalAppointment[]>(
    () => db.appointments.orderBy('created_at').reverse().toArray()
  ) || [];

  const specialtyInfo = detectSpecialty(lastAssessment?.likely_conditions || []);

  useEffect(() => {
    if (lastAssessment?.patient_name) setPatientName(lastAssessment.patient_name);
    if (lastAssessment?.patient_name) setPatientPhone('');
  }, [lastAssessment]);

  // ─── INIT LEAFLET MAP ────────────────────────────────────────────────────────
  const initLeafletMap = useCallback(async (lat: number, lng: number, doctorsList: NearbyDoctor[]) => {
    if (!mapRef.current) return;
    try {
      await loadLeaflet();
    } catch {
      setMapStatus('error');
      setMapErrorMsg('Leaflet map library could not be loaded.');
      return;
    }

    if (mapObjRef.current) {
      mapObjRef.current.remove();
      mapObjRef.current = null;
    }
    markersRef.current.forEach(m => m.marker?.remove?.());
    markersRef.current = [];

    const map = L.map(mapRef.current, { zoomControl: true, attributionControl: true }).setView([lat, lng], 13);
    mapObjRef.current = map;

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 19
    }).addTo(map);

    const userIcon = L.divIcon({
      className: '',
      html: `<div style="width:18px;height:18px;border-radius:50%;background:#10b981;border:3px solid #fff;box-shadow:0 0 0 4px rgba(16,185,129,0.3);animation:leaflet-pulse 1.5s infinite;"></div>`,
      iconSize: [18, 18],
      iconAnchor: [9, 9]
    });
    L.marker([lat, lng], { icon: userIcon }).addTo(map).bindPopup('<b>📍 Your Location</b>');

    doctorsList.forEach((doc) => {
      if (!doc.lat || !doc.lng) return;
      const amenityColor = doc.amenity === 'hospital' ? '#ef4444' : doc.amenity === 'clinic' ? '#6366f1' : '#f59e0b';
      const hospIcon = L.divIcon({
        className: '',
        html: `
          <div style="background:${amenityColor};color:#fff;border-radius:50% 50% 50% 0;transform:rotate(-45deg);width:30px;height:30px;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 8px rgba(0,0,0,0.35);border:2px solid #fff;">
            <span style="transform:rotate(45deg);font-size:14px;">🏥</span>
          </div>`,
        iconSize: [30, 30],
        iconAnchor: [15, 30],
        popupAnchor: [0, -30]
      });

      const marker = L.marker([doc.lat, doc.lng], { icon: hospIcon })
        .addTo(map)
        .bindPopup(`
          <div style="font-family:system-ui,sans-serif;min-width:180px;">
            <b style="font-size:13px">${doc.name}</b><br/>
            <span style="font-size:11px;color:#6366f1">${doc.specialty}</span><br/>
            <span style="font-size:11px;color:#64748b">${doc.distance}</span>
          </div>
        `);
      marker.on('click', () => setSelectedId(doc.id));
      markersRef.current.push({ id: doc.id, marker });
    });

    setMapStatus('ready');
    setTimeout(() => map.invalidateSize(), 100);
  }, []);

  // ─── INIT GOOGLE MAPS ────────────────────────────────────────────────────────
  const initGoogleMap = useCallback(async (lat: number, lng: number, fallbackDocs: NearbyDoctor[]) => {
    if (!mapRef.current || !window.google) return [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const G = window.google as any;

    if (mapObjRef.current?.remove) {
      mapObjRef.current.remove();
    }
    markersRef.current.forEach(m => m.marker?.setMap?.(null));
    markersRef.current = [];

    if (!infoWindowRef.current) {
      infoWindowRef.current = new G.maps.InfoWindow();
    }

    const map = new G.maps.Map(mapRef.current, {
      center: { lat, lng },
      zoom: 13,
      mapTypeControl: false,
      streetViewControl: false,
      styles: [
        { featureType: 'all', elementType: 'geometry', stylers: [{ color: '#f0f4f8' }] },
        { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#bfdbf7' }] },
        { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#ffffff' }] },
        { featureType: 'poi.medical', elementType: 'geometry', stylers: [{ color: '#fde8e8' }] }
      ]
    });
    mapObjRef.current = map;

    // User marker
    new G.maps.Marker({
      position: { lat, lng },
      map,
      title: 'Your Location',
      icon: {
        path: G.maps.SymbolPath.CIRCLE,
        scale: 10,
        fillColor: '#10b981',
        fillOpacity: 1,
        strokeColor: '#fff',
        strokeWeight: 3
      }
    });

    return new Promise<NearbyDoctor[]>((resolve) => {
      const service = new G.maps.places.PlacesService(map);
      service.nearbySearch(
        { location: { lat, lng }, radius: 10000, type: 'doctor' },
        (results: any[], status: string) => {
          let docsToRender: NearbyDoctor[] = [];
          
          if (status === G.maps.places.PlacesServiceStatus.OK && results && results.length > 0) {
            docsToRender = results.slice(0, 8).map((place: any, idx: number) => {
              const dlat = place.geometry?.location?.lat() ?? lat;
              const dlng = place.geometry?.location?.lng() ?? lng;
              const distKm = haversineKm(lat, lng, dlat, dlng);
              return {
                id: place.place_id || `p${idx}`,
                name: place.name || 'Unknown Doctor',
                specialty: 'Hospital / Clinic',
                address: place.vicinity || 'Address unavailable',
                rating: place.rating,
                distance: `${distKm.toFixed(1)} km`,
                lat: dlat,
                lng: dlng
              };
            });
          } else {
            docsToRender = fallbackDocs;
          }

          docsToRender.forEach(doc => {
            if (!doc.lat || !doc.lng) return;
            const contentString = `
              <div style="font-family:system-ui,sans-serif;min-width:180px;">
                <b style="font-size:13px">${doc.name}</b><br/>
                <span style="font-size:11px;color:#6366f1">${doc.specialty}</span><br/>
                <span style="font-size:11px;color:#64748b">${doc.distance}</span>
              </div>
            `;
            
            const marker = new G.maps.Marker({
              position: { lat: doc.lat, lng: doc.lng },
              map,
              title: doc.name,
              icon: {
                url: 'https://maps.gstatic.com/mapfiles/place_api/icons/v1/png_71/doctor-71.png',
                scaledSize: new G.maps.Size(32, 32)
              },
              animation: G.maps.Animation.DROP
            });
            marker.addListener('click', () => {
              infoWindowRef.current.setContent(contentString);
              infoWindowRef.current.open(map, marker);
              setSelectedId(doc.id);
            });
            markersRef.current.push({ id: doc.id, marker, content: contentString });
          });
          
          resolve(docsToRender);
        }
      );
    });
  }, []);

  const [resolvedLocationName, setResolvedLocationName] = useState<string>('');
  const [manualLocation, setManualLocation] = useState<string>('');

  // ─── LOCATE + LOAD DOCTORS ───────────────────────────────────────────────────
  const locateAndLoad = useCallback(async (overrideVillage?: string) => {
    setIsLocating(true);
    setMapStatus('loading');
    setMapErrorMsg('');
    setDoctors([]);
    setResolvedLocationName('Locating...');

    try {
      const googleKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
      let activeProvider = mapProvider;

      if (googleKey && googleKey !== 'your_google_maps_api_key_here') {
        try {
          await loadGoogleMaps(googleKey);
          activeProvider = 'google';
        } catch (err: any) {
          activeProvider = 'leaflet';
        }
      } else {
        activeProvider = 'leaflet';
      }
      setMapProvider(activeProvider);

      let lat = 20.5937;
      let lng = 78.9629;
      let villageStr = overrideVillage || '';

      if (!villageStr) {
        // 1. Try to get village from the most recent assessment
        const lastAss = await db.assessments.orderBy('created_at').last();
        if (lastAss?.village) {
          villageStr = lastAss.village;
        } else if (lastAss?.patient_id) {
           const p = await db.patients.get(lastAss.patient_id);
           if (p?.village) villageStr = p.village;
        }

        // 2. If no assessment exists, try to get the most recently registered patient
        if (!villageStr) {
          const lastPat = await db.patients.orderBy('created_at').last();
          if (lastPat?.village) villageStr = lastPat.village;
        }

        // 3. Fallback
        if (!villageStr) {
          villageStr = 'India';
        }
      }

      setResolvedLocationName(villageStr);

      // Geocode using OSM Nominatim (Free, no API key required for geocoding)
      try {
        const res = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(villageStr)}&format=json&limit=1`);
        const data = await res.json();
        if (data && data.length > 0) {
          lat = parseFloat(data[0].lat);
          lng = parseFloat(data[0].lon);
          setResolvedLocationName(data[0].display_name || villageStr);
        } else {
          console.warn("OSM Geocoding found no results for", villageStr);
          if (overrideVillage) setMapErrorMsg(`Could not find location: ${overrideVillage}`);
        }
      } catch (e) {
        console.warn("OSM Geocoding network failed");
        if (overrideVillage) setMapErrorMsg('Network error while searching location.');
      }

      setUserLocation({ lat, lng });

      if (activeProvider === 'google') {
        const fallbackDocs = generateFallbackDoctors(lat, lng);
        let foundDocs = await initGoogleMap(lat, lng, fallbackDocs);
        setDoctors(foundDocs || []);
        setMapStatus('ready');
      } else {
        let nearbyDocs: NearbyDoctor[] = [];
        try {
          nearbyDocs = await fetchNearbyHospitals(lat, lng, 15000);
        } catch (err) {
          nearbyDocs = generateFallbackDoctors(lat, lng);
        }
        if (nearbyDocs.length === 0) nearbyDocs = generateFallbackDoctors(lat, lng);
        setDoctors(nearbyDocs);
        await initLeafletMap(lat, lng, nearbyDocs);
      }
    } catch (err: any) {
      setMapErrorMsg('Location error. Showing demo doctors.');
      setMapStatus('error');
      setDoctors(generateFallbackDoctors(20.5937, 78.9629));
    } finally {
      setIsLocating(false);
    }
  }, [initLeafletMap, initGoogleMap, mapProvider]);

  const handleManualSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (manualLocation.trim()) {
      locateAndLoad(manualLocation.trim());
    }
  };

  useEffect(() => {
    locateAndLoad();
    return () => {
      if (mapObjRef.current?.remove) mapObjRef.current.remove(); // leaflet cleanup
    };
  }, [locateAndLoad]);

  // ─── PAN MAP TO SELECTED DOCTOR ───────────────────────────────────────────────
  useEffect(() => {
    if (!selectedId || !mapObjRef.current) return;
    const doc = doctors.find(d => d.id === selectedId);
    if (doc?.lat && doc?.lng) {
      if (mapProvider === 'leaflet' && typeof mapObjRef.current.flyTo === 'function') {
        mapObjRef.current.flyTo([doc.lat, doc.lng], 15, { duration: 1.2 });
        const m = markersRef.current.find(m => m.id === selectedId);
        if (m) m.marker.openPopup();
      } else if (mapProvider === 'google' && typeof mapObjRef.current.panTo === 'function') {
        mapObjRef.current.panTo({ lat: doc.lat, lng: doc.lng });
        mapObjRef.current.setZoom(15);
        const m = markersRef.current.find(m => m.id === selectedId);
        if (m && window.google) {
          m.marker.setAnimation(window.google.maps.Animation.BOUNCE);
          setTimeout(() => m.marker.setAnimation(null), 1400); // 2 bounces
          if (infoWindowRef.current && m.content) {
             infoWindowRef.current.setContent(m.content);
             infoWindowRef.current.open(mapObjRef.current, m.marker);
          }
        }
      }
      
      // Scroll the list to the selected item if clicked from the map
      const listContainer = document.getElementById('hospital-list-container');
      const selectedEl = document.getElementById(`hospital-card-${selectedId}`);
      if (listContainer && selectedEl) {
        selectedEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    }
  }, [selectedId, doctors, mapProvider]);

  // ─── BOOKING ──────────────────────────────────────────────────────────────────
  const openBooking = (doc: NearbyDoctor) => {
    setModal({ isOpen: true, doctor: doc });
    setSelectedDate(''); setSelectedTime(''); setNotes(''); setBookingSuccess(false);
  };

  const confirmBooking = async () => {
    if (!modal.doctor || !selectedDate || !selectedTime || !patientName.trim()) return;
    setIsBooking(true);
    const apptId = `appt_${Date.now()}`;
    const appt: LocalAppointment = {
      id: apptId, patient_name: patientName, patient_phone: patientPhone,
      doctor_name: modal.doctor.name, doctor_specialty: modal.doctor.specialty,
      doctor_address: modal.doctor.address, appointment_date: selectedDate,
      appointment_time: selectedTime, notes, status: 'PENDING',
      risk_level: lastAssessment?.risk_level, likely_conditions: lastAssessment?.likely_conditions || [],
      created_at: new Date().toISOString(), synced: false
    };

    await db.appointments.put(appt);

    if (isOnline) {
      try {
        await fetch('http://127.0.0.1:8000/api/appointments', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...appt, likely_conditions: appt.likely_conditions || [] })
        });
        await db.appointments.update(apptId, { synced: true });
      } catch { /* queued */ }
    }

    setIsBooking(false);
    setBookingSuccess(true);
  };

  const days = getNext7Days();

  // ─── RENDER ───────────────────────────────────────────────────────────────────
  return (
    <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">

      <div className="bg-gradient-to-br from-indigo-900 via-violet-900 to-purple-900 rounded-3xl p-6 sm:p-8 text-white shadow-2xl overflow-hidden relative">
        <div className="absolute inset-0 opacity-10 bg-[radial-gradient(circle_at_30%_50%,rgba(255,255,255,0.3),transparent_60%)]" />
        <div className="relative z-10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <div className="w-10 h-10 rounded-xl bg-white/15 flex items-center justify-center backdrop-blur">
                <Video className="w-5 h-5 text-violet-200" />
              </div>
              <span className="text-xs font-bold text-violet-300 uppercase tracking-widest">Teleconsultation Hub</span>
            </div>
            <h2 className="text-2xl sm:text-3xl font-black">Find Nearby Hospital / Doctor</h2>
            <p className="text-violet-200 text-sm font-medium mt-1">
              GPS-powered real hospital search · Instant booking · Works offline
            </p>
          </div>
          <div className="flex flex-col gap-2 shrink-0">
            <div className="flex items-center gap-2 bg-white/10 px-4 py-2 rounded-2xl border border-white/20 backdrop-blur">
              <div className={`w-2 h-2 rounded-full ${isOnline ? 'bg-emerald-400 animate-pulse' : 'bg-rose-400'}`} />
              <span className="text-xs font-bold">{isOnline ? 'Online — Live Sync' : 'Offline — IndexedDB'}</span>
            </div>
          </div>
        </div>
      </div>

      {lastAssessment && (
        <div className="bg-white rounded-3xl p-6 shadow-lg border border-slate-100">
          <h3 className="text-xs font-black uppercase tracking-widest text-slate-500 mb-4">
            🎯 Objectified Risk → Specialist Match
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className={`rounded-2xl p-5 ${
              lastAssessment.risk_level === 'HIGH' ? 'bg-gradient-to-br from-rose-50 to-red-50 border border-rose-200'
              : lastAssessment.risk_level === 'MODERATE' ? 'bg-gradient-to-br from-amber-50 to-orange-50 border border-amber-200'
              : 'bg-gradient-to-br from-emerald-50 to-teal-50 border border-emerald-200'
            }`}>
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Last Assessment</span>
                <span className={`text-xs font-black px-3 py-1 rounded-full ${
                  lastAssessment.risk_level === 'HIGH' ? 'bg-rose-200 text-rose-800'
                  : lastAssessment.risk_level === 'MODERATE' ? 'bg-amber-200 text-amber-800'
                  : 'bg-emerald-200 text-emerald-800'
                }`}>
                  {lastAssessment.risk_level} RISK · {Math.round(lastAssessment.risk_score * 100)}%
                </span>
              </div>
              <p className="font-black text-slate-900 text-lg">{lastAssessment.patient_name || 'Patient'}</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {(lastAssessment.likely_conditions || []).slice(0, 3).map((c, i) => (
                  <span key={i} className="text-[10px] font-bold bg-white/80 text-slate-700 px-2.5 py-1 rounded-full border border-white shadow-sm">
                    {c.length > 48 ? c.slice(0, 45) + '…' : c}
                  </span>
                ))}
              </div>
            </div>

            <div className={`rounded-2xl p-5 bg-gradient-to-br ${specialtyInfo.color} text-white shadow-lg`}>
              <div className="flex items-center gap-2 mb-2">
                <div className="w-8 h-8 rounded-xl bg-white/20 flex items-center justify-center">
                  {specialtyInfo.icon}
                </div>
                <span className="text-xs font-black uppercase tracking-wider opacity-80">Recommended Specialist</span>
              </div>
              <p className="font-black text-lg leading-snug">{specialtyInfo.specialty}</p>
              <div className="mt-3">
                <p className="text-[10px] font-bold uppercase tracking-wider opacity-70 mb-1.5">Advised Diagnostic Tests</p>
                <div className="flex flex-wrap gap-1.5">
                  {specialtyInfo.tests.map((t, i) => (
                    <span key={i} className="text-[10px] font-bold bg-white/20 px-2.5 py-1 rounded-full border border-white/30">{t}</span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        <div className="lg:col-span-3 bg-white rounded-3xl overflow-hidden shadow-xl border border-slate-100">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Navigation2 className="w-4 h-4 text-indigo-600" />
              <h3 className="font-extrabold text-slate-900 text-sm">Nearby Hospitals</h3>
              
              {/* MAP PROVIDER BADGE */}
              {!isLocating && mapStatus !== 'error' && (
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                  mapProvider === 'google' ? 'bg-blue-100 text-blue-700' : 'bg-emerald-100 text-emerald-700'
                }`}>
                  {mapProvider === 'google' ? 'Google Maps' : 'OpenStreetMap'}
                </span>
              )}
            </div>
            
            <div className="flex items-center gap-3 w-full sm:w-auto">
              <form onSubmit={handleManualSearch} className="flex items-center relative w-full sm:w-64">
                <input 
                  type="text" 
                  placeholder="Search city (e.g. Mumbai)" 
                  value={manualLocation}
                  onChange={(e) => setManualLocation(e.target.value)}
                  className="w-full text-sm py-1.5 pl-3 pr-8 border-2 border-slate-200 rounded-xl focus:border-indigo-500 focus:outline-none transition-colors"
                />
                <button type="submit" className="absolute right-2 text-slate-400 hover:text-indigo-600 p-1">
                  <Search className="w-4 h-4" />
                </button>
              </form>

              <button onClick={() => locateAndLoad()} disabled={isLocating} className="flex items-center gap-1.5 text-xs font-bold text-indigo-600 hover:text-indigo-800 disabled:opacity-50 shrink-0">
                <RefreshCw className={`w-3.5 h-3.5 ${isLocating ? 'animate-spin' : ''}`} />
                <span className="hidden sm:inline">Refresh</span>
              </button>
            </div>
          </div>

          <div className="relative">
            <div ref={mapRef} className="w-full h-80 sm:h-96" style={{ display: mapStatus === 'ready' ? 'block' : 'none', zIndex: 0 }} />

            {(isLocating || mapStatus === 'loading') && (
              <div className="h-80 sm:h-96 bg-gradient-to-br from-indigo-50 to-violet-50 flex flex-col items-center justify-center gap-4">
                <Loader2 className="w-10 h-10 text-indigo-500 animate-spin" />
                <div className="text-center">
                  <p className="font-black text-slate-800 text-base">Finding your location…</p>
                  <p className="text-xs text-slate-500 mt-1">Initializing map engine</p>
                </div>
              </div>
            )}

            {mapStatus === 'error' && !isLocating && (
              <div className="h-80 sm:h-96 bg-amber-50 flex flex-col items-center justify-center gap-3 p-6">
                <AlertTriangle className="w-10 h-10 text-amber-500" />
                <p className="text-sm font-bold text-amber-800 text-center max-w-sm">{mapErrorMsg}</p>
                <button onClick={() => locateAndLoad()} className="mt-2 px-4 py-2 bg-amber-600 text-white text-xs font-bold rounded-xl hover:bg-amber-700">Try Again</button>
              </div>
            )}
          </div>

          {userLocation && (
            <div className="px-5 py-3 bg-slate-50 border-t border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                <span className="text-[10px] font-bold text-slate-500 uppercase truncate max-w-[200px] sm:max-w-xs" title={resolvedLocationName}>
                  LOC: {resolvedLocationName}
                </span>
              </div>
              <span className="text-[10px] text-slate-500 font-semibold shrink-0">{doctors.length} hospitals found</span>
            </div>
          )}
        </div>

        <div className="lg:col-span-2 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-extrabold text-slate-900 flex items-center gap-2">
              <Building2 className="w-4 h-4 text-indigo-600" /> Available ({doctors.length})
            </h3>
          </div>

          {isLocating && (
            <div className="space-y-3">
              {[1, 2, 3].map(i => (
                <div key={i} className="bg-white rounded-2xl p-4 border border-slate-100 animate-pulse">
                  <div className="h-4 bg-slate-200 rounded w-3/4 mb-2" /><div className="h-3 bg-slate-100 rounded w-1/2 mb-3" />
                  <div className="h-3 bg-slate-100 rounded w-full mb-2" /><div className="h-7 bg-slate-100 rounded-xl w-1/2 ml-auto" />
                </div>
              ))}
            </div>
          )}

          {!isLocating && doctors.length === 0 && (
            <div className="bg-white rounded-2xl p-6 border border-slate-100 text-center">
              <MapPin className="w-8 h-8 text-slate-300 mx-auto mb-2" />
              <p className="text-sm font-bold text-slate-400">No hospitals found yet</p>
              <button onClick={() => locateAndLoad()} className="mt-3 text-xs font-bold text-indigo-600 underline">Search again</button>
            </div>
          )}

          <div id="hospital-list-container" className="space-y-3 max-h-[540px] overflow-y-auto pr-1">
            {doctors.map((doc) => (
              <div id={`hospital-card-${doc.id}`} key={doc.id} onClick={() => setSelectedId(doc.id)} className={`bg-white rounded-2xl p-4 border-2 cursor-pointer transition-all hover:shadow-md ${selectedId === doc.id ? 'border-indigo-500 shadow-lg shadow-indigo-100' : 'border-slate-100 hover:border-indigo-200'}`}>
                <div className="flex items-start justify-between gap-2 mb-1.5">
                  <div className="flex-1 min-w-0">
                    <p className="font-extrabold text-slate-900 text-sm leading-tight">{doc.name}</p>
                    <p className="text-xs text-indigo-700 font-semibold mt-0.5">{doc.specialty}</p>
                  </div>
                  {doc.rating && (
                    <span className="flex items-center gap-0.5 text-[11px] font-bold text-amber-600 shrink-0"><Star className="w-3 h-3 fill-amber-400 text-amber-400" />{doc.rating}</span>
                  )}
                </div>
                <div className="flex items-start gap-1.5 text-[11px] text-slate-500 font-medium mb-2">
                  <MapPin className="w-3 h-3 text-slate-400 mt-0.5 shrink-0" /><span className="line-clamp-2">{doc.address}</span>
                </div>
                {doc.phone && (
                  <div className="flex items-center gap-1.5 text-[11px] text-slate-500 font-medium mb-2">
                    <Phone className="w-3 h-3 text-slate-400 shrink-0" /><span>{doc.phone}</span>
                  </div>
                )}
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1 text-[11px] font-bold text-slate-600"><Navigation2 className="w-3 h-3 text-indigo-400" />{doc.distance}</span>
                  <button onClick={(e) => { e.stopPropagation(); openBooking(doc); }} className="flex items-center gap-1.5 px-3 py-1.5 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 text-white font-extrabold text-[11px] rounded-xl shadow-sm shadow-indigo-300 transition-all hover:scale-105 active:scale-95"><CalendarCheck className="w-3.5 h-3.5" />Book</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── MY APPOINTMENTS ─────────────────────────────────────────────────── */}
      <div className="bg-white rounded-3xl p-6 shadow-lg border border-slate-100">
        <h3 className="text-sm font-extrabold uppercase tracking-wider text-slate-800 mb-4 flex items-center gap-2">
          <CalendarCheck className="w-4 h-4 text-indigo-600" />My Booked Appointments
          <span className="text-xs font-bold bg-indigo-100 text-indigo-800 px-2 py-0.5 rounded-full">{appointments.length}</span>
        </h3>
        {appointments.length === 0 ? (
          <div className="py-10 text-center">
            <Calendar className="w-10 h-10 text-slate-300 mx-auto mb-3" />
            <p className="text-sm text-slate-400 font-semibold">No appointments booked yet.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
            {appointments.map((appt) => (
              <div key={appt.id} className="rounded-2xl border border-slate-200 p-4 hover:shadow-md transition-all">
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <p className="font-extrabold text-slate-900 text-sm">{appt.doctor_name}</p>
                    <p className="text-[11px] text-indigo-600 font-semibold">{appt.doctor_specialty}</p>
                  </div>
                  <span className={`text-[10px] font-black px-2.5 py-1 rounded-full shrink-0 ${appt.status === 'CONFIRMED' ? 'bg-emerald-100 text-emerald-800' : appt.status === 'CANCELLED' ? 'bg-rose-100 text-rose-800' : appt.status === 'COMPLETED' ? 'bg-blue-100 text-blue-800' : 'bg-amber-100 text-amber-800'}`}>{appt.status}</span>
                </div>
                <div className="space-y-1.5 text-[11px] text-slate-600 font-medium">
                  <div className="flex items-center gap-1.5"><UserCheck className="w-3.5 h-3.5 text-slate-400" /><span>{appt.patient_name}</span></div>
                  <div className="flex items-center gap-1.5"><Calendar className="w-3.5 h-3.5 text-slate-400" /><span>{appt.appointment_date}</span><Clock className="w-3.5 h-3.5 text-slate-400 ml-2" /><span>{appt.appointment_time}</span></div>
                  <div className="flex items-center gap-1.5"><MapPin className="w-3.5 h-3.5 text-slate-400" /><span className="truncate">{appt.doctor_address}</span></div>
                  {appt.risk_level && <div className="flex items-center gap-1.5"><Zap className="w-3.5 h-3.5 text-amber-400" /><span className="font-bold">{appt.risk_level} Risk Case</span></div>}
                </div>
                {!appt.synced && <p className="text-[10px] font-bold text-amber-600 mt-2 flex items-center gap-1"><RefreshCw className="w-3 h-3" /> Pending sync</p>}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ══ BOOKING MODAL ════════════════════════════════════════════════════ */}
      {modal.isOpen && (
        <div className="fixed inset-0 z-[9999] flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => !isBooking && setModal({ isOpen: false, doctor: null })} />
          <div className="relative bg-white w-full sm:max-w-lg rounded-t-3xl sm:rounded-3xl shadow-2xl overflow-hidden max-h-[92vh] flex flex-col">
            <div className="bg-gradient-to-r from-indigo-600 to-violet-600 px-6 py-5 text-white shrink-0">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-bold text-indigo-200 uppercase tracking-widest mb-0.5">Book Appointment</p>
                  <h3 className="font-black text-xl leading-tight">{modal.doctor?.name}</h3>
                  <p className="text-indigo-200 text-sm font-semibold">{modal.doctor?.specialty}</p>
                </div>
                {!bookingSuccess && <button onClick={() => setModal({ isOpen: false, doctor: null })} className="w-8 h-8 rounded-xl bg-white/20 hover:bg-white/30 flex items-center justify-center"><X className="w-4 h-4" /></button>}
              </div>
              <div className="flex items-center gap-1.5 mt-3 text-xs text-indigo-200 font-medium">
                <MapPin className="w-3.5 h-3.5" /><span className="line-clamp-1">{modal.doctor?.address}</span>
              </div>
            </div>

            {bookingSuccess ? (
              <div className="flex-1 flex flex-col items-center justify-center p-8 text-center gap-4">
                <div className="w-20 h-20 rounded-full bg-emerald-100 flex items-center justify-center"><CheckCircle2 className="w-10 h-10 text-emerald-600" /></div>
                <div>
                  <h4 className="text-xl font-black text-slate-900 mb-1">Appointment Confirmed!</h4>
                  <p className="text-sm text-slate-500 font-medium leading-relaxed">
                    <span className="font-bold text-slate-700">{patientName}</span> booked at <span className="font-bold text-slate-700">{modal.doctor?.name}</span><br />
                    <span className="font-bold text-indigo-700">{days.find(d => d.value === selectedDate)?.label}</span> at <span className="font-bold text-indigo-700">{selectedTime}</span>
                  </p>
                </div>
                <button onClick={() => setModal({ isOpen: false, doctor: null })} className="px-8 py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold rounded-2xl">Done</button>
              </div>
            ) : (
              <div className="flex-1 overflow-y-auto">
                <div className="p-6 space-y-5">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">Full Name *</label>
                      <input value={patientName} onChange={e => setPatientName(e.target.value)} placeholder="Patient name" className="w-full text-sm font-semibold px-3 py-2.5 rounded-xl border border-slate-300 focus:ring-2 focus:ring-indigo-500 outline-none" />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">Mobile Number</label>
                      <input value={patientPhone} onChange={e => setPatientPhone(e.target.value)} placeholder="10-digit number" className="w-full text-sm font-semibold px-3 py-2.5 rounded-xl border border-slate-300 focus:ring-2 focus:ring-indigo-500 outline-none" />
                    </div>
                  </div>
                  <div>
                    <p className="text-xs font-black uppercase tracking-wider text-slate-500 mb-2">Select Date</p>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      {days.map(day => (
                        <button key={day.value} onClick={() => setSelectedDate(day.value)} className={`py-2.5 px-2 rounded-xl text-xs font-bold text-center transition-all border ${selectedDate === day.value ? 'bg-indigo-600 text-white border-indigo-700 shadow-md' : 'bg-slate-50 text-slate-700 border-slate-200 hover:border-indigo-300 hover:bg-indigo-50'}`}>
                          {day.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  {selectedDate && (
                    <div>
                      <p className="text-xs font-black uppercase tracking-wider text-slate-500 mb-2">Select Time Slot</p>
                      {(['morning', 'afternoon', 'evening'] as const).map(period => (
                        <div key={period} className="mb-3">
                          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5 capitalize">{period}</p>
                          <div className="flex flex-wrap gap-2">
                            {TIME_SLOTS[period].map(slot => (
                              <button key={slot} onClick={() => setSelectedTime(slot)} className={`py-1.5 px-3 rounded-xl text-xs font-bold transition-all border ${selectedTime === slot ? 'bg-indigo-600 text-white border-indigo-700 shadow-sm' : 'bg-white text-slate-700 border-slate-200 hover:border-indigo-300 hover:bg-indigo-50'}`}>
                                {slot}
                              </button>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  <div>
                    <label className="block text-xs font-black uppercase tracking-wider text-slate-500 mb-2">Reason / Notes (optional)</label>
                    <textarea rows={2} value={notes} onChange={e => setNotes(e.target.value)} placeholder="e.g. High BP follow-up, diabetes screening..." className="w-full text-sm font-semibold px-3 py-2.5 rounded-xl border border-slate-300 focus:ring-2 focus:ring-indigo-500 outline-none resize-none" />
                  </div>
                  {lastAssessment && (
                    <div className="bg-indigo-50 rounded-xl p-3 border border-indigo-100">
                      <p className="text-[11px] font-bold text-indigo-700">⚡ Risk context attached: <span className="font-black">{lastAssessment.risk_level} RISK</span> {' — '}{(lastAssessment.likely_conditions || []).slice(0, 1).join(', ')}</p>
                    </div>
                  )}
                </div>
                <div className="sticky bottom-0 bg-white border-t border-slate-100 px-6 py-4 flex gap-3">
                  <button onClick={() => setModal({ isOpen: false, doctor: null })} className="flex-1 px-4 py-3.5 rounded-2xl border border-slate-300 font-bold text-slate-700 hover:bg-slate-50 text-sm flex items-center justify-center gap-2"><XCircle className="w-4 h-4" /> Cancel</button>
                  <button onClick={confirmBooking} disabled={!selectedDate || !selectedTime || !patientName.trim() || isBooking} className="flex-1 px-4 py-3.5 rounded-2xl bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 text-white font-extrabold text-sm shadow-lg shadow-indigo-300 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 active:scale-95 transition-all">
                    {isBooking ? <><Loader2 className="w-4 h-4 animate-spin" /> Booking…</> : <><CalendarCheck className="w-4 h-4" /> Confirm Booking</>}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
      <style>{`@keyframes leaflet-pulse { 0%, 100% { box-shadow: 0 0 0 0 rgba(16,185,129,0.5); } 50% { box-shadow: 0 0 0 8px rgba(16,185,129,0); } }`}</style>
    </div>
  );
};

export default TeleconsultBooking;
