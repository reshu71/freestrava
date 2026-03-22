import React, { useState, useRef, useEffect } from 'react';
import { GoogleGenAI, Type } from "@google/genai";
import { UserProfile, Activity, TrainingPlan, CalendarEvent, ChatMessage } from '../types';
import { Send, Loader2, Bot, User, Sparkles, Calendar as CalendarIcon, RefreshCw } from 'lucide-react';
import Markdown from 'react-markdown';
import { getMockAIResponse, MOCK_NEW_PLAN, MOCK_NEW_EVENTS } from '../mockData';

interface AIChatProps {
  userProfile: UserProfile | null;
  activities: Activity[];
  currentPlan: TrainingPlan | null;
  onPlanGenerated: (plan: TrainingPlan, events: CalendarEvent[]) => void;
  isDemoMode?: boolean;
}

export default function AIChat({ userProfile, activities, currentPlan, onPlanGenerated, isDemoMode }: AIChatProps) {
  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    const saved = localStorage.getItem('veloce_chat_history');
    return saved ? JSON.parse(saved) : [
      { role: 'model', text: "Hello! I'm your Veloce AI coach. I have access to your Strava data and training history. How can I help you today? You can ask me about your progress, get nutritional advice, or even ask for a new training plan!" }
    ];
  });
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [pendingPlan, setPendingPlan] = useState<{ plan: TrainingPlan, events: CalendarEvent[] } | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    localStorage.setItem('veloce_chat_history', JSON.stringify(messages));
  }, [messages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const generatePlanSchema = {
    type: Type.OBJECT,
    properties: {
      plan: {
        type: Type.OBJECT,
        properties: {
          title: { type: Type.STRING },
          description: { type: Type.STRING },
          startDate: { type: Type.STRING },
          endDate: { type: Type.STRING },
        },
        required: ["title", "description", "startDate", "endDate"]
      },
      events: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            title: { type: Type.STRING },
            description: { type: Type.STRING },
            date: { type: Type.STRING },
            duration: { type: Type.NUMBER },
            intensity: { type: Type.STRING, enum: ["low", "moderate", "high"] },
          },
          required: ["title", "description", "date", "duration", "intensity"]
        }
      }
    },
    required: ["plan", "events"]
  };

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

    const userMessage = input.trim();
    setInput('');
    setMessages(prev => [...prev, { role: 'user', text: userMessage }]);
    setIsLoading(true);

    if (isDemoMode) {
      setTimeout(() => {
        const mockText = getMockAIResponse(userMessage);
        
        // Trigger plan generation state if relevant
        if (userMessage.toLowerCase().includes('plan') || userMessage.toLowerCase().includes('replace')) {
          setPendingPlan({ plan: MOCK_NEW_PLAN, events: MOCK_NEW_EVENTS });
        }

        setMessages(prev => [...prev, { role: 'model', text: mockText }]);
        setIsLoading(false);
      }, 1000);
      return;
    }

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
      
      const context = `
        User Profile: ${JSON.stringify(userProfile)}
        Recent Activities (Last 30): ${JSON.stringify(activities.slice(0, 30))}
        Current Plan: ${JSON.stringify(currentPlan)}
        Current Date: ${new Date().toISOString().split('T')[0]}
        
        Instructions:
        - Analyze the user's training consistency and intensity.
        - If they ask "how is my training going", look at their recent activities vs their plan.
        - If they ask to "modify" or "adjust" a plan, use the 'generate_plan' tool to create a revised version.
        - Provide specific feedback on their execution scores (green/yellow/red) if available in activities.
      `;

      const systemInstruction = `
        You are Veloce AI, an elite endurance sports coach (specializing in Triathlon, Marathons, and Ultra-endurance).
        Your goal is to provide world-class coaching based on the user's real data.
        
        Capabilities:
        1. Analyze training progress: Compare activities to the current plan.
        2. Suggest intensity: Based on recent fatigue (volume) and execution scores.
        3. Generate/Modify plans: Use the 'generate_plan' tool.
        4. Nutrition: Provide endurance-specific fueling advice.
        
        Tone: Professional, data-driven, encouraging, and precise.
        
        When generating a plan:
        - Ensure it's tailored to their fitness level (${userProfile?.fitnessLevel || 'beginner'}).
        - Include a mix of base, interval, and recovery sessions.
      `;

      const response = await ai.models.generateContent({
        model: "gemini-1.5-flash-latest",
        contents: [
          { role: 'user', parts: [{ text: `Context: ${context}\n\nUser: ${userMessage}` }] }
        ],
        config: {
          systemInstruction,
          tools: [
            {
              functionDeclarations: [
                {
                  name: "generate_plan",
                  description: "Generates a structured training plan with daily events based on user goals and history.",
                  parameters: generatePlanSchema
                }
              ]
            }
          ]
        }
      });

      const functionCalls = response.functionCalls;
      if (functionCalls && functionCalls.length > 0) {
        const call = functionCalls[0];
        if (call.name === "generate_plan") {
          const args = call.args as any;
          const newPlan: TrainingPlan = {
            ...args.plan,
            userId: userProfile?.uid || '',
            status: 'active'
          };
          const newEvents: CalendarEvent[] = args.events.map((e: any) => ({
            ...e,
            userId: userProfile?.uid || '',
            completed: false
          }));

          setPendingPlan({ plan: newPlan, events: newEvents });
          setMessages(prev => [...prev, { 
            role: 'model', 
            text: `I've generated a new training plan: **${newPlan.title}**. Would you like to replace your current plan with this one?` 
          }]);
        }
      } else {
        setMessages(prev => [...prev, { role: 'model', text: response.text || "I'm sorry, I couldn't process that." }]);
      }
    } catch (error) {
      console.error("AI Chat error:", error);
      setMessages(prev => [...prev, { role: 'model', text: "Sorry, I encountered an error. Please try again." }]);
    } finally {
      setIsLoading(false);
    }
  };

  const confirmPlan = () => {
    if (pendingPlan) {
      onPlanGenerated(pendingPlan.plan, pendingPlan.events);
      setPendingPlan(null);
      setMessages(prev => [...prev, { role: 'model', text: "Great! Your new training plan has been populated in the calendar." }]);
    }
  };

  const clearChat = () => {
    const initialMessage: ChatMessage = { role: 'model', text: "Hello! I'm your Veloce AI coach. I have access to your Strava data and training history. How can I help you today?" };
    setMessages([initialMessage]);
    localStorage.removeItem('veloce_chat_history');
  };

  return (
    <div className="flex flex-col h-[calc(100vh-10rem)] bg-[#1F1F1F] rounded-[2rem] border border-white/5 shadow-2xl overflow-hidden animate-kaizen">
      {/* Chat Header */}
      <div className="p-8 border-b border-white/5 bg-white/5 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-[#FC4C02] rounded-2xl flex items-center justify-center shadow-2xl shadow-orange-500/20">
            <Bot className="w-7 h-7 text-white" />
          </div>
          <div>
            <h2 className="text-xl font-black tracking-tighter text-white uppercase">COACH PROTOCOL</h2>
            <p className="text-xs text-zinc-500 flex items-center gap-1 font-bold uppercase tracking-widest">
              <Sparkles className="w-3 h-3 text-[#FC4C02]" />
              AI ACTIVE
            </p>
          </div>
        </div>
        <button 
          onClick={clearChat}
          className="text-xs font-black text-zinc-500 hover:text-[#FC4C02] transition-colors flex items-center gap-2 uppercase tracking-widest"
        >
          <RefreshCw className="w-3 h-3" />
          Reset Session
        </button>
      </div>

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto p-8 space-y-8 scroll-smooth">
        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`flex gap-4 max-w-[85%] ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 shadow-lg ${
                msg.role === 'user' ? 'bg-[#FC4C02]' : 'bg-white/10'
              }`}>
                {msg.role === 'user' ? <User className="w-6 h-6 text-white" /> : <Bot className="w-6 h-6 text-[#FC4C02]" />}
              </div>
              <div className={`p-6 rounded-[1.5rem] shadow-xl ${
                msg.role === 'user' 
                  ? 'bg-[#FC4C02] text-white rounded-tr-none shadow-orange-500/10' 
                  : 'bg-[#121212] text-zinc-200 rounded-tl-none border border-white/5'
              }`}>
                <div className={`prose prose-sm max-w-none ${msg.role === 'user' ? 'prose-invert' : 'prose-invert italic font-medium'}`}>
                  <Markdown>{msg.text}</Markdown>
                </div>
                {msg.role === 'model' && pendingPlan && i === messages.length - 1 && (
                  <div className="mt-6 flex flex-wrap gap-3">
                    <button 
                      onClick={confirmPlan}
                      className="strava-btn-primary px-5 py-3 text-sm"
                    >
                      <RefreshCw className="w-4 h-4" />
                      ACTIVATE PROTOCOL
                    </button>
                    <button 
                      onClick={() => setPendingPlan(null)}
                      className="strava-btn-secondary px-5 py-3 text-sm"
                    >
                      IGNORE
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}
        {isLoading && (
          <div className="flex justify-start">
            <div className="flex gap-4 animate-pulse">
              <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center shadow-lg">
                <Bot className="w-6 h-6 text-[#FC4C02]" />
              </div>
              <div className="bg-[#121212] p-6 rounded-[1.5rem] rounded-tl-none border border-white/5">
                <Loader2 className="w-6 h-6 text-[#FC4C02] animate-spin" />
              </div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="p-8 border-t border-white/5 bg-white/5">
        <div className="relative group/input">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
            placeholder="Command your coach..."
            className="w-full bg-[#121212] border border-white/10 rounded-2xl pl-8 pr-16 py-5 focus:ring-2 focus:ring-[#FC4C02] outline-none transition-all shadow-2xl text-white font-bold placeholder:text-zinc-600"
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || isLoading}
            className="absolute right-3 top-3 bottom-3 bg-[#FC4C02] hover:bg-[#E34402] disabled:opacity-30 text-white px-5 rounded-xl transition-all shadow-lg shadow-orange-500/20 active:scale-95 group-hover/input:scale-105"
          >
            <Send className="w-6 h-6" />
          </button>
        </div>
      </div>
    </div>
  );
}
