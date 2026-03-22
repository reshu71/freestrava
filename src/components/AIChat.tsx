import React, { useState, useRef, useEffect } from 'react';
import { GoogleGenAI, Type } from "@google/genai";
import { UserProfile, Activity, TrainingPlan, CalendarEvent, ChatMessage } from '../types';
import { Send, Loader2, Bot, User, Sparkles, Calendar as CalendarIcon, RefreshCw } from 'lucide-react';
import Markdown from 'react-markdown';

interface AIChatProps {
  userProfile: UserProfile | null;
  activities: Activity[];
  currentPlan: TrainingPlan | null;
  onPlanGenerated: (plan: TrainingPlan, events: CalendarEvent[]) => void;
}

export default function AIChat({ userProfile, activities, currentPlan, onPlanGenerated }: AIChatProps) {
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
        model: "gemini-3-flash-preview",
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
    <div className="flex flex-col h-[calc(100vh-8rem)] bg-white rounded-3xl border border-zinc-200 shadow-sm overflow-hidden">
      {/* Chat Header */}
      <div className="p-6 border-b border-zinc-100 bg-zinc-50/50 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-emerald-500 rounded-xl flex items-center justify-center shadow-lg shadow-emerald-200">
            <Bot className="w-6 h-6 text-white" />
          </div>
          <div>
            <h2 className="font-bold text-zinc-900">Veloce AI Coach</h2>
            <p className="text-xs text-zinc-500 flex items-center gap-1">
              <Sparkles className="w-3 h-3 text-emerald-500" />
              Powered by Gemini
            </p>
          </div>
        </div>
        <button 
          onClick={clearChat}
          className="text-xs font-bold text-zinc-400 hover:text-rose-500 transition-colors flex items-center gap-1"
        >
          <RefreshCw className="w-3 h-3" />
          Clear Chat
        </button>
      </div>

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`flex gap-3 max-w-[80%] ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                msg.role === 'user' ? 'bg-zinc-100' : 'bg-emerald-100'
              }`}>
                {msg.role === 'user' ? <User className="w-5 h-5 text-zinc-600" /> : <Bot className="w-5 h-5 text-emerald-600" />}
              </div>
              <div className={`p-4 rounded-2xl ${
                msg.role === 'user' ? 'bg-zinc-900 text-white rounded-tr-none' : 'bg-zinc-50 text-zinc-800 rounded-tl-none border border-zinc-100'
              }`}>
                <div className="prose prose-sm max-w-none prose-zinc dark:prose-invert">
                  <Markdown>{msg.text}</Markdown>
                </div>
                {msg.role === 'model' && pendingPlan && i === messages.length - 1 && (
                  <div className="mt-4 flex gap-2">
                    <button 
                      onClick={confirmPlan}
                      className="bg-emerald-500 hover:bg-emerald-600 text-white px-4 py-2 rounded-xl text-sm font-bold transition-all flex items-center gap-2"
                    >
                      <RefreshCw className="w-4 h-4" />
                      Replace Current Plan
                    </button>
                    <button 
                      onClick={() => setPendingPlan(null)}
                      className="bg-zinc-200 hover:bg-zinc-300 text-zinc-700 px-4 py-2 rounded-xl text-sm font-bold transition-all"
                    >
                      Ignore
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}
        {isLoading && (
          <div className="flex justify-start">
            <div className="flex gap-3">
              <div className="w-8 h-8 rounded-lg bg-emerald-100 flex items-center justify-center">
                <Bot className="w-5 h-5 text-emerald-600" />
              </div>
              <div className="bg-zinc-50 p-4 rounded-2xl rounded-tl-none border border-zinc-100">
                <Loader2 className="w-5 h-5 text-emerald-500 animate-spin" />
              </div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="p-6 border-t border-zinc-100 bg-zinc-50/50">
        <div className="relative">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
            placeholder="Ask your coach anything..."
            className="w-full bg-white border border-zinc-200 rounded-2xl pl-6 pr-14 py-4 focus:ring-2 focus:ring-emerald-500 outline-none transition-all shadow-sm"
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || isLoading}
            className="absolute right-2 top-2 bottom-2 bg-zinc-900 hover:bg-zinc-800 disabled:opacity-50 text-white px-4 rounded-xl transition-all"
          >
            <Send className="w-5 h-5" />
          </button>
        </div>
      </div>
    </div>
  );
}
