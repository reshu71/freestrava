import React, { useState, useEffect } from 'react';
import { Activity as ActivityIcon, Link as LinkIcon, CheckCircle2, AlertCircle } from 'lucide-react';
import { UserProfile } from '../types';

interface StravaConnectProps {
  userProfile: UserProfile | null;
  onConnect: (data: any) => void;
  hasData?: boolean;
}

export default function StravaConnect({ userProfile, onConnect, hasData }: StravaConnectProps) {
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === 'STRAVA_AUTH_SUCCESS') {
        onConnect(event.data.data);
        setIsConnecting(false);
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [onConnect]);

  const handleConnect = async () => {
    setIsConnecting(true);
    setError(null);

    const width = 600;
    const height = 700;
    
    // Open a blank popup immediately within the user gesture context
    const popup = window.open(
      'about:blank',
      'strava_oauth',
      `width=${width},height=${height}`
    );

    if (!popup) {
      setError("Popup blocked. Please allow popups for this site.");
      setIsConnecting(false);
      return;
    }

    try {
      const response = await fetch('/api/auth/strava/url');
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || 'Failed to get auth URL');
      }
      
      const { url } = data;
      if (!url) throw new Error('Auth URL is missing');
      
      // Update the popup's location to the Strava auth URL
      popup.location.href = url;
    } catch (err: any) {
      console.error("Strava connection error:", err);
      setError(err.message || "Failed to connect to Strava. Please try again.");
      setIsConnecting(false);
      if (popup) popup.close();
    }
  };

  const isConnected = !!userProfile?.stravaAccessToken && !!hasData;

  return (
    <div className={`p-6 rounded-2xl border transition-all ${
      isConnected ? 'bg-orange-50 border-orange-100' : 'bg-white border-zinc-200 shadow-sm'
    }`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className={`w-12 h-12 rounded-xl flex items-center justify-center shadow-lg ${
            isConnected ? 'bg-orange-500 shadow-orange-200' : 'bg-zinc-100 shadow-zinc-100'
          }`}>
            <ActivityIcon className={`w-6 h-6 ${isConnected ? 'text-white' : 'text-zinc-400'}`} />
          </div>
          <div>
            <h3 className="text-lg font-bold text-zinc-900">Strava Integration</h3>
            <p className="text-sm text-zinc-500">
              {isConnected ? 'Connected to Strava' : 'Connect your Strava account to sync activities.'}
            </p>
          </div>
        </div>

        {isConnected ? (
          <div className="flex items-center gap-2 text-orange-600 font-medium px-4 py-2 bg-white rounded-xl border border-orange-100 shadow-sm">
            <CheckCircle2 className="w-4 h-4" />
            Connected
          </div>
        ) : (
          <button
            onClick={handleConnect}
            disabled={isConnecting}
            className="flex items-center gap-2 bg-[#FC6100] hover:bg-[#E35700] disabled:bg-orange-300 text-white px-6 py-2.5 rounded-xl font-bold transition-all shadow-md hover:shadow-lg"
          >
            <LinkIcon className="w-4 h-4" />
            {isConnecting ? 'Connecting...' : 'Connect Strava'}
          </button>
        )}
      </div>

      {error && (
        <div className="mt-4 flex items-center gap-2 text-rose-600 text-sm bg-rose-50 p-3 rounded-lg border border-rose-100">
          <AlertCircle className="w-4 h-4" />
          {error}
        </div>
      )}

      {isConnected && (
        <div className="mt-4 pt-4 border-t border-orange-100 flex gap-4">
          <div className="text-xs text-orange-700">
            <span className="font-bold block">Athlete ID</span>
            {userProfile?.stravaAthleteId}
          </div>
          <div className="text-xs text-orange-700">
            <span className="font-bold block">Status</span>
            Active Sync
          </div>
        </div>
      )}
    </div>
  );
}
