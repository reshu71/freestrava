import { UserProfile, Activity, TrainingPlan, CalendarEvent } from './types';
import { subDays, addDays, format, startOfToday } from 'date-fns';

const today = startOfToday();

export const MOCK_USER: UserProfile = {
  uid: 'demo-user-123',
  displayName: 'Demo Athlete',
  email: 'demo@veloce.ai',
  fitnessLevel: 'intermediate',
  goals: 'Finish my first marathon in under 4 hours.',
  personalRecords: {
    all_run_totals: { count: 156, distance: 1240000, moving_time: 446400, elapsed_time: 480000, elevation_gain: 15400 },
    biggest_ride_distance: 120000,
    biggest_climb_elevation_gain: 1200
  }
};

export const MOCK_ACTIVITIES: Activity[] = [
  {
    stravaId: 'mock-1',
    userId: 'demo-user-123',
    name: 'Morning Tempo Run',
    type: 'Run',
    distance: 12000,
    movingTime: 3300,
    startDate: subDays(today, 1).toISOString(),
    averageHeartrate: 155,
    maxHeartrate: 172,
    executionScore: 'green',
    executionNotes: 'Maintained target pace throughout.'
  },
  {
    stravaId: 'mock-2',
    userId: 'demo-user-123',
    name: 'Long Endurance Ride',
    type: 'Ride',
    distance: 65000,
    movingTime: 9000,
    startDate: subDays(today, 3).toISOString(),
    averageHeartrate: 138,
    maxHeartrate: 155,
    executionScore: 'yellow',
    executionNotes: 'Slightly lower heart rate than planned due to wind.'
  },
  {
    stravaId: 'mock-3',
    userId: 'demo-user-123',
    name: 'Interval Session (8x400m)',
    type: 'Run',
    distance: 8000,
    movingTime: 2400,
    startDate: subDays(today, 5).toISOString(),
    averageHeartrate: 165,
    maxHeartrate: 188,
    executionScore: 'red',
    executionNotes: 'Missed the last two intervals due to fatigue.'
  },
  {
    stravaId: 'mock-4',
    userId: 'demo-user-123',
    name: 'Active Recovery Walk',
    type: 'Walk',
    distance: 4000,
    movingTime: 2400,
    startDate: subDays(today, 6).toISOString(),
    averageHeartrate: 105,
    maxHeartrate: 115,
    executionScore: 'green'
  }
];

export const MOCK_PLAN: TrainingPlan = {
  id: 'demo-plan-1',
  userId: 'demo-user-123',
  title: 'Marathon Sub-4h Foundation',
  description: 'A 12-week build focusing on aerobic threshold and structural integrity.',
  startDate: subDays(today, 14).toISOString(),
  endDate: addDays(today, 70).toISOString(),
  status: 'active'
};

export const MOCK_EVENTS: CalendarEvent[] = [
  {
    id: 'e1',
    userId: 'demo-user-123',
    planId: 'demo-plan-1',
    title: 'Easy Recovery Run',
    description: '30-40 mins at Zone 2. Focus on form.',
    date: today.toISOString(),
    duration: 40,
    intensity: 'low',
    completed: false
  },
  {
    id: 'e2',
    userId: 'demo-user-123',
    planId: 'demo-plan-1',
    title: 'Threshold Intervals',
    description: '4 x 2km at Threshold pace with 2min recovery.',
    date: addDays(today, 1).toISOString(),
    duration: 60,
    intensity: 'high',
    completed: false
  },
  {
    id: 'e3',
    userId: 'demo-user-123',
    planId: 'demo-plan-1',
    title: 'Long Ride',
    description: '90-120 mins steady endurance.',
    date: addDays(today, 2).toISOString(),
    duration: 120,
    intensity: 'moderate',
    completed: false
  }
];

export const MOCK_NEW_PLAN: TrainingPlan = {
  id: 'demo-plan-2',
  userId: 'demo-user-123',
  title: 'Peak Performance Cycle',
  description: 'A 4-week sharpening phase with high-intensity speed work.',
  startDate: today.toISOString(),
  endDate: addDays(today, 28).toISOString(),
  status: 'active'
};

export const MOCK_NEW_EVENTS: CalendarEvent[] = [
  {
    id: 'ne1',
    userId: 'demo-user-123',
    planId: 'demo-plan-2',
    title: 'VO2 Max Intervals',
    description: '5 x 1km at 5k pace. 90s rest.',
    date: today.toISOString(),
    duration: 45,
    intensity: 'high',
    completed: false
  },
  {
    id: 'ne2',
    userId: 'demo-user-123',
    planId: 'demo-plan-2',
    title: 'Easy Aerobic Flush',
    description: '45 mins very easy. Stay under 140bpm.',
    date: addDays(today, 1).toISOString(),
    duration: 45,
    intensity: 'low',
    completed: false
  }
];

export const getMockAIResponse = (input: string) => {
  const lower = input.toLowerCase();
  
  if (lower.includes('marathon') || lower.includes('goal')) {
    return "Your progress towards the sub-4h marathon goal looks solid! You've completed 85% of your planned workouts over the last 14 days. Your tempo run yesterday showed a very stable heart rate (155 bpm) at your target pace. I recommend keeping the tomorrow's interval session as scheduled, but make sure to hydrate well!";
  }
  
  if (lower.includes('training') || lower.includes('going')) {
    return "Based on your last 30 days of Strava data, your volume is up 12% compared to last month. Your aerobic efficiency is improving—you're running about 5 seconds per km faster at the same heart rate. Keep sticking to the Zone 2 rides on weekends to build that engine.";
  }

  if (lower.includes('plan') || lower.includes('modify')) {
    return "I've analyzed your recent fatigue scores. I've adjusted your next 3 days to include a recovery session today to prevent overtraining. Check your calendar for the updated events!";
  }

  return "I'm your Veloce AI Demo Coach. Since we're in Demo Mode, I'm providing predefined insights. Your training data shows great consistency. Is there something specific about your performance you'd like me to analyze?";
};
