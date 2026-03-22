import React, { useState } from 'react';
import { 
  format, 
  startOfMonth, 
  endOfMonth, 
  startOfWeek, 
  endOfWeek, 
  eachDayOfInterval, 
  isSameMonth, 
  isSameDay, 
  addMonths, 
  subMonths 
} from 'date-fns';
import { ChevronLeft, ChevronRight, CheckCircle2, Circle, MessageSquare, Star, Loader2, X, Plus } from 'lucide-react';
import { CalendarEvent } from '../types';
import { GoogleGenAI } from "@google/genai";

interface CalendarProps {
  events: CalendarEvent[];
  onSelectEvent: (event: CalendarEvent) => void;
  onUpdateExecution: (eventId: string, score: 'green' | 'yellow' | 'red', notes: string) => void;
  onAddEvent: (event: Omit<CalendarEvent, 'id' | 'userId'>) => void;
  onViewChange?: (view: 'week' | 'month') => void;
  isDemoMode?: boolean;
}

export default function Calendar({ events, onSelectEvent, onUpdateExecution, onAddEvent, onViewChange, isDemoMode }: CalendarProps) {
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [view, setView] = useState<'week' | 'month'>('week');
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);
  const [isAddingEvent, setIsAddingEvent] = useState(false);
  const [newEvent, setNewEvent] = useState<Omit<CalendarEvent, 'id' | 'userId'>>({
    title: '',
    description: '',
    date: format(new Date(), 'yyyy-MM-dd'),
    duration: 60,
    intensity: 'moderate',
    completed: false
  });
  const [executionNotes, setExecutionNotes] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(monthStart);
  const startDate = view === 'month' ? startOfWeek(monthStart) : startOfWeek(currentMonth);
  const endDate = view === 'month' ? endOfWeek(monthEnd) : endOfWeek(startDate);

  const calendarDays = eachDayOfInterval({
    start: startDate,
    end: endDate,
  });

  const nextPeriod = () => {
    if (view === 'month') {
      setCurrentMonth(addMonths(currentMonth, 1));
    } else {
      const nextWeek = new Date(startDate);
      nextWeek.setDate(nextWeek.getDate() + 7);
      setCurrentMonth(nextWeek);
    }
  };

  const prevPeriod = () => {
    if (view === 'month') {
      setCurrentMonth(subMonths(currentMonth, 1));
    } else {
      const prevWeek = new Date(startDate);
      prevWeek.setDate(prevWeek.getDate() - 7);
      setCurrentMonth(prevWeek);
    }
  };

  const toggleView = (newView: 'week' | 'month') => {
    setView(newView);
    onViewChange?.(newView);
  };

  const analyzeExecution = async () => {
    if (!selectedEvent || !executionNotes.trim()) return;
    setIsAnalyzing(true);

    if (isDemoMode) {
      setTimeout(() => {
        const scores: ('green' | 'yellow' | 'red')[] = ['green', 'yellow', 'red'];
        const randomScore = scores[Math.floor(Math.random() * scores.length)];
        onUpdateExecution(selectedEvent.id!, randomScore, executionNotes);
        setSelectedEvent(null);
        setExecutionNotes('');
        setIsAnalyzing(false);
      }, 800);
      return;
    }

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
      
      const prompt = `
        Analyze this workout execution:
        Planned Workout: ${selectedEvent.title} (${selectedEvent.duration}m, ${selectedEvent.intensity} intensity)
        User Notes: ${executionNotes}
        
        Rate the execution as 'green' (excellent/as planned), 'yellow' (good/some issues), or 'red' (poor/missed/injured).
        Return ONLY the word: green, yellow, or red.
      `;

      const result = await ai.models.generateContent({
        model: "gemini-1.5-flash-latest",
        contents: [{ role: 'user', parts: [{ text: prompt }] }]
      });

      const score = result.text.trim().toLowerCase() as 'green' | 'yellow' | 'red';
      const validScore = ['green', 'yellow', 'red'].includes(score) ? score : 'yellow';
      
      onUpdateExecution(selectedEvent.id!, validScore as any, executionNotes);
      setSelectedEvent(null);
      setExecutionNotes('');
    } catch (error) {
      console.error("Execution analysis error:", error);
    } finally {
      setIsAnalyzing(false);
    }
  };

  return (
    <div className="bg-[#1F1F1F] rounded-[2rem] border border-white/5 shadow-2xl overflow-hidden animate-kaizen">
      {/* Calendar Header */}
      <div className="p-8 flex items-center justify-between border-b border-white/5 bg-white/5">
        <div className="flex items-center gap-8">
          <h2 className="text-2xl font-black tracking-tighter text-white uppercase">
            {view === 'month' ? format(currentMonth, 'MMMM yyyy') : `WEEK OPS: ${format(startDate, 'MMM d')}`}
          </h2>
          <div className="flex bg-[#121212] p-1.5 rounded-2xl border border-white/5">
            <button 
              onClick={() => toggleView('week')}
              className={`px-6 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-all duration-300 ${
                view === 'week' ? 'bg-[#FC4C02] text-white shadow-lg shadow-orange-500/20' : 'text-zinc-500 hover:text-white'
              }`}
            >
              Week
            </button>
            <button 
              onClick={() => toggleView('month')}
              className={`px-6 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-all duration-300 ${
                view === 'month' ? 'bg-[#FC4C02] text-white shadow-lg shadow-orange-500/20' : 'text-zinc-500 hover:text-white'
              }`}
            >
              Month
            </button>
          </div>
          <button 
            onClick={() => setIsAddingEvent(true)}
            className="strava-btn-primary px-5 py-2.5 text-xs uppercase tracking-widest"
          >
            <Plus className="w-4 h-4" />
            Add Mission
          </button>
        </div>
        <div className="flex gap-3">
          <button onClick={prevPeriod} className="p-3 bg-white/5 hover:bg-white/10 rounded-2xl border border-white/5 transition-all">
            <ChevronLeft className="w-5 h-5 text-zinc-400" />
          </button>
          <button onClick={nextPeriod} className="p-3 bg-white/5 hover:bg-white/10 rounded-2xl border border-white/5 transition-all">
            <ChevronRight className="w-5 h-5 text-zinc-400" />
          </button>
        </div>
      </div>

      {/* Days Header - Only visible in Month view */}
      {view === 'month' && (
        <div className="grid grid-cols-7 border-b border-white/5 bg-white/[0.02]">
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
            <div key={day} className="py-4 text-center text-[10px] font-black text-zinc-600 uppercase tracking-[0.2em]">
              {day}
            </div>
          ))}
        </div>
      )}

      <div className={view === 'month' ? 'grid grid-cols-7 divide-x divide-white/5' : 'flex flex-col divide-y divide-white/5'}>
        {calendarDays.map((day, i) => {
          const dayEvents = events.filter(e => isSameDay(new Date(e.date), day));
          const isToday = isSameDay(day, new Date());
          return (
            <div 
              key={i} 
              className={`${view === 'month' ? 'min-h-[160px] p-4 border-b border-white/5' : 'p-8 flex gap-10 items-start'} transition-all ${
                !isSameMonth(day, monthStart) && view === 'month' ? 'opacity-20 grayscale' : ''
              } ${view === 'week' ? 'bg-transparent hover:bg-white/[0.02]' : ''}`}
            >
              <div className={view === 'month' ? 'flex justify-between items-start mb-4' : 'flex flex-col items-center w-24 flex-shrink-0'}>
                <span className={`text-xl font-black tracking-tighter ${
                  isToday ? 'w-10 h-10 bg-[#FC4C02] text-white rounded-xl flex items-center justify-center shadow-2xl shadow-orange-500/30 rotate-3' : 'text-zinc-600'
                }`}>
                  {format(day, 'd')}
                </span>
                <span className={`font-black uppercase tracking-[0.15em] mt-2 ${
                  view === 'month' ? 'text-[9px] text-zinc-700' : 'text-[11px] text-zinc-500'
                }`}>
                  {format(day, 'EEE')}
                </span>
              </div>
              <div className={`space-y-3 ${view === 'month' ? 'max-h-[200px] overflow-y-auto pr-1' : 'flex-1'}`}>
                {dayEvents.length > 0 ? (
                  <div className={view === 'month' ? 'space-y-3' : 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4'}>
                    {dayEvents.map(event => (
                      <button
                        key={event.id}
                        onClick={() => setSelectedEvent(event)}
                        className={`w-full text-left p-4 rounded-[1.25rem] text-xs font-black transition-all border-2 group relative overflow-hidden flex flex-col gap-2 ${
                          event.executionScore === 'green' ? 'bg-[#008542]/10 border-[#008542]/30 text-[#008542]' :
                          event.executionScore === 'yellow' ? 'bg-[#FFB800]/10 border-[#FFB800]/30 text-[#FFB800]' :
                          event.executionScore === 'red' ? 'bg-[#D21C38]/10 border-[#D21C38]/30 text-[#D21C38]' :
                          event.completed ? 'bg-white/5 border-white/10 text-zinc-400' :
                          'bg-[#121212] border-white/5 text-white shadow-xl hover:border-[#FC4C02]/50 hover:shadow-[#FC4C02]/10'
                        }`}
                      >
                        <div className="flex items-start gap-2.5 w-full">
                          {event.completed ? <CheckCircle2 className="w-4 h-4 mt-0.5 flex-shrink-0" /> : <div className="w-4 h-4 mt-0.5 border-2 border-current rounded-full flex-shrink-0" />}
                          <span className="leading-tight uppercase tracking-tight">{event.title}</span>
                        </div>
                        <div className="flex items-center justify-between opacity-50 text-[10px] w-full font-bold uppercase tracking-widest">
                          <span className="flex-shrink-0">{event.duration} MIN</span>
                          <span className="truncate ml-2 text-right">{event.intensity} OPS</span>
                        </div>
                        <div className={`absolute top-0 right-0 w-1 h-full ${
                          event.intensity === 'high' ? 'bg-[#FC4C02]' :
                          event.intensity === 'moderate' ? 'bg-amber-500' :
                          'bg-blue-500'
                        }`} />
                      </button>
                    ))}
                  </div>
                ) : (
                  view === 'week' && <p className="text-zinc-800 text-[11px] font-black uppercase tracking-widest py-3 italic">No Ops Scheduled</p>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Execution Modal */}
      {selectedEvent && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-xl z-50 flex items-center justify-center p-6 sm:p-10">
          <div className="bg-[#1F1F1F] rounded-[2.5rem] w-full max-w-xl shadow-[0_0_100px_rgba(0,0,0,0.5)] border border-white/5 overflow-hidden animate-in fade-in zoom-in duration-300">
            <div className="p-10 border-b border-white/5 bg-white/[0.02]">
              <div className="flex items-center justify-between mb-6">
                <span className="text-[10px] font-black text-[#FC4C02] uppercase tracking-[0.3em]">Protocol debrief</span>
                <button onClick={() => setSelectedEvent(null)} className="p-2 hover:bg-white/5 rounded-xl transition-colors">
                  <X className="w-6 h-6 text-zinc-500" />
                </button>
              </div>
              <h3 className="text-3xl font-black text-white tracking-tighter uppercase mb-3">{selectedEvent.title}</h3>
              <p className="text-zinc-500 font-medium leading-relaxed">{selectedEvent.description}</p>
            </div>
            
            <div className="p-10 space-y-8">
              {selectedEvent.executionScore && (
                <div className={`p-6 rounded-[1.5rem] flex items-center gap-5 ${
                  selectedEvent.executionScore === 'green' ? 'bg-[#008542]/10 text-[#008542]' :
                  selectedEvent.executionScore === 'yellow' ? 'bg-[#FFB800]/10 text-[#FFB800]' :
                  'bg-[#D21C38]/10 text-[#D21C38]'
                } border border-current/20`}>
                  <Star className="w-8 h-8 fill-current flex-shrink-0" />
                  <div>
                    <p className="font-black text-xs uppercase tracking-widest mb-1">AI ANALYSIS COMPLETE</p>
                    <p className="text-sm font-bold opacity-90">{selectedEvent.executionNotes}</p>
                  </div>
                </div>
              )}

              <div>
                <label className="block text-xs font-black text-zinc-500 uppercase tracking-widest mb-4 flex items-center gap-2">
                  <MessageSquare className="w-4 h-4 text-[#FC4C02]" />
                  Session Feedback
                </label>
                <textarea
                  value={executionNotes}
                  onChange={(e) => setExecutionNotes(e.target.value)}
                  placeholder="Record heart rate, perceived effort, and technical performance..."
                  className="w-full bg-[#121212] border border-white/10 rounded-2xl p-6 text-sm font-bold focus:ring-2 focus:ring-[#FC4C02] outline-none transition-all h-40 resize-none text-white placeholder:text-zinc-700"
                />
              </div>

              <div className="flex flex-col sm:flex-row gap-4">
                <button
                  onClick={analyzeExecution}
                  disabled={!executionNotes.trim() || isAnalyzing}
                  className="strava-btn-primary flex-1 py-5"
                >
                  {isAnalyzing ? <Loader2 className="w-6 h-6 animate-spin" /> : <Star className="w-6 h-6" />}
                  <span className="text-lg tracking-tight uppercase">Analyze protocol</span>
                </button>
                <button
                  onClick={() => onSelectEvent(selectedEvent)}
                  className="strava-btn-secondary px-8 py-5 uppercase tracking-widest text-xs"
                >
                  Mark complete
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Add Event Modal */}
      {isAddingEvent && (
        <div className="fixed inset-0 bg-zinc-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-6">
          <div className="bg-white rounded-[2rem] w-full max-w-lg shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="p-8 border-b border-zinc-100 bg-zinc-50/50 flex items-center justify-between">
              <h3 className="text-2xl font-bold text-zinc-900">Add Custom Workout</h3>
              <button onClick={() => setIsAddingEvent(false)} className="text-zinc-400 hover:text-zinc-600">
                <X className="w-6 h-6" />
              </button>
            </div>
            
            <div className="p-8 space-y-6">
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-bold text-zinc-700 mb-2">Title</label>
                  <input 
                    type="text"
                    value={newEvent.title}
                    onChange={(e) => setNewEvent({...newEvent, title: e.target.value})}
                    placeholder="e.g. Morning Run, Tempo Ride..."
                    className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-3 focus:ring-2 focus:ring-emerald-500 outline-none transition-all"
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold text-zinc-700 mb-2">Description</label>
                  <textarea 
                    value={newEvent.description}
                    onChange={(e) => setNewEvent({...newEvent, description: e.target.value})}
                    placeholder="Workout details..."
                    className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-3 focus:ring-2 focus:ring-emerald-500 outline-none transition-all h-24 resize-none"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-bold text-zinc-700 mb-2">Date</label>
                    <input 
                      type="date"
                      value={newEvent.date}
                      onChange={(e) => setNewEvent({...newEvent, date: e.target.value})}
                      className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-3 focus:ring-2 focus:ring-emerald-500 outline-none transition-all"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-zinc-700 mb-2">Duration (min)</label>
                    <input 
                      type="number"
                      value={newEvent.duration}
                      onChange={(e) => setNewEvent({...newEvent, duration: parseInt(e.target.value)})}
                      className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-3 focus:ring-2 focus:ring-emerald-500 outline-none transition-all"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-bold text-zinc-700 mb-2">Intensity</label>
                  <div className="flex gap-2">
                    {['low', 'moderate', 'high'].map((level) => (
                      <button
                        key={level}
                        onClick={() => setNewEvent({...newEvent, intensity: level as any})}
                        className={`flex-1 py-3 rounded-xl font-bold capitalize transition-all border ${
                          newEvent.intensity === level 
                            ? 'bg-emerald-500 border-emerald-500 text-white' 
                            : 'bg-zinc-50 border-zinc-200 text-zinc-500 hover:border-emerald-200'
                        }`}
                      >
                        {level}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <button
                onClick={() => {
                  onAddEvent(newEvent);
                  setIsAddingEvent(false);
                  setNewEvent({
                    title: '',
                    description: '',
                    date: format(new Date(), 'yyyy-MM-dd'),
                    duration: 60,
                    intensity: 'moderate',
                    completed: false
                  });
                }}
                disabled={!newEvent.title}
                className="w-full bg-zinc-900 hover:bg-zinc-800 disabled:opacity-50 text-white font-bold py-4 rounded-2xl transition-all"
              >
                Add to Calendar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
