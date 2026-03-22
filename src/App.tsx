import React, { useState, useEffect, useCallback } from 'react';
import { 
  onAuthStateChanged, 
  signInWithPopup, 
  GoogleAuthProvider, 
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
  CheckCircle2
} from 'lucide-react';
import axios from 'axios';
import { format } from 'date-fns';

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

  // Auth State
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
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
  }, []);

  // Firestore Listeners
  useEffect(() => {
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
  }, [user]);

  const login = async () => {
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
    } catch (error) {
      console.error("Login error:", error);
    }
  };

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
      <div className="min-h-screen flex items-center justify-center bg-zinc-50">
        <Loader2 className="w-8 h-8 text-emerald-500 animate-spin" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-zinc-50 p-6">
        <div className="max-w-md w-full bg-white rounded-3xl shadow-xl p-8 border border-zinc-100 text-center">
          <div className="w-20 h-20 bg-emerald-500 rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-lg shadow-emerald-200">
            <ActivityIcon className="w-10 h-10 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-zinc-900 mb-2">Veloce AI</h1>
          <p className="text-zinc-500 mb-8">Your AI-powered athletic journey starts here. Sync with Strava, get personalized plans, and conquer your goals.</p>
          <button
            onClick={login}
            className="w-full bg-zinc-900 hover:bg-zinc-800 text-white font-bold py-4 rounded-2xl transition-all shadow-lg flex items-center justify-center gap-3"
          >
            <img src="https://www.google.com/favicon.ico" className="w-5 h-5" alt="Google" />
            Continue with Google
          </button>
        </div>
      </div>
    );
  }

  const currentActivePlan = plans.find(p => p.status === 'active') || null;

  return (
    <div className="min-h-screen bg-zinc-50 flex">
      {/* Sidebar */}
      <aside className={`${isSidebarCollapsed ? 'w-20' : 'w-64'} bg-white border-r border-zinc-200 flex flex-col fixed h-full transition-all duration-300 z-40 group`}>
        <div className={`p-6 flex items-center ${isSidebarCollapsed ? 'justify-center' : 'gap-3'}`}>
          <div className="w-10 h-10 bg-emerald-500 rounded-xl flex items-center justify-center shadow-lg shadow-emerald-200 flex-shrink-0">
            <ActivityIcon className="w-6 h-6 text-white" />
          </div>
          {!isSidebarCollapsed && <span className="text-xl font-bold text-zinc-900 truncate">Veloce AI</span>}
        </div>

        <nav className="flex-1 px-4 space-y-2 mt-4">
          <button
            onClick={() => setActiveTab('chat')}
            title="AI Coach"
            className={`w-full flex items-center ${isSidebarCollapsed ? 'justify-center' : 'gap-3 px-4'} py-3 rounded-xl font-medium transition-all ${
              activeTab === 'chat' ? 'bg-emerald-50 text-emerald-600' : 'text-zinc-500 hover:bg-zinc-50'
            }`}
          >
            <MessageSquare className="w-5 h-5 flex-shrink-0" />
            {!isSidebarCollapsed && <span className="truncate">AI Coach</span>}
          </button>
          <button
            onClick={() => setActiveTab('calendar')}
            title="Training Plan"
            className={`w-full flex items-center ${isSidebarCollapsed ? 'justify-center' : 'gap-3 px-4'} py-3 rounded-xl font-medium transition-all ${
              activeTab === 'calendar' ? 'bg-emerald-50 text-emerald-600' : 'text-zinc-500 hover:bg-zinc-50'
            }`}
          >
            <CalendarIcon className="w-5 h-5 flex-shrink-0" />
            {!isSidebarCollapsed && <span className="truncate">Training Plan</span>}
          </button>
          <button
            onClick={() => setActiveTab('dashboard')}
            title="Performance"
            className={`w-full flex items-center ${isSidebarCollapsed ? 'justify-center' : 'gap-3 px-4'} py-3 rounded-xl font-medium transition-all ${
              activeTab === 'dashboard' ? 'bg-emerald-50 text-emerald-600' : 'text-zinc-500 hover:bg-zinc-50'
            }`}
          >
            <BarChart3 className="w-5 h-5 flex-shrink-0" />
            {!isSidebarCollapsed && <span className="truncate">Performance</span>}
          </button>
          <button
            onClick={() => setActiveTab('settings')}
            title="Settings"
            className={`w-full flex items-center ${isSidebarCollapsed ? 'justify-center' : 'gap-3 px-4'} py-3 rounded-xl font-medium transition-all ${
              activeTab === 'settings' ? 'bg-emerald-50 text-emerald-600' : 'text-zinc-500 hover:bg-zinc-50'
            }`}
          >
            <Settings className="w-5 h-5 flex-shrink-0" />
            {!isSidebarCollapsed && <span className="truncate">Settings</span>}
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
      <main className={`flex-1 ${isSidebarCollapsed ? 'ml-20' : 'ml-64'} p-8 transition-all duration-300`}>
        <div className="max-w-6xl mx-auto">
          {activeTab === 'chat' && (
            <div className="space-y-8">
              <header className="flex items-end justify-between">
                <div className="flex items-end gap-4">
                  <div>
                    <h1 className="text-3xl font-bold text-zinc-900">AI Coach</h1>
                    <p className="text-zinc-500">Your personal endurance training partner.</p>
                  </div>
                  {activities.length > 0 && (
                    <div className="mb-1 flex items-center gap-1.5 px-3 py-1 bg-emerald-50 text-emerald-600 rounded-full text-[10px] font-bold border border-emerald-100 shadow-sm">
                      <CheckCircle2 className="w-3 h-3" />
                      Connected
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
              />
            </div>
          )}

          {activeTab === 'calendar' && (
            <div className="space-y-8">
              <header className="flex items-center justify-between">
                <div>
                  <h1 className="text-3xl font-bold text-zinc-900">Training Calendar</h1>
                  <p className="text-zinc-500">Track your execution and follow your plan.</p>
                </div>
              </header>
              <Calendar 
                events={events} 
                onSelectEvent={toggleEventCompletion}
                onUpdateExecution={updateExecution}
                onAddEvent={addEvent}
                onViewChange={(view) => setIsSidebarCollapsed(view === 'month')}
              />
            </div>
          )}

          {activeTab === 'dashboard' && (
            <div className="space-y-8">
              <header>
                <h1 className="text-3xl font-bold text-zinc-900">Performance Dashboard</h1>
                <p className="text-zinc-500">Data-driven insights from your training history.</p>
              </header>
              <PerformanceDashboard userProfile={profile} activities={activities} />
            </div>
          )}

          {activeTab === 'settings' && (
            <div className="max-w-3xl mx-auto space-y-8">
              <header>
                <h1 className="text-3xl font-bold text-zinc-900">Settings</h1>
                <p className="text-zinc-500">Manage your profile and preferences.</p>
              </header>

              {stravaConfig && !stravaConfig.isConfigured && (
                <div className="bg-amber-50 border border-amber-100 p-6 rounded-3xl space-y-3">
                  <div className="flex items-center gap-3 text-amber-800 font-bold">
                    <AlertCircle className="w-5 h-5" />
                    Strava Integration Not Fully Configured
                  </div>
                  <p className="text-sm text-amber-700">
                    The following environment variables are missing in AI Studio: 
                    <span className="font-mono font-bold ml-1">{stravaConfig.missing.join(', ')}</span>.
                  </p>
                  <p className="text-xs text-amber-600">
                    Please add these to the Secrets panel in AI Studio and restart the dev server.
                  </p>
                </div>
              )}

              <div className="bg-white rounded-3xl border border-zinc-100 shadow-sm divide-y divide-zinc-100">
                <div className="p-8">
                  <h3 className="text-lg font-bold text-zinc-900 mb-6">Profile Information</h3>
                  <div className="space-y-6">
                    <div>
                      <label className="block text-sm font-bold text-zinc-700 mb-2">Fitness Level</label>
                      <select 
                        value={profile?.fitnessLevel}
                        onChange={async (e) => {
                          const val = e.target.value as any;
                          await updateDoc(doc(db, 'users', user.uid), { fitnessLevel: val });
                          setProfile({ ...profile!, fitnessLevel: val });
                        }}
                        className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-3 focus:ring-2 focus:ring-emerald-500 outline-none transition-all"
                      >
                        <option value="beginner">Beginner</option>
                        <option value="intermediate">Intermediate</option>
                        <option value="advanced">Advanced</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-bold text-zinc-700 mb-2">Training Goals</label>
                      <textarea 
                        value={profile?.goals}
                        onChange={async (e) => {
                          const val = e.target.value;
                          setProfile({ ...profile!, goals: val });
                        }}
                        onBlur={async (e) => {
                          await updateDoc(doc(db, 'users', user.uid), { goals: e.target.value });
                        }}
                        placeholder="e.g. Run a sub-4 hour marathon, improve cycling power..."
                        className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-3 focus:ring-2 focus:ring-emerald-500 outline-none transition-all h-32 resize-none"
                      />
                    </div>
                  </div>
                </div>

                <div className="p-8">
                  <h3 className="text-lg font-bold text-zinc-900 mb-6">Integrations</h3>
                  <StravaConnect 
                    userProfile={profile} 
                    onConnect={handleStravaConnect} 
                    hasData={activities.length > 0} 
                  />
                  
                  <div className="mt-8 pt-8 border-t border-zinc-100">
                    <h4 className="text-sm font-bold text-zinc-900 mb-4">Manual Token Entry (Advanced)</h4>
                    <div className="space-y-4">
                      <div>
                        <label className="block text-xs font-bold text-zinc-500 mb-1">Access Token</label>
                        <input 
                          type="text"
                          placeholder="Paste access token..."
                          className="w-full bg-zinc-50 border border-zinc-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-emerald-500"
                          onBlur={async (e) => {
                            if (!e.target.value) return;
                            const updatedProfile = { ...profile!, stravaAccessToken: e.target.value };
                            await updateDoc(doc(db, 'users', user.uid), { stravaAccessToken: e.target.value });
                            setProfile(updatedProfile);
                          }}
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-zinc-500 mb-1">Refresh Token</label>
                        <input 
                          type="text"
                          placeholder="Paste refresh token..."
                          className="w-full bg-zinc-50 border border-zinc-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-emerald-500"
                          onBlur={async (e) => {
                            if (!e.target.value) return;
                            const updatedProfile = { ...profile!, stravaRefreshToken: e.target.value };
                            await updateDoc(doc(db, 'users', user.uid), { stravaRefreshToken: e.target.value });
                            setProfile(updatedProfile);
                          }}
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-zinc-500 mb-1">Athlete ID (Optional)</label>
                        <input 
                          type="text"
                          placeholder="Paste athlete ID..."
                          className="w-full bg-zinc-50 border border-zinc-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-emerald-500"
                          onBlur={async (e) => {
                            if (!e.target.value) return;
                            const updatedProfile = { ...profile!, stravaAthleteId: e.target.value };
                            await updateDoc(doc(db, 'users', user.uid), { stravaAthleteId: e.target.value });
                            setProfile(updatedProfile);
                          }}
                        />
                      </div>
                      <button 
                        onClick={() => profile && syncStravaActivities(profile)}
                        className="text-xs font-bold text-emerald-600 hover:text-emerald-700"
                      >
                        Sync with Manual Tokens
                      </button>
                    </div>
                  </div>
                </div>

                <div className="p-8">
                  <h3 className="text-lg font-bold text-zinc-900 mb-4 text-rose-600">Danger Zone</h3>
                  <p className="text-sm text-zinc-500 mb-6">Once you delete your account, there is no going back. Please be certain.</p>
                  <button 
                    onClick={deleteAccount}
                    className="bg-rose-50 text-rose-600 hover:bg-rose-100 px-6 py-3 rounded-2xl font-bold transition-all"
                  >
                    Delete Account
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
