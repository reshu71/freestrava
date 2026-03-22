import React, { useState, useEffect, useCallback } from 'react';
import { 
  onAuthStateChanged, 
  signInAnonymously,
  signOut, 
  User 
} from 'firebase/auth';
import { 
  doc, 
  getDoc, 
  setDoc, 
  updateDoc, 
  collection, 
  query, 
  where, 
  onSnapshot, 
  addDoc, 
  deleteDoc,
  getDocs,
  writeBatch
} from 'firebase/firestore';
import { auth, db } from './firebase';
import { UserProfile, Activity, TrainingPlan, CalendarEvent } from './types';
import Calendar from './components/Calendar';
import StravaConnect from './components/StravaConnect';
import AIChat from './components/AIChat';
import PerformanceDashboard from './components/PerformanceDashboard';
import { 
  LogOut, 
  MessageSquare, 
  Calendar as CalendarIcon, 
  Settings, 
  Activity as ActivityIcon, 
  Loader2,
  BarChart3,
  Clock,
  ChevronRight,
  Plus,
  AlertCircle,
  CheckCircle2,
  Sparkles
} from 'lucide-react';
import axios from 'axios';
import { format } from 'date-fns';
import { MOCK_USER, MOCK_ACTIVITIES, MOCK_PLAN, MOCK_EVENTS } from './mockData';

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [plans, setPlans] = useState<TrainingPlan[]>([]);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'chat' | 'calendar' | 'settings' | 'dashboard'>('chat');
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [stravaConfig, setStravaConfig] = useState<{ isConfigured: boolean; missing: string[] } | null>(null);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isDemoMode, setIsDemoMode] = useState(() => {
    return localStorage.getItem('veloce_demo_mode') === 'true';
  });

  useEffect(() => {
    localStorage.setItem('veloce_demo_mode', isDemoMode.toString());
  }, [isDemoMode]);

  // Auth State
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (isDemoMode) {
        setUser({ uid: MOCK_USER.uid } as User);
        setProfile(MOCK_USER);
        setLoading(false);
        return;
      }
      setUser(currentUser);
      if (currentUser) {
        const userDoc = await getDoc(doc(db, 'users', currentUser.uid));
        if (userDoc.exists()) {
          setProfile(userDoc.data() as UserProfile);
        } else {
          const newProfile: UserProfile = {
            uid: currentUser.uid,
            displayName: currentUser.displayName,
            email: currentUser.email,
            fitnessLevel: 'beginner',
            goals: ''
          };
          await setDoc(doc(db, 'users', currentUser.uid), newProfile);
          setProfile(newProfile);
        }
      } else {
        setProfile(null);
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, [isDemoMode]);

  // Firestore Listeners
  useEffect(() => {
    if (isDemoMode) {
      setActivities(MOCK_ACTIVITIES);
      setPlans([MOCK_PLAN]);
      setEvents(MOCK_EVENTS);
      return;
    }
    if (!user) return;

    const qActivities = query(collection(db, 'activities'), where('userId', '==', user.uid));
    const unsubscribeActivities = onSnapshot(qActivities, (snapshot) => {
      setActivities(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Activity)));
    });

    const qPlans = query(collection(db, 'plans'), where('userId', '==', user.uid));
    const unsubscribePlans = onSnapshot(qPlans, (snapshot) => {
      setPlans(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as TrainingPlan)));
    });

    const qEvents = query(collection(db, 'events'), where('userId', '==', user.uid));
    const unsubscribeEvents = onSnapshot(qEvents, (snapshot) => {
      setEvents(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as CalendarEvent)));
    });

    return () => {
      unsubscribeActivities();
      unsubscribePlans();
      unsubscribeEvents();
    };
  }, [user, isDemoMode]);

  const loginWithStrava = async () => {
    const width = 600, height = 700;
    const left = window.screenX + (window.outerWidth - width) / 2;
    const top = window.screenY + (window.outerHeight - height) / 2;
    const popup = window.open(
      'about:blank',
      'strava_oauth',
      `width=${width},height=${height},left=${left},top=${top}`
    );
    if (!popup) {
      alert("Popup blocked — please allow popups for this site.");
      return;
    }
    try {
      const response = await fetch('/api/auth/strava/url');
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to get auth URL');
      popup.location.href = data.url;
    } catch (err: any) {
      popup.close();
      alert(err.message || "Failed to start Strava connection.");
    }
  };

  useEffect(() => {
    const handleMessage = async (event: MessageEvent) => {
      // Only accept messages from our own origin — security check
      if (event.origin !== window.location.origin) return;
      if (event.data?.type !== 'STRAVA_AUTH_COMPLETE') return;

      try {
        // Fetch tokens from the server session (stored during OAuth callback)
        const res = await fetch('/api/auth/strava/session');
        if (!res.ok) throw new Error('Session not found — please try connecting again.');
        const { access_token, refresh_token, expires_at, athleteId } = await res.json();

        await signInAnonymously(auth);

        setTimeout(async () => {
          if (auth.currentUser) {
            const updatedProfile: UserProfile = {
              uid: auth.currentUser.uid,
              displayName: `Athlete ${athleteId}`,
              email: `athlete_${athleteId}@strava.local`,
              stravaAccessToken: access_token,
              stravaRefreshToken: refresh_token,
              stravaTokenExpiresAt: expires_at,
              stravaAthleteId: athleteId.toString(),
              fitnessLevel: 'beginner',
              goals: ''
            };
            await setDoc(doc(db, 'users', auth.currentUser.uid), updatedProfile, { merge: true });
            setProfile(updatedProfile);
            syncStravaActivities(updatedProfile);
          }
        }, 800);
      } catch (err: any) {
        console.error("[Strava] Post-auth error:", err);
        alert(err.message || "Authentication failed after Strava redirect.");
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  const logout = () => signOut(auth);

  const handleStravaConnect = async (data: any) => {
    if (!user) return;
    const updatedProfile = {
      ...profile!,
      stravaAccessToken: data.access_token,
      stravaRefreshToken: data.refresh_token,
      stravaTokenExpiresAt: data.expires_at,
      stravaAthleteId: data.athleteId.toString()
    };
    await updateDoc(doc(db, 'users', user.uid), updatedProfile);
    setProfile(updatedProfile);
    syncStravaActivities(updatedProfile);
  };

  const refreshStravaToken = async (currentProfile: UserProfile) => {
    if (!currentProfile.stravaRefreshToken) return null;
    try {
      const response = await axios.post('/api/auth/strava/refresh', {
        refresh_token: currentProfile.stravaRefreshToken
      });
      const data = response.data;
      const updatedProfile = {
        ...currentProfile,
        stravaAccessToken: data.access_token,
        stravaRefreshToken: data.refresh_token,
        stravaTokenExpiresAt: data.expires_at
      };
      if (user) {
        await updateDoc(doc(db, 'users', user.uid), updatedProfile);
        setProfile(updatedProfile);
      }
      return updatedProfile;
    } catch (error) {
      console.error("Token refresh failed:", error);
      return null;
    }
  };

  useEffect(() => {
    const checkConfig = async () => {
      try {
        const response = await axios.get('/api/auth/strava/config');
        setStravaConfig(response.data);
      } catch (err) {
        console.error("Failed to check Strava config:", err);
      }
    };
    checkConfig();
  }, []);

  const syncStravaActivities = async (currentProfile: UserProfile, retryCount = 0) => {
    if (!currentProfile.stravaAccessToken) return;
    if (retryCount > 1) {
      setSyncError("Strava authentication failed repeatedly. Please reconnect your account in Settings.");
      setIsSyncing(false);
      return;
    }
    
    setIsSyncing(true);
    setSyncError(null);
    
    let activeProfile = currentProfile;
    const now = Math.floor(Date.now() / 1000);
    
    // Check if token is expired (with 5 min buffer) or if we have a refresh token but no expiry
    const shouldRefresh = activeProfile.stravaRefreshToken && (
      !activeProfile.stravaTokenExpiresAt || 
      activeProfile.stravaTokenExpiresAt < now + 300
    );

    if (shouldRefresh) {
      const refreshed = await refreshStravaToken(activeProfile);
      if (refreshed) {
        activeProfile = refreshed;
      } else if (activeProfile.stravaTokenExpiresAt && activeProfile.stravaTokenExpiresAt < now + 300) {
        // Only block if we KNOW it's expired and refresh failed
        setSyncError("Failed to refresh Strava token. Your session may have expired. Please reconnect in Settings.");
        setIsSyncing(false);
        return;
      }
    }

    try {
      // Fetch Athlete if ID is missing
      let athleteId = activeProfile.stravaAthleteId;
      if (!athleteId) {
        try {
          const athleteResponse = await axios.get('https://www.strava.com/api/v3/athlete', {
            headers: { Authorization: `Bearer ${activeProfile.stravaAccessToken}` }
          });
          athleteId = athleteResponse.data.id.toString();
          await updateDoc(doc(db, 'users', activeProfile.uid), { stravaAthleteId: athleteId });
          activeProfile = { ...activeProfile, stravaAthleteId: athleteId };
          setProfile(activeProfile);
        } catch (err) {
          console.error("Failed to fetch athlete profile:", err);
          // Continue anyway, maybe activities will work
        }
      }

      // Fetch Activities
      const activitiesResponse = await axios.get('https://www.strava.com/api/v3/athlete/activities', {
        headers: { Authorization: `Bearer ${activeProfile.stravaAccessToken}` }
      });

      // Fetch Athlete Stats if ID is available
      let athleteStats = null;
      if (athleteId) {
        try {
          const statsResponse = await axios.get(`https://www.strava.com/api/v3/athletes/${athleteId}/stats`, {
            headers: { Authorization: `Bearer ${activeProfile.stravaAccessToken}` }
          });
          athleteStats = statsResponse.data;
        } catch (err) {
          console.error("Failed to fetch athlete stats:", err);
        }
      }

      const stravaActivities = activitiesResponse.data;

      const batch = writeBatch(db);

      // Update Profile with Stats
      if (athleteStats) {
        const updatedProfile = {
          ...activeProfile,
          personalRecords: athleteStats
        };
        batch.update(doc(db, 'users', activeProfile.uid), { personalRecords: athleteStats });
        setProfile(updatedProfile);
      }

      // Update Activities
      for (const sa of stravaActivities) {
        const activityId = `strava_${sa.id}`;
        const activityRef = doc(db, 'activities', activityId);
        const activityData: Activity = {
          stravaId: sa.id.toString(),
          userId: activeProfile.uid,
          name: sa.name,
          type: sa.type,
          distance: sa.distance,
          movingTime: sa.moving_time,
          startDate: sa.start_date,
          averageHeartrate: sa.average_heartrate,
          maxHeartrate: sa.max_heartrate
        };
        batch.set(activityRef, activityData, { merge: true });
      }
      await batch.commit();
    } catch (error: any) {
      console.error("Strava sync error:", error);
      
      // Handle 401 Unauthorized
      if (error.response?.status === 401) {
        if (activeProfile.stravaRefreshToken) {
          const refreshed = await refreshStravaToken(activeProfile);
          if (refreshed) {
            // Retry sync once with new token
            syncStravaActivities(refreshed, retryCount + 1);
            return;
          }
        }
        setSyncError("Strava session expired. Please go to Settings and reconnect your account.");
      } else {
        setSyncError(error.response?.data?.message || error.message || "An error occurred during Strava sync.");
      }
    } finally {
      setIsSyncing(false);
    }
  };

  const handlePlanGenerated = async (newPlan: TrainingPlan, newEvents: CalendarEvent[]) => {
    if (isDemoMode) {
      setPlans(prev => [newPlan, ...prev]);
      setEvents(prev => [...newEvents, ...prev]);
      setActiveTab('calendar');
      return;
    }
    if (!user) return;
    
    // Archive old plans
    const batch = writeBatch(db);
    plans.filter(p => p.status === 'active').forEach(p => {
      batch.update(doc(db, 'plans', p.id!), { status: 'archived' });
    });

    // Create new plan
    const planRef = doc(collection(db, 'plans'));
    batch.set(planRef, newPlan);

    // Create events
    newEvents.forEach(e => {
      const eventRef = doc(collection(db, 'events'));
      batch.set(eventRef, { ...e, planId: planRef.id });
    });

    await batch.commit();
    setActiveTab('calendar');
  };

  const toggleEventCompletion = async (event: CalendarEvent) => {
    if (!event.id) return;
    await updateDoc(doc(db, 'events', event.id), { completed: !event.completed });
  };

  const updateExecution = async (eventId: string, score: 'green' | 'yellow' | 'red', notes: string) => {
    await updateDoc(doc(db, 'events', eventId), { 
      executionScore: score, 
      executionNotes: notes,
      completed: true 
    });
  };

  const addEvent = async (event: Omit<CalendarEvent, 'id' | 'userId'>) => {
    if (!user) return;
    await addDoc(collection(db, 'events'), {
      ...event,
      userId: user.uid
    });
  };

  const deleteAccount = async () => {
    if (!user || !window.confirm("Are you absolutely sure? This will delete all your training data and profile forever.")) return;
    
    try {
      const batch = writeBatch(db);
      
      // Delete activities
      const activitiesSnap = await getDocs(query(collection(db, 'activities'), where('userId', '==', user.uid)));
      activitiesSnap.forEach(d => batch.delete(d.ref));
      
      // Delete plans
      const plansSnap = await getDocs(query(collection(db, 'plans'), where('userId', '==', user.uid)));
      plansSnap.forEach(d => batch.delete(d.ref));
      
      // Delete events
      const eventsSnap = await getDocs(query(collection(db, 'events'), where('userId', '==', user.uid)));
      eventsSnap.forEach(d => batch.delete(d.ref));
      
      // Delete user profile
      batch.delete(doc(db, 'users', user.uid));
      
      await batch.commit();
      await user.delete();
      window.location.reload();
    } catch (error) {
      console.error("Delete account error:", error);
      alert("Failed to delete account. You might need to re-authenticate.");
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#121212]">
        <Loader2 className="w-8 h-8 text-[#FC4C02] animate-spin" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#121212] p-6">
        <div className="max-w-md w-full bg-[#1F1F1F] rounded-[2.5rem] shadow-2xl p-10 border border-white/5 text-center animate-kaizen">
          <div className="w-24 h-24 bg-[#FC4C02] rounded-3xl flex items-center justify-center mx-auto mb-8 shadow-2xl shadow-orange-500/20 rotate-3">
            <ActivityIcon className="w-12 h-12 text-white -rotate-3" />
          </div>
          <h1 className="text-4xl font-black text-white mb-3 tracking-tighter">VELOCE AI</h1>
          <p className="text-zinc-400 mb-10 text-lg leading-relaxed font-medium">Your high-performance athletic journey starts here. Sync with Strava, get personalized plans, and conquer your goals with Kaizen precision.</p>
          <button
            onClick={loginWithStrava}
            className="strava-btn-primary w-full text-lg py-5"
          >
            <ActivityIcon className="w-6 h-6" />
            Connect with Strava
          </button>
          <p className="mt-6 text-xs text-zinc-600 uppercase tracking-widest font-bold">
            Powered by Strava & Gemini 1.5
          </p>
        </div>
      </div>
    );
  }

  const currentActivePlan = plans.find(p => p.status === 'active') || null;

  return (
    <div className="min-h-screen bg-[#121212] flex text-white">
      {/* Sidebar */}
      <aside className={`${isSidebarCollapsed ? 'w-20' : 'w-72'} bg-[#1F1F1F] border-r border-white/5 flex flex-col fixed h-full transition-all duration-300 z-40 group shadow-2xl shadow-black`}>
        <div className={`p-8 flex items-center ${isSidebarCollapsed ? 'justify-center' : 'gap-4'}`}>
          <div className="w-12 h-12 bg-[#FC4C02] rounded-2xl flex items-center justify-center shadow-2xl shadow-orange-500/20 flex-shrink-0">
            <ActivityIcon className="w-7 h-7 text-white" />
          </div>
          {!isSidebarCollapsed && <span className="text-2xl font-black tracking-tighter text-white">VELOCE</span>}
        </div>

        <nav className="flex-1 px-4 space-y-3 mt-6">
          <button
            onClick={() => setActiveTab('chat')}
            title="AI Coach"
            className={`w-full flex items-center ${isSidebarCollapsed ? 'justify-center' : 'gap-4 px-5'} py-4 rounded-2xl font-bold transition-all duration-300 ${
              activeTab === 'chat' ? 'bg-[#FC4C02] text-white shadow-lg shadow-orange-500/20 scale-[1.02]' : 'text-zinc-500 hover:bg-white/5 hover:text-white'
            }`}
          >
            <MessageSquare className="w-6 h-6 flex-shrink-0" />
            {!isSidebarCollapsed && <span className="truncate tracking-tight">AI Coach</span>}
          </button>
          <button
            onClick={() => setActiveTab('calendar')}
            title="Training Plan"
            className={`w-full flex items-center ${isSidebarCollapsed ? 'justify-center' : 'gap-4 px-5'} py-4 rounded-2xl font-bold transition-all duration-300 ${
              activeTab === 'calendar' ? 'bg-[#FC4C02] text-white shadow-lg shadow-orange-500/20 scale-[1.02]' : 'text-zinc-500 hover:bg-white/5 hover:text-white'
            }`}
          >
            <CalendarIcon className="w-6 h-6 flex-shrink-0" />
            {!isSidebarCollapsed && <span className="truncate tracking-tight">Training Plan</span>}
          </button>
          <button
            onClick={() => setActiveTab('dashboard')}
            title="Performance"
            className={`w-full flex items-center ${isSidebarCollapsed ? 'justify-center' : 'gap-4 px-5'} py-4 rounded-2xl font-bold transition-all duration-300 ${
              activeTab === 'dashboard' ? 'bg-[#FC4C02] text-white shadow-lg shadow-orange-500/20 scale-[1.02]' : 'text-zinc-500 hover:bg-white/5 hover:text-white'
            }`}
          >
            <BarChart3 className="w-6 h-6 flex-shrink-0" />
            {!isSidebarCollapsed && <span className="truncate tracking-tight">Performance</span>}
          </button>
          <button
            onClick={() => setActiveTab('settings')}
            title="Settings"
            className={`w-full flex items-center ${isSidebarCollapsed ? 'justify-center' : 'gap-4 px-5'} py-4 rounded-2xl font-bold transition-all duration-300 ${
              activeTab === 'settings' ? 'bg-[#FC4C02] text-white shadow-lg shadow-orange-500/20 scale-[1.02]' : 'text-zinc-500 hover:bg-white/5 hover:text-white'
            }`}
          >
            <Settings className="w-6 h-6 flex-shrink-0" />
            {!isSidebarCollapsed && <span className="truncate tracking-tight">Settings</span>}
          </button>
        </nav>

        <div className="p-4 border-t border-zinc-100">
          <div className={`flex items-center ${isSidebarCollapsed ? 'justify-center' : 'gap-3 px-4'} py-3`}>
            <img src={user.photoURL || ''} className="w-10 h-10 rounded-full border border-zinc-200 flex-shrink-0" alt="Profile" />
            {!isSidebarCollapsed && (
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-zinc-900 truncate">{user.displayName}</p>
                <p className="text-xs text-zinc-500 truncate">{user.email}</p>
              </div>
            )}
            {!isSidebarCollapsed && (
              <button onClick={logout} className="p-2 text-zinc-400 hover:text-rose-500 transition-colors">
                <LogOut className="w-5 h-5" />
              </button>
            )}
          </div>
          {isSidebarCollapsed && (
            <button onClick={logout} className="w-full flex justify-center p-2 text-zinc-400 hover:text-rose-500 transition-colors">
              <LogOut className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* Collapse Toggle Button */}
        <button 
          onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
          className="absolute -right-3 top-20 w-6 h-6 bg-white border border-zinc-200 rounded-full flex items-center justify-center shadow-sm hover:bg-zinc-50 transition-all"
        >
          <ChevronRight className={`w-4 h-4 text-zinc-400 transition-transform duration-300 ${isSidebarCollapsed ? '' : 'rotate-180'}`} />
        </button>
      </aside>

      {/* Main Content */}
      <main className={`flex-1 ${isSidebarCollapsed ? 'ml-20' : 'ml-72'} p-10 transition-all duration-300`}>
        <div className="max-w-6xl mx-auto animate-kaizen">
          {activeTab === 'chat' && (
            <div className="space-y-10">
              <header className="flex items-end justify-between">
                <div className="flex items-end gap-6">
                  <div>
                    <h1 className="text-4xl font-black tracking-tighter text-white">COACH COMMAND</h1>
                    <p className="text-zinc-500 font-medium">Kaizen protocol active. Optimizing performance.</p>
                  </div>
                  {activities.length > 0 && (
                    <div className="mb-1 flex items-center gap-2 px-4 py-1.5 bg-[#FC4C02]/10 text-[#FC4C02] rounded-full text-xs font-bold border border-[#FC4C02]/20 shadow-lg shadow-orange-500/5">
                      <div className="w-2 h-2 bg-[#FC4C02] rounded-full animate-pulse" />
                      LIVE DATA ACTIVE
                    </div>
                  )}
                </div>
                <button 
                  onClick={() => profile && syncStravaActivities(profile)}
                  disabled={isSyncing}
                  className="flex items-center gap-2 text-sm font-bold text-emerald-600 hover:text-emerald-700 transition-colors"
                >
                  <Clock className={`w-4 h-4 ${isSyncing ? 'animate-spin' : ''}`} />
                  {isSyncing ? 'Syncing...' : 'Sync Strava'}
                </button>
              </header>
              {syncError && (
                <div className="bg-rose-50 border border-rose-100 text-rose-600 p-4 rounded-2xl text-sm font-medium flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <span>{syncError}</span>
                    <button onClick={() => setSyncError(null)} className="hover:text-rose-800 font-bold">Dismiss</button>
                  </div>
                  {syncError.includes("reconnect") && (
                    <button 
                      onClick={() => setActiveTab('settings')}
                      className="text-xs font-bold underline text-left hover:text-rose-700"
                    >
                      Go to Settings
                    </button>
                  )}
                </div>
              )}
              <AIChat 
                userProfile={profile} 
                activities={activities} 
                currentPlan={currentActivePlan}
                onPlanGenerated={handlePlanGenerated}
                isDemoMode={isDemoMode}
              />
            </div>
          )}

          {activeTab === 'calendar' && (
            <div className="space-y-10">
              <header className="flex items-center justify-between">
                <div>
                  <h1 className="text-4xl font-black tracking-tighter text-white">TRAINING OPS</h1>
                  <p className="text-zinc-500 font-medium">Protocol execution and historical load tracking.</p>
                </div>
              </header>
              <Calendar 
                events={events} 
                onSelectEvent={toggleEventCompletion}
                onUpdateExecution={updateExecution}
                onAddEvent={addEvent}
                onViewChange={(view) => setIsSidebarCollapsed(view === 'month')}
                isDemoMode={isDemoMode}
              />
            </div>
          )}

          {activeTab === 'dashboard' && (
            <div className="space-y-10">
              <header>
                <h1 className="text-4xl font-black tracking-tighter text-white">PERFORMANCE HUBS</h1>
                <p className="text-zinc-500 font-medium">Data-driven insights from your Kaizen journey.</p>
              </header>
              <PerformanceDashboard userProfile={profile} activities={activities} />
            </div>
          )}

          {activeTab === 'settings' && (
            <div className="max-w-3xl mx-auto space-y-10">
              <header>
                <h1 className="text-4xl font-black tracking-tighter text-white">SETTING</h1>
                <p className="text-zinc-500 font-medium">Manage your profile and protocol metrics.</p>
              </header>

              {stravaConfig && !stravaConfig.isConfigured && (
                <div className="bg-amber-500/10 border border-amber-500/20 p-8 rounded-[2rem] space-y-4">
                  <div className="flex items-center gap-3 text-amber-500 font-bold">
                    <AlertCircle className="w-6 h-6" />
                    SYSTEM CONFIGURATION INCOMPLETE
                  </div>
                  <p className="text-sm text-amber-500/80">
                    The following environment variables are missing in AI Studio: 
                    <span className="font-mono font-bold ml-1">{stravaConfig.missing.join(', ')}</span>.
                  </p>
                </div>
              )}

              <div className="bg-[#1F1F1F] rounded-[2rem] border border-white/5 shadow-2xl overflow-hidden divide-y divide-white/5">
                <div className="p-10">
                  <h3 className="text-xl font-black tracking-tight text-white mb-8">PROFILE PROTOCOL</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <div>
                      <label className="block text-xs font-black text-zinc-500 uppercase tracking-widest mb-3">Fitness Level</label>
                      <select 
                        value={profile?.fitnessLevel}
                        onChange={async (e) => {
                          const val = e.target.value as any;
                          await updateDoc(doc(db, 'users', user.uid), { fitnessLevel: val });
                          setProfile({ ...profile!, fitnessLevel: val });
                        }}
                        className="w-full bg-[#121212] border border-white/10 rounded-xl px-5 py-4 focus:ring-2 focus:ring-[#FC4C02] outline-none transition-all text-white font-bold"
                      >
                        <option value="beginner">Beginner</option>
                        <option value="intermediate">Intermediate</option>
                        <option value="advanced">Advanced</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-black text-zinc-500 uppercase tracking-widest mb-3">Athlete PRs</label>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="bg-[#121212] p-3 rounded-xl border border-white/5">
                          <p className="text-[10px] text-zinc-500 font-bold uppercase">Runs</p>
                          <p className="text-lg font-black text-white">{profile?.personalRecords?.all_run_totals?.count || 0}</p>
                        </div>
                        <div className="bg-[#121212] p-3 rounded-xl border border-white/5">
                          <p className="text-[10px] text-zinc-500 font-bold uppercase">Rides</p>
                          <p className="text-lg font-black text-white">{(profile?.personalRecords?.biggest_ride_distance || 0 / 1000).toFixed(0)}km</p>
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="mt-8">
                    <label className="block text-xs font-black text-zinc-500 uppercase tracking-widest mb-3">Core Training Goals</label>
                    <textarea 
                      value={profile?.goals}
                      onChange={async (e) => {
                        const val = e.target.value;
                        setProfile({ ...profile!, goals: val });
                      }}
                      onBlur={async (e) => {
                        await updateDoc(doc(db, 'users', user.uid), { goals: e.target.value });
                      }}
                      placeholder="e.g. Sub-4 marathon, ironman foundation..."
                      className="w-full bg-[#121212] border border-white/10 rounded-xl px-5 py-4 focus:ring-2 focus:ring-[#FC4C02] outline-none transition-all h-32 resize-none text-white font-medium"
                    />
                  </div>
                </div>

                <div className="p-10">
                  <h3 className="text-xl font-black tracking-tight text-white mb-8">INTEGRATIONS</h3>
                  <StravaConnect 
                    userProfile={profile} 
                    onConnect={handleStravaConnect} 
                    hasData={activities.length > 0} 
                  />
                </div>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Demo Mode Toggle */}
      <button
        onClick={() => setIsDemoMode(!isDemoMode)}
        className={`fixed bottom-10 right-10 z-50 flex items-center gap-3 px-8 py-5 rounded-2xl font-black shadow-2xl transition-all duration-300 ${
          isDemoMode 
            ? 'bg-[#D21C38] text-white hover:bg-[#B0172E] scale-105' 
            : 'bg-[#FC4C02] text-white hover:bg-[#E34402] hover:scale-105'
        } shadow-black`}
      >
        <Sparkles className={`w-6 h-6 ${isDemoMode ? 'animate-pulse' : ''}`} />
        <span className="tracking-tighter text-lg">{isDemoMode ? 'DEACTIVATE DEMO' : 'ACTIVATE DEMO'}</span>
      </button>
    </div>
  );
}
