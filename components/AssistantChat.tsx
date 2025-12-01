import React, { useState, useRef, useEffect } from 'react';
import { ChatMessage, AssistantContext, Template, DraftResult } from '../types';
import { chatWithAssistant } from '../services/geminiService';

interface AssistantChatProps {
  templates: Template[];
  currentRequest: string;
  currentDraft: DraftResult | null;
  onUpdateRequest: (text: string, action: 'append' | 'replace') => void;
  onUpdateDraftContent: (html: string) => void;
}

export const AssistantChat: React.FC<AssistantChatProps> = ({
  templates,
  currentRequest,
  currentDraft,
  onUpdateRequest,
  onUpdateDraftContent
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isHovered, setIsHovered] = useState(false); // State for button hover effect
  
  const containerRef = useRef<HTMLDivElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Click outside to minimize
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node) && isOpen) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  // Scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isOpen]);

  const handleSendMessage = async (audioBlob?: Blob) => {
    if (!inputText.trim() && !audioBlob) return;

    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      text: inputText,
      audioData: audioBlob ? await blobToBase64(audioBlob) : undefined
    };

    setMessages(prev => [...prev, userMessage]);
    setInputText('');
    setIsProcessing(true);

    try {
      const context: AssistantContext = {
        templates,
        currentRequest,
        currentDraft
      };

      const response = await chatWithAssistant(messages, userMessage, context);
      
      const responseText = response.text || "Xin lỗi, em không thể trả lời lúc này.";
      
      setMessages(prev => [...prev, {
        id: crypto.randomUUID(),
        role: 'model',
        text: responseText
      }]);

      // Check for function calls
      const functionCalls = response.functionCalls;
      if (functionCalls && functionCalls.length > 0) {
        for (const call of functionCalls) {
          if (call.name === 'update_request') {
             const args = call.args as any;
             onUpdateRequest(args.new_request, args.action);
             setMessages(prev => [...prev, {
                id: crypto.randomUUID(),
                role: 'model',
                text: `✅ Em đã cập nhật yêu cầu soạn thảo: ${args.action === 'append' ? 'thêm mới' : 'thay thế'}.`
             }]);
          } else if (call.name === 'update_document_html') {
             const args = call.args as any;
             onUpdateDraftContent(args.html_content);
             setMessages(prev => [...prev, {
                id: crypto.randomUUID(),
                role: 'model',
                text: `✅ Em đã chỉnh sửa nội dung văn bản trực tiếp.`
             }]);
          }
        }
      }

    } catch (error) {
      console.error(error);
      setMessages(prev => [...prev, {
        id: crypto.randomUUID(),
        role: 'model',
        text: "Có lỗi xảy ra khi kết nối với AI.",
        isError: true
      }]);
    } finally {
      setIsProcessing(false);
    }
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/wav' });
        handleSendMessage(audioBlob);
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
    } catch (err) {
      alert("Không thể truy cập microphone.");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  const blobToBase64 = (blob: Blob): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const result = reader.result as string;
        resolve(result.split(',')[1]);
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  };

  return (
    <div ref={containerRef} className="fixed bottom-6 right-6 z-[100] flex flex-col items-end pointer-events-auto">
      {/* Chat Window */}
      {isOpen && (
        <div className="bg-white w-96 h-[500px] rounded-xl shadow-2xl border border-legal-200 flex flex-col mb-4 overflow-hidden animate-fade-in origin-bottom-right">
          <div className="bg-blue-600 p-4 flex justify-between items-center text-white shrink-0">
             <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center">
                    <i className="fas fa-comment-dots text-lg"></i>
                </div>
                <div>
                    <h3 className="font-bold text-base">AI của anh Cường</h3>
                    <span className="text-xs text-blue-100 flex items-center gap-1">
                        Trợ lý ảo thông minh
                    </span>
                </div>
             </div>
             <button onClick={() => setIsOpen(false)} className="text-white/80 hover:text-white w-8 h-8 rounded-full hover:bg-white/10 flex items-center justify-center transition-colors">
                <i className="fas fa-times text-lg"></i>
             </button>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-slate-50">
            {messages.length === 0 && (
                <div className="text-center text-slate-400 text-sm py-10">
                    <i className="fas fa-robot text-4xl mb-3 opacity-30"></i>
                    <p className="font-medium text-slate-600 mb-1">Em chào anh Cường!</p>
                    <p>Anh muốn gì ở em???</p>
                </div>
            )}
            {messages.map((msg) => (
              <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] rounded-2xl px-4 py-2 text-sm shadow-sm leading-relaxed ${
                    msg.role === 'user' 
                    ? 'bg-blue-600 text-white rounded-br-none' 
                    : 'bg-white border border-slate-200 text-slate-800 rounded-bl-none'
                }`}>
                    {msg.audioData && (
                         <div className="mb-1 text-xs opacity-70 flex items-center gap-1">
                             <i className="fas fa-microphone"></i> Ghi âm giọng nói
                         </div>
                    )}
                    {msg.text}
                </div>
              </div>
            ))}
            {isProcessing && (
                 <div className="flex justify-start">
                     <div className="bg-white border border-slate-200 rounded-2xl rounded-bl-none px-4 py-3 shadow-sm flex gap-1">
                         <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce"></div>
                         <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{animationDelay: '0.1s'}}></div>
                         <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{animationDelay: '0.2s'}}></div>
                     </div>
                 </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          <div className="p-3 bg-white border-t border-legal-100">
             <div className="flex items-center gap-2 bg-slate-100 rounded-full px-2 py-1 border border-slate-200 focus-within:ring-2 focus-within:ring-blue-500/20 focus-within:border-blue-400 transition-all">
                {inputText.trim() ? (
                    <div className="w-8 h-8 flex items-center justify-center text-slate-400">
                        <i className="fas fa-keyboard"></i>
                    </div>
                ) : (
                    <button 
                        onMouseDown={startRecording}
                        onMouseUp={stopRecording}
                        onMouseLeave={stopRecording}
                        disabled={isProcessing}
                        className={`w-8 h-8 flex items-center justify-center rounded-full transition-all cursor-pointer ${
                            isRecording 
                            ? 'text-red-500 animate-pulse' 
                            : 'text-slate-400 hover:text-blue-600'
                        }`}
                        title="Giữ để nói"
                    >
                         <i className={`fas ${isRecording ? 'fa-stop-circle text-xl' : 'fa-microphone text-lg'}`}></i>
                     </button>
                )}

                <input 
                    type="text"
                    className="flex-1 bg-transparent border-none outline-none text-sm px-2 py-2 text-slate-700 placeholder-slate-400"
                    placeholder="Nhập yêu cầu..."
                    value={inputText}
                    onChange={(e) => setInputText(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
                    disabled={isProcessing || isRecording}
                />
                
                <button 
                   onClick={() => handleSendMessage()}
                   disabled={isProcessing || (!inputText.trim() && !isRecording)}
                   className={`w-8 h-8 flex items-center justify-center rounded-full transition-colors shadow-sm ${
                       inputText.trim() 
                       ? 'bg-blue-600 text-white hover:bg-blue-700' 
                       : 'bg-slate-200 text-slate-400'
                   }`}
                >
                    <i className="fas fa-paper-plane text-xs"></i>
                </button>
             </div>
          </div>
        </div>
      )}

      {/* Floating Shortcut Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        className={`
            shadow-2xl flex items-center justify-center transition-all duration-300 ease-out z-50 overflow-hidden
            ${isOpen 
                ? 'w-14 h-14 rounded-full bg-slate-700 text-white hover:bg-slate-600' 
                : 'h-14 bg-blue-600 text-white rounded-full hover:bg-blue-700'
            }
        `}
        style={{
            minWidth: '3.5rem', // w-14
            paddingRight: !isOpen && isHovered ? '1.5rem' : '0', // Adjust padding for text expansion
        }}
        title="AI của anh Cường"
      >
        <div className={`flex items-center justify-center shrink-0 ${!isOpen ? 'w-14' : 'w-14'}`}>
            {isOpen ? <i className="fas fa-times text-xl"></i> : <i className="fas fa-comment-dots text-2xl"></i>}
        </div>
        
        {!isOpen && (
            <span className={`
                whitespace-nowrap transition-all duration-300 font-bold text-sm
                ${isHovered ? 'max-w-[200px] opacity-100 ml-1' : 'max-w-0 opacity-0 ml-0'}
            `}>
                AI của anh Cường
            </span>
        )}
      </button>
    </div>
  );
};
