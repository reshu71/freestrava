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
    <div className="space-y-10 pb-12 animate-kaizen">
      {/* PRs Section */}
      <section>
        <div className="flex items-center gap-4 mb-8">
          <Award className="w-8 h-8 text-[#FC4C02]" />
          <h2 className="text-3xl font-black tracking-tighter text-white uppercase">Personal Records</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-5 gap-6">
          <div className="bg-[#1F1F1F] p-8 rounded-[2rem] border border-white/5 shadow-2xl hover:border-[#FC4C02]/30 transition-all group">
            <span className="text-[10px] font-black text-zinc-500 uppercase tracking-[0.2em] block mb-4 group-hover:text-[#FC4C02]">Consistency</span>
            <div className="flex items-baseline gap-2">
              <span className="text-4xl font-black tracking-tighter text-white">
                {consistency}
              </span>
              <span className="text-zinc-600 font-bold text-sm">%</span>
            </div>
          </div>
          <div className="bg-[#1F1F1F] p-8 rounded-[2rem] border border-white/5 shadow-2xl hover:border-[#FC4C02]/30 transition-all group">
            <span className="text-[10px] font-black text-zinc-500 uppercase tracking-[0.2em] block mb-4 group-hover:text-[#FC4C02]">Longest Ride</span>
            <div className="flex items-baseline gap-2">
              <span className="text-4xl font-black tracking-tighter text-white">
                {((stats?.biggest_ride_distance || 0) / 1000).toFixed(1)}
              </span>
              <span className="text-zinc-600 font-bold text-sm">KM</span>
            </div>
          </div>
          <div className="bg-[#1F1F1F] p-8 rounded-[2rem] border border-white/5 shadow-2xl hover:border-[#FC4C02]/30 transition-all group">
            <span className="text-[10px] font-black text-zinc-500 uppercase tracking-[0.2em] block mb-4 group-hover:text-[#FC4C02]">Max Elevation</span>
            <div className="flex items-baseline gap-2">
              <span className="text-4xl font-black tracking-tighter text-white">
                {stats?.biggest_climb_elevation_gain?.toFixed(0) || 0}
              </span>
              <span className="text-zinc-600 font-bold text-sm">M</span>
            </div>
          </div>
          <div className="bg-[#1F1F1F] p-8 rounded-[2rem] border border-white/5 shadow-2xl hover:border-[#FC4C02]/30 transition-all group">
            <span className="text-[10px] font-black text-zinc-500 uppercase tracking-[0.2em] block mb-4 group-hover:text-[#FC4C02]">Total Runs</span>
            <div className="flex items-baseline gap-2">
              <span className="text-4xl font-black tracking-tighter text-white">
                {stats?.all_run_totals?.count || 0}
              </span>
              <span className="text-zinc-600 font-bold text-sm uppercase tracking-tighter">Ops</span>
            </div>
          </div>
          <div className="bg-[#1F1F1F] p-8 rounded-[2rem] border border-white/5 shadow-2xl hover:border-[#FC4C02]/30 transition-all group">
            <span className="text-[10px] font-black text-zinc-500 uppercase tracking-[0.2em] block mb-4 group-hover:text-[#FC4C02]">Total Rides</span>
            <div className="flex items-baseline gap-2">
              <span className="text-4xl font-black tracking-tighter text-white">
                {stats?.all_ride_totals?.count || 0}
              </span>
              <span className="text-zinc-600 font-bold text-sm uppercase tracking-tighter">Ops</span>
            </div>
          </div>
        </div>
      </section>

      {/* Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* 30-Day Volume Trend */}
        <div className="bg-[#1F1F1F] p-10 rounded-[2.5rem] border border-white/5 shadow-2xl lg:col-span-2 overflow-hidden relative">
          <div className="flex items-center justify-between mb-10 relative z-10">
            <div>
              <h3 className="text-xl font-black text-white uppercase tracking-tighter">30-Day Intensity Flux</h3>
              <p className="text-xs font-black text-zinc-600 uppercase tracking-widest mt-1">Volume trend visualization</p>
            </div>
            <div className="flex gap-6">
              <div className="flex items-center gap-3">
                <div className="w-3 h-3 bg-[#FC4C02] rounded-full shadow-lg shadow-orange-500/50" />
                <span className="text-[10px] font-black text-zinc-500 uppercase tracking-[0.2em]">Distance (KM)</span>
              </div>
            </div>
          </div>
          <div className="h-[400px] w-full relative z-10">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={last30Days}>
                <defs>
                  <linearGradient id="colorDistance" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#FC4C02" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#FC4C02" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{fill: '#52525b', fontSize: 10, fontWeight: 900}} />
                <YAxis axisLine={false} tickLine={false} tick={{fill: '#52525b', fontSize: 10, fontWeight: 900}} />
                <Tooltip 
                  contentStyle={{backgroundColor: '#121212', borderRadius: '16px', border: '1px solid rgba(255,255,255,0.1)', color: '#fff'}}
                  itemStyle={{color: '#FC4C02', fontWeight: 900}}
                />
                <Area type="monotone" dataKey="distance" stroke="#FC4C02" strokeWidth={4} fillOpacity={1} fill="url(#colorDistance)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <div className="absolute top-0 right-0 w-96 h-96 bg-[#FC4C02]/5 rounded-full -mr-48 -mt-48 blur-3xl pointer-events-none" />
        </div>

        {/* Weekly Distance Chart */}
        <div className="bg-[#1F1F1F] p-10 rounded-[2.5rem] border border-white/5 shadow-2xl">
          <div className="flex items-center justify-between mb-10">
            <div>
              <h3 className="text-xl font-black text-white uppercase tracking-tighter">Microcycle OPS</h3>
              <p className="text-xs font-black text-zinc-600 uppercase tracking-widest mt-1">Last 7 days breakdown</p>
            </div>
            <TrendingUp className="w-6 h-6 text-[#FC4C02]" />
          </div>
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={last7Days}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{fill: '#52525b', fontSize: 12, fontWeight: 900}} />
                <YAxis axisLine={false} tickLine={false} tick={{fill: '#52525b', fontSize: 12, fontWeight: 900}} />
                <Tooltip 
                  cursor={{fill: 'rgba(255,255,255,0.05)', radius: 8}}
                  contentStyle={{backgroundColor: '#121212', borderRadius: '16px', border: '1px solid rgba(255,255,255,0.1)', color: '#fff'}}
                />
                <Bar dataKey="distance" fill="#FC4C02" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Activity Distribution */}
        <div className="bg-[#1F1F1F] p-10 rounded-[2.5rem] border border-white/5 shadow-2xl">
          <div className="flex items-center justify-between mb-10">
            <div>
              <h3 className="text-xl font-black text-white uppercase tracking-tighter">Activity Modal Split</h3>
              <p className="text-xs font-black text-zinc-600 uppercase tracking-widest mt-1">Training diversity analysis</p>
            </div>
            <ActivityIcon className="w-6 h-6 text-[#FC4C02]" />
          </div>
          <div className="h-[300px] w-full flex items-center justify-center">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="50%"
                  innerRadius={70}
                  outerRadius={110}
                  paddingAngle={8}
                  dataKey="value"
                  stroke="none"
                >
                  {pieData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={index === 0 ? '#FC4C02' : index === 1 ? '#FFB800' : '#D21C38'} />
                  ))}
                </Pie>
                <Tooltip 
                  contentStyle={{backgroundColor: '#121212', borderRadius: '16px', border: '1px solid rgba(255,255,255,0.1)', color: '#fff'}}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Recent Activities List */}
      <section className="bg-[#1F1F1F] p-10 rounded-[2.5rem] border border-white/5 shadow-2xl">
        <div className="flex items-center justify-between mb-10">
          <h3 className="text-xl font-black text-white uppercase tracking-tighter">Recent Activities</h3>
          <button className="text-[10px] font-black text-[#FC4C02] uppercase tracking-[0.2em] hover:opacity-80 transition-all">Full Log</button>
        </div>
        <div className="space-y-4">
          {activities.slice(0, 5).map((activity) => (
            <div key={activity.id} className="flex items-center justify-between p-6 bg-white/[0.02] border border-white/5 rounded-[1.5rem] hover:bg-white/[0.05] hover:border-[#FC4C02]/20 transition-all cursor-pointer group">
              <div className="flex items-center gap-6">
                <div className="w-12 h-12 bg-[#121212] rounded-[1rem] flex items-center justify-center border border-white/5 shadow-xl group-hover:border-[#FC4C02]/30 transition-all">
                  {activity.type === 'Run' ? <ActivityIcon className="w-6 h-6 text-[#FC4C02]" /> : <Map className="w-6 h-6 text-amber-500" />}
                </div>
                <div>
                  <h4 className="font-black text-white text-base uppercase tracking-tight">{activity.name}</h4>
                  <p className="text-[10px] font-black text-zinc-600 uppercase tracking-widest mt-0.5">{format(parseISO(activity.startDate), 'MMM dd, yyyy')}</p>
                </div>
              </div>
              <div className="flex items-center gap-12">
                <div className="text-right">
                  <p className="font-black text-white text-base tracking-tighter">{(activity.distance / 1000).toFixed(2)} KM</p>
                  <p className="text-[9px] font-black text-zinc-700 uppercase tracking-widest mt-0.5">Distance</p>
                </div>
                <div className="text-right">
                  <p className="font-black text-white text-base tracking-tighter">{Math.floor(activity.movingTime / 60)}M {activity.movingTime % 60}S</p>
                  <p className="text-[9px] font-black text-zinc-700 uppercase tracking-widest mt-0.5">Time</p>
                </div>
                <ChevronRight className="w-5 h-5 text-zinc-700 group-hover:text-[#FC4C02] transition-colors" />
              </div>
            </div>
          ))}
          {activities.length === 0 && (
            <div className="text-center py-20 border-2 border-dashed border-white/5 rounded-[2rem]">
              <p className="text-zinc-600 font-black uppercase tracking-widest text-xs">No activity telemetry synced</p>
            </div>
          )}
        </div>
      </section>

      {/* Detailed Stats */}
      <section className="bg-[#121212] overflow-hidden rounded-[3rem] border border-white/5 group shadow-[0_0_50px_rgba(252,76,2,0.05)]">
        <div className="p-12 relative z-10 grid grid-cols-1 md:grid-cols-3 gap-16">
          <div className="space-y-4">
            <h4 className="text-zinc-600 text-[10px] font-black uppercase tracking-[0.3em]">Lifetime Telemetry</h4>
            <div className="flex items-baseline gap-3">
              <span className="text-6xl font-black tracking-tighter text-white">
                {(((stats?.all_run_totals?.distance || 0) + (stats?.all_ride_totals?.distance || 0)) / 1000).toFixed(0)}
              </span>
              <span className="text-[#FC4C02] font-black text-xl uppercase tracking-widest">KM</span>
            </div>
          </div>
          <div className="space-y-4 border-l border-white/5 pl-16">
            <h4 className="text-zinc-600 text-[10px] font-black uppercase tracking-[0.3em]">Active Cycle</h4>
            <div className="flex items-baseline gap-3">
              <span className="text-6xl font-black tracking-tighter text-white">
                {(((stats?.all_run_totals?.moving_time || 0) + (stats?.all_ride_totals?.moving_time || 0)) / 3600).toFixed(0)}
              </span>
              <span className="text-[#FC4C02] font-black text-xl uppercase tracking-widest">HRS</span>
            </div>
          </div>
          <div className="space-y-4 border-l border-white/5 pl-16">
            <h4 className="text-zinc-600 text-[10px] font-black uppercase tracking-[0.3em]">Vertical Gain</h4>
            <div className="flex items-baseline gap-3">
              <span className="text-6xl font-black tracking-tighter text-white">
                {(((stats?.all_run_totals?.elevation_gain || 0) + (stats?.all_ride_totals?.elevation_gain || 0))).toFixed(0)}
              </span>
              <span className="text-[#FC4C02] font-black text-xl uppercase tracking-widest">M</span>
            </div>
          </div>
        </div>
        <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-[#FC4C02]/5 rounded-full -mr-64 -mt-64 blur-[120px] pointer-events-none group-hover:bg-[#FC4C02]/10 transition-all duration-1000" />
      </section>
    </div>
  );
}
