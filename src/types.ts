export interface UserProfile {
  uid: string;
  displayName: string | null;
  email: string | null;
  stravaAccessToken?: string;
  stravaRefreshToken?: string;
  stravaTokenExpiresAt?: number;
  stravaAthleteId?: string;
  fitnessLevel?: 'beginner' | 'intermediate' | 'advanced';
  goals?: string;
  personalRecords?: {
    all_run_totals?: ActivityTotal;
    all_ride_totals?: ActivityTotal;
    all_swim_totals?: ActivityTotal;
    biggest_ride_distance?: number;
    biggest_climb_elevation_gain?: number;
  };
}

export interface ActivityTotal {
  count: number;
  distance: number;
  moving_time: number;
  elapsed_time: number;
  elevation_gain: number;
}

export interface Activity {
  id?: string;
  stravaId: string;
  userId: string;
  name: string;
  type: string;
  distance: number;
  movingTime: number;
  startDate: string;
  averageHeartrate?: number;
  maxHeartrate?: number;
  executionScore?: 'green' | 'yellow' | 'red';
  executionNotes?: string;
}

export interface TrainingPlan {
  id?: string;
  userId: string;
  title: string;
  description: string;
  startDate: string;
  endDate: string;
  status: 'active' | 'completed' | 'archived';
}

export interface CalendarEvent {
  id?: string;
  userId: string;
  planId?: string;
  title: string;
  description: string;
  date: string;
  duration: number;
  intensity: 'low' | 'moderate' | 'high';
  completed: boolean;
  executionScore?: 'green' | 'yellow' | 'red';
  executionNotes?: string;
}

export interface ChatMessage {
  role: 'user' | 'model';
  text: string;
}
