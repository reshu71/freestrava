import React, { useMemo } from 'react';
import { UserProfile, Activity } from '../types';
import { 
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, 
  BarChart, Bar, Cell, PieChart, Pie, AreaChart, Area
} from 'recharts';
import { Trophy, Flame, Clock, Activity as ActivityIcon, TrendingUp, Award, Zap, Map, ChevronRight } from 'lucide-react';
import { format, subDays, isWithinInterval, startOfDay, endOfDay, parseISO } from 'date-fns';

interface PerformanceDashboardProps {
  userProfile: UserProfile | null;
  activities: Activity[];
}

export default function PerformanceDashboard({ userProfile, activities }: PerformanceDashboardProps) {
  const last30Days = useMemo(() => {
    return Array.from({ length: 30 }, (_, i) => {
      const date = subDays(new Date(), i);
      const dayActivities = activities.filter(a => 
        isWithinInterval(parseISO(a.startDate), {
          start: startOfDay(date),
          end: endOfDay(date)
        })
      );
      return {
        date: format(date, 'MMM dd'),
        distance: dayActivities.reduce((acc, a) => acc + a.distance / 1000, 0),
        time: dayActivities.reduce((acc, a) => acc + a.movingTime / 60, 0),
        elevation: dayActivities.reduce((acc, a) => acc + (a as any).total_elevation_gain || 0, 0),
      };
    }).reverse();
  }, [activities]);

  const last7Days = last30Days.slice(-7);

  const activityTypes = activities.reduce((acc: any, a) => {
    acc[a.type] = (acc[a.type] || 0) + 1;
    return acc;
  }, {});

  const pieData = Object.entries(activityTypes).map(([name, value]) => ({ name, value }));
  const COLORS = ['#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6'];

  const consistency = useMemo(() => {
    const plannedDays = last30Days.length;
    const activeDays = last30Days.filter(d => d.distance > 0).length;
    return Math.round((activeDays / plannedDays) * 100);
  }, [last30Days]);

  const stats = userProfile?.personalRecords;

  return (
    <div className="space-y-8 pb-12">
      {/* PRs Section */}
      <section>
        <div className="flex items-center gap-3 mb-6">
          <Award className="w-6 h-6 text-emerald-500" />
          <h2 className="text-2xl font-bold text-zinc-900">Personal Records</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <div className="bg-white p-6 rounded-3xl border border-zinc-100 shadow-sm hover:shadow-md transition-all">
            <span className="text-xs font-bold text-zinc-400 uppercase tracking-wider block mb-2">Consistency</span>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-bold text-zinc-900">
                {consistency}
              </span>
              <span className="text-zinc-500 text-sm">%</span>
            </div>
          </div>
          <div className="bg-white p-6 rounded-3xl border border-zinc-100 shadow-sm hover:shadow-md transition-all">
            <span className="text-xs font-bold text-zinc-400 uppercase tracking-wider block mb-2">Longest Ride</span>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-bold text-zinc-900">
                {((stats?.biggest_ride_distance || 0) / 1000).toFixed(1)}
              </span>
              <span className="text-zinc-500 text-sm">km</span>
            </div>
          </div>
          <div className="bg-white p-6 rounded-3xl border border-zinc-100 shadow-sm hover:shadow-md transition-all">
            <span className="text-xs font-bold text-zinc-400 uppercase tracking-wider block mb-2">Max Elevation</span>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-bold text-zinc-900">
                {stats?.biggest_climb_elevation_gain?.toFixed(0) || 0}
              </span>
              <span className="text-zinc-500 text-sm">m</span>
            </div>
          </div>
          <div className="bg-white p-6 rounded-3xl border border-zinc-100 shadow-sm hover:shadow-md transition-all">
            <span className="text-xs font-bold text-zinc-400 uppercase tracking-wider block mb-2">Total Runs</span>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-bold text-zinc-900">
                {stats?.all_run_totals?.count || 0}
              </span>
              <span className="text-zinc-500 text-sm">activities</span>
            </div>
          </div>
          <div className="bg-white p-6 rounded-3xl border border-zinc-100 shadow-sm hover:shadow-md transition-all">
            <span className="text-xs font-bold text-zinc-400 uppercase tracking-wider block mb-2">Total Rides</span>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-bold text-zinc-900">
                {stats?.all_ride_totals?.count || 0}
              </span>
              <span className="text-zinc-500 text-sm">activities</span>
            </div>
          </div>
        </div>
      </section>

      {/* Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* 30-Day Volume Trend */}
        <div className="bg-white p-8 rounded-3xl border border-zinc-100 shadow-sm lg:col-span-2">
          <div className="flex items-center justify-between mb-8">
            <div>
              <h3 className="text-lg font-bold text-zinc-900">30-Day Training Volume</h3>
              <p className="text-sm text-zinc-500">Distance trend over the last month</p>
            </div>
            <div className="flex gap-4">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 bg-emerald-500 rounded-full" />
                <span className="text-xs font-bold text-zinc-500 uppercase">Distance (km)</span>
              </div>
            </div>
          </div>
          <div className="h-[350px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={last30Days}>
                <defs>
                  <linearGradient id="colorDistance" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.1}/>
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f4f4f5" />
                <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{fill: '#71717a', fontSize: 10}} />
                <YAxis axisLine={false} tickLine={false} tick={{fill: '#71717a', fontSize: 10}} />
                <Tooltip 
                  contentStyle={{borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)'}}
                />
                <Area type="monotone" dataKey="distance" stroke="#10b981" strokeWidth={3} fillOpacity={1} fill="url(#colorDistance)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Weekly Distance Chart */}
        <div className="bg-white p-8 rounded-3xl border border-zinc-100 shadow-sm">
          <div className="flex items-center justify-between mb-8">
            <div>
              <h3 className="text-lg font-bold text-zinc-900">Weekly Breakdown</h3>
              <p className="text-sm text-zinc-500">Last 7 days performance</p>
            </div>
            <TrendingUp className="w-5 h-5 text-emerald-500" />
          </div>
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={last7Days}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f4f4f5" />
                <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{fill: '#71717a', fontSize: 12}} />
                <YAxis axisLine={false} tickLine={false} tick={{fill: '#71717a', fontSize: 12}} />
                <Tooltip 
                  cursor={{fill: '#f8fafc'}}
                  contentStyle={{borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)'}}
                />
                <Bar dataKey="distance" fill="#10b981" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Activity Distribution */}
        <div className="bg-white p-8 rounded-3xl border border-zinc-100 shadow-sm">
          <div className="flex items-center justify-between mb-8">
            <div>
              <h3 className="text-lg font-bold text-zinc-900">Activity Split</h3>
              <p className="text-sm text-zinc-500">Distribution by type</p>
            </div>
            <ActivityIcon className="w-5 h-5 text-blue-500" />
          </div>
          <div className="h-[300px] w-full flex items-center justify-center">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={100}
                  paddingAngle={5}
                  dataKey="value"
                >
                  {pieData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip 
                  contentStyle={{borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)'}}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Recent Activities List */}
      <section className="bg-white p-8 rounded-3xl border border-zinc-100 shadow-sm">
        <div className="flex items-center justify-between mb-8">
          <h3 className="text-lg font-bold text-zinc-900">Recent Activities</h3>
          <button className="text-sm font-bold text-emerald-600 hover:text-emerald-700">View All</button>
        </div>
        <div className="space-y-4">
          {activities.slice(0, 5).map((activity) => (
            <div key={activity.id} className="flex items-center justify-between p-4 bg-zinc-50 rounded-2xl hover:bg-zinc-100 transition-all cursor-pointer">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center border border-zinc-200 shadow-sm">
                  {activity.type === 'Run' ? <ActivityIcon className="w-5 h-5 text-emerald-500" /> : <Map className="w-5 h-5 text-blue-500" />}
                </div>
                <div>
                  <h4 className="font-bold text-zinc-900 text-sm">{activity.name}</h4>
                  <p className="text-xs text-zinc-500">{format(parseISO(activity.startDate), 'MMM dd, yyyy')}</p>
                </div>
              </div>
              <div className="flex items-center gap-8">
                <div className="text-right">
                  <p className="font-bold text-zinc-900 text-sm">{(activity.distance / 1000).toFixed(2)} km</p>
                  <p className="text-xs text-zinc-500">Distance</p>
                </div>
                <div className="text-right">
                  <p className="font-bold text-zinc-900 text-sm">{Math.floor(activity.movingTime / 60)}m {activity.movingTime % 60}s</p>
                  <p className="text-xs text-zinc-500">Time</p>
                </div>
                <ChevronRight className="w-4 h-4 text-zinc-400" />
              </div>
            </div>
          ))}
          {activities.length === 0 && (
            <div className="text-center py-12">
              <p className="text-zinc-500">No activities synced yet.</p>
            </div>
          )}
        </div>
      </section>

      {/* Detailed Stats */}
      <section className="bg-emerald-900 rounded-[2.5rem] p-10 text-white overflow-hidden relative">
        <div className="relative z-10 grid grid-cols-1 md:grid-cols-3 gap-12">
          <div>
            <h4 className="text-emerald-300 text-sm font-bold uppercase tracking-widest mb-4">Lifetime Distance</h4>
            <div className="flex items-baseline gap-2">
              <span className="text-5xl font-bold">
                {(((stats?.all_run_totals?.distance || 0) + (stats?.all_ride_totals?.distance || 0)) / 1000).toFixed(0)}
              </span>
              <span className="text-emerald-400 font-medium">km</span>
            </div>
          </div>
          <div>
            <h4 className="text-emerald-300 text-sm font-bold uppercase tracking-widest mb-4">Total Moving Time</h4>
            <div className="flex items-baseline gap-2">
              <span className="text-5xl font-bold">
                {(((stats?.all_run_totals?.moving_time || 0) + (stats?.all_ride_totals?.moving_time || 0)) / 3600).toFixed(0)}
              </span>
              <span className="text-emerald-400 font-medium">hrs</span>
            </div>
          </div>
          <div>
            <h4 className="text-emerald-300 text-sm font-bold uppercase tracking-widest mb-4">Elevation Gain</h4>
            <div className="flex items-baseline gap-2">
              <span className="text-5xl font-bold">
                {(((stats?.all_run_totals?.elevation_gain || 0) + (stats?.all_ride_totals?.elevation_gain || 0))).toFixed(0)}
              </span>
              <span className="text-emerald-400 font-medium">m</span>
            </div>
          </div>
        </div>
        <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-800 rounded-full -mr-32 -mt-32 opacity-20 blur-3xl" />
        <div className="absolute bottom-0 left-0 w-64 h-64 bg-emerald-500 rounded-full -ml-32 -mb-32 opacity-10 blur-3xl" />
      </section>
    </div>
  );
}
