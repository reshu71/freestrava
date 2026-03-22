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
}

export default function Calendar({ events, onSelectEvent, onUpdateExecution, onAddEvent, onViewChange }: CalendarProps) {
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
        model: "gemini-3-flash-preview",
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
    <div className="bg-white rounded-3xl border border-zinc-200 shadow-sm overflow-hidden">
      {/* Calendar Header */}
      <div className="p-6 flex items-center justify-between border-b border-zinc-100">
        <div className="flex items-center gap-6">
          <h2 className="text-xl font-bold text-zinc-900">
            {view === 'month' ? format(currentMonth, 'MMMM yyyy') : `Week of ${format(startDate, 'MMM d, yyyy')}`}
          </h2>
          <div className="flex bg-zinc-100 p-1 rounded-xl">
            <button 
              onClick={() => toggleView('week')}
              className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${
                view === 'week' ? 'bg-white text-emerald-600 shadow-sm' : 'text-zinc-500 hover:text-zinc-700'
              }`}
            >
              Week
            </button>
            <button 
              onClick={() => toggleView('month')}
              className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${
                view === 'month' ? 'bg-white text-emerald-600 shadow-sm' : 'text-zinc-500 hover:text-zinc-700'
              }`}
            >
              Month
            </button>
          </div>
          <button 
            onClick={() => setIsAddingEvent(true)}
            className="flex items-center gap-2 bg-emerald-500 hover:bg-emerald-600 text-white px-4 py-2 rounded-xl text-sm font-bold transition-all shadow-sm"
          >
            <Plus className="w-4 h-4" />
            Add Workout
          </button>
        </div>
        <div className="flex gap-2">
          <button onClick={prevPeriod} className="p-2 hover:bg-zinc-50 rounded-xl transition-colors">
            <ChevronLeft className="w-5 h-5 text-zinc-600" />
          </button>
          <button onClick={nextPeriod} className="p-2 hover:bg-zinc-50 rounded-xl transition-colors">
            <ChevronRight className="w-5 h-5 text-zinc-600" />
          </button>
        </div>
      </div>

      {/* Days Header - Only visible in Month view */}
      {view === 'month' && (
        <div className="grid grid-cols-7 border-b border-zinc-100 bg-zinc-50/50">
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
            <div key={day} className="py-3 text-center text-xs font-bold text-zinc-400 uppercase tracking-widest">
              {day}
            </div>
          ))}
        </div>
      )}

      <div className={view === 'month' ? 'grid grid-cols-7' : 'flex flex-col divide-y divide-zinc-100'}>
        {calendarDays.map((day, i) => {
          const dayEvents = events.filter(e => isSameDay(new Date(e.date), day));
          return (
            <div 
              key={i} 
              className={`${view === 'month' ? 'min-h-[140px] p-3 border-r border-b border-zinc-100 last:border-r-0' : 'p-6 flex gap-8 items-start'} transition-all ${
                !isSameMonth(day, monthStart) && view === 'month' ? 'bg-zinc-50/30' : ''
              } ${view === 'week' ? 'bg-white hover:bg-zinc-50/50' : ''}`}
            >
              <div className={view === 'month' ? 'flex justify-between items-start mb-3' : 'flex flex-col items-center w-20 flex-shrink-0'}>
                <span className={`text-sm font-bold ${
                  isSameDay(day, new Date()) ? 'w-8 h-8 bg-emerald-500 text-white rounded-full flex items-center justify-center shadow-lg shadow-emerald-100' : 'text-zinc-400'
                }`}>
                  {format(day, 'd')}
                </span>
                <span className={`font-bold uppercase tracking-wider mt-1 ${
                  view === 'month' ? 'text-[10px] text-zinc-300' : 'text-xs text-zinc-500'
                }`}>
                  {format(day, 'EEE')}
                </span>
              </div>
              <div className={`space-y-2 ${view === 'month' ? 'max-h-[200px] overflow-y-auto' : 'flex-1'}`}>
                {dayEvents.length > 0 ? (
                  <div className={view === 'month' ? 'space-y-2' : 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3'}>
                    {dayEvents.map(event => (
                      <button
                        key={event.id}
                        onClick={() => setSelectedEvent(event)}
                        className={`w-full text-left p-2.5 rounded-xl text-xs font-bold transition-all border group relative overflow-hidden flex flex-col gap-1 ${
                          event.executionScore === 'green' ? 'bg-emerald-50 border-emerald-200 text-emerald-700' :
                          event.executionScore === 'yellow' ? 'bg-amber-50 border-amber-200 text-amber-700' :
                          event.executionScore === 'red' ? 'bg-rose-50 border-rose-200 text-rose-700' :
                          event.completed ? 'bg-zinc-100 border-zinc-200 text-zinc-600' :
                          'bg-white border-zinc-100 text-zinc-900 shadow-sm hover:border-emerald-200 hover:shadow-md'
                        }`}
                      >
                        <div className="flex items-center gap-1.5 w-full">
                          {event.completed ? <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0" /> : <Circle className="w-3.5 h-3.5 flex-shrink-0" />}
                          <span className="truncate block w-full leading-tight pr-1">{event.title}</span>
                        </div>
                        <div className="flex items-center justify-between opacity-60 text-[10px] w-full">
                          <span className="flex-shrink-0">{event.duration}m</span>
                          <span className="uppercase truncate ml-2 text-right">{event.intensity}</span>
                        </div>
                      </button>
                    ))}
                  </div>
                ) : (
                  view === 'week' && <p className="text-zinc-300 text-xs italic py-2">No workouts scheduled</p>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Execution Modal */}
      {selectedEvent && (
        <div className="fixed inset-0 bg-zinc-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-6">
          <div className="bg-white rounded-[2rem] w-full max-w-lg shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="p-8 border-b border-zinc-100 bg-zinc-50/50">
              <div className="flex items-center justify-between mb-4">
                <span className="text-xs font-bold text-emerald-600 uppercase tracking-widest">Log Execution</span>
                <button onClick={() => setSelectedEvent(null)} className="text-zinc-400 hover:text-zinc-600">
                  <X className="w-6 h-6" />
                </button>
              </div>
              <h3 className="text-2xl font-bold text-zinc-900 mb-2">{selectedEvent.title}</h3>
              <p className="text-zinc-500 text-sm">{selectedEvent.description}</p>
            </div>
            
            <div className="p-8 space-y-6">
              {selectedEvent.executionScore && (
                <div className={`p-4 rounded-2xl flex items-center gap-3 ${
                  selectedEvent.executionScore === 'green' ? 'bg-emerald-50 text-emerald-700' :
                  selectedEvent.executionScore === 'yellow' ? 'bg-amber-50 text-amber-700' :
                  'bg-rose-50 text-rose-700'
                }`}>
                  <Star className="w-5 h-5 fill-current" />
                  <div>
                    <p className="font-bold text-sm uppercase tracking-wider">AI Execution Score: {selectedEvent.executionScore}</p>
                    <p className="text-xs opacity-80">{selectedEvent.executionNotes}</p>
                  </div>
                </div>
              )}

              <div>
                <label className="block text-sm font-bold text-zinc-700 mb-3 flex items-center gap-2">
                  <MessageSquare className="w-4 h-4" />
                  {selectedEvent.executionScore ? 'Update your notes' : 'How did it go?'}
                </label>
                <textarea
                  value={executionNotes}
                  onChange={(e) => setExecutionNotes(e.target.value)}
                  placeholder="Describe your session, effort, and any pain or fatigue..."
                  className="w-full bg-zinc-50 border border-zinc-200 rounded-2xl p-4 text-sm focus:ring-2 focus:ring-emerald-500 outline-none transition-all h-32 resize-none"
                />
              </div>

              <div className="flex gap-3">
                <button
                  onClick={analyzeExecution}
                  disabled={!executionNotes.trim() || isAnalyzing}
                  className="flex-1 bg-zinc-900 hover:bg-zinc-800 disabled:opacity-50 text-white font-bold py-4 rounded-2xl transition-all flex items-center justify-center gap-2"
                >
                  {isAnalyzing ? <Loader2 className="w-5 h-5 animate-spin" /> : <Star className="w-5 h-5" />}
                  {selectedEvent.executionScore ? 'Re-analyze' : 'Analyze with AI'}
                </button>
                <button
                  onClick={() => onSelectEvent(selectedEvent)}
                  className="px-6 py-4 bg-zinc-100 hover:bg-zinc-200 text-zinc-600 font-bold rounded-2xl transition-all"
                >
                  Toggle Done
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
