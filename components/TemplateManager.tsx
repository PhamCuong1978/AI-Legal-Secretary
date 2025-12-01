import React, { useState, useRef } from 'react';
import { Template } from '../types';
import { analyzeTemplate } from '../services/geminiService';

interface TemplateManagerProps {
  templates: Template[];
  onAddTemplate: (template: Template) => void;
  onDeleteTemplate: (id: string) => void;
}

export const TemplateManager: React.FC<TemplateManagerProps> = ({ templates, onAddTemplate, onDeleteTemplate }) => {
  const [inputText, setInputText] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [viewingTemplate, setViewingTemplate] = useState<Template | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleAnalyze = async (manualInput?: { 
    text?: string, 
    fileData?: { data: string, mimeType: string },
    originalFile?: { name: string, data: string, mimeType: string } 
  }) => {
    const textToAnalyze = manualInput?.text || inputText;
    const fileToAnalyze = manualInput?.fileData;

    if (!textToAnalyze && !fileToAnalyze) return;

    setIsAnalyzing(true);
    setError(null);

    try {
      const result = await analyzeTemplate({
          text: textToAnalyze || undefined,
          inlineData: fileToAnalyze
      });

      if (result.name && result.structure) {
        const newTemplate: Template = {
          id: crypto.randomUUID(),
          name: result.name,
          category: result.category || 'General',
          description: result.description || 'Custom uploaded template',
          structure: result.structure,
          placeholders: result.placeholders || [],
          createdAt: Date.now(),
          originalFile: manualInput?.originalFile
        };
        onAddTemplate(newTemplate);
        setInputText('');
        if (fileInputRef.current) fileInputRef.current.value = '';
      } else {
        throw new Error("Could not extract valid template structure.");
      }
    } catch (err: any) {
      setError("Failed to analyze template. " + (err.message || "Please ensure the API key is set."));
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsAnalyzing(true);
    setError(null);

    try {
        const fileType = file.type;
        const fileName = file.name;
        
        // Helper to read file as Base64 for STORAGE
        const getBase64 = (file: File): Promise<string> => {
            return new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => {
                    const res = reader.result as string;
                    // Remove data:mime/type;base64, prefix
                    resolve(res.split(',')[1]);
                };
                reader.onerror = reject;
                reader.readAsDataURL(file);
            });
        };

        const base64Data = await getBase64(file);
        
        // Prepare storage object
        const originalFileObj = {
            name: fileName,
            data: base64Data,
            mimeType: fileType || 'application/octet-stream'
        };

        // Analysis Logic
        // 1. Image or PDF: Send directly to Gemini as Base64
        if (fileType.startsWith('image/') || fileType === 'application/pdf') {
            handleAnalyze({ 
                fileData: { data: base64Data, mimeType: fileType },
                originalFile: originalFileObj
            });
        } 
        // 2. Word (.docx): Use Mammoth to extract text
        else if (fileName.toLowerCase().endsWith('.docx')) {
            const arrayBuffer = await file.arrayBuffer();
            // @ts-ignore
            const result = await window.mammoth.extractRawText({ arrayBuffer: arrayBuffer });
            handleAnalyze({ 
                text: result.value,
                originalFile: originalFileObj
            });
        }
        // 3. Excel (.xlsx, .xls): Use XLSX (SheetJS) to extract text
        else if (fileName.toLowerCase().endsWith('.xlsx') || fileName.toLowerCase().endsWith('.xls')) {
            const arrayBuffer = await file.arrayBuffer();
            // @ts-ignore
            const workbook = window.XLSX.read(arrayBuffer, { type: 'array' });
            const firstSheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[firstSheetName];
            // @ts-ignore
            const text = window.XLSX.utils.sheet_to_csv(worksheet);
            handleAnalyze({ 
                text: text,
                originalFile: originalFileObj 
            });
        }
        // 4. Text / HTML / Markdown
        else if (fileType === 'text/plain' || fileType === 'text/html' || fileName.toLowerCase().endsWith('.md')) {
             const text = await file.text();
             handleAnalyze({ 
                 text: text,
                 originalFile: originalFileObj
             });
        } 
        else {
            throw new Error("Định dạng file không hỗ trợ. Vui lòng dùng: Word, Excel, PDF, Ảnh, Text, HTML.");
        }

    } catch (err: any) {
        setError("Lỗi đọc file: " + err.message);
        setIsAnalyzing(false);
    }
  };

  const downloadOriginalFile = (fileData: { name: string, data: string, mimeType: string }) => {
      const link = document.createElement('a');
      link.href = `data:${fileData.mimeType};base64,${fileData.data}`;
      link.download = fileData.name;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
  };

  return (
    <div className="flex flex-col h-full bg-white rounded-lg shadow-sm border border-legal-200 overflow-hidden relative">
      <div className="p-6 border-b border-legal-200 bg-legal-50">
        <h2 className="text-xl font-bold text-legal-900 mb-2">Thư viện Mẫu văn bản</h2>
        <p className="text-sm text-slate-600">
          AI sẽ tự động học cấu trúc và văn phong từ các mẫu bạn nhập vào hoặc tải lên.
        </p>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {/* Input Section */}
        <div className="bg-slate-50 p-4 rounded-lg border border-legal-200 relative">
          {isAnalyzing && (
            <div className="absolute inset-0 bg-white/80 z-10 flex items-center justify-center rounded-lg backdrop-blur-sm">
                <div className="flex flex-col items-center">
                    <i className="fas fa-spinner fa-spin text-legal-600 text-3xl mb-2"></i>
                    <span className="text-legal-800 font-medium">Đang phân tích mẫu & lưu file...</span>
                </div>
            </div>
          )}

          <div className="mb-4">
             <label className="block text-sm font-medium text-slate-700 mb-2">
                Cách 1: Tải lên file mẫu
             </label>
             <div className="flex gap-2">
                 <input 
                    type="file" 
                    ref={fileInputRef}
                    onChange={handleFileUpload}
                    accept=".docx,.xlsx,.xls,.pdf,.txt,.html,.md,.png,.jpg,.jpeg,.webp"
                    className="block w-full text-sm text-slate-500
                        file:mr-4 file:py-2 file:px-4
                        file:rounded-full file:border-0
                        file:text-sm file:font-semibold
                        file:bg-legal-50 file:text-legal-700
                        hover:file:bg-legal-100
                        cursor-pointer border border-dashed border-legal-300 rounded-lg p-2"
                 />
             </div>
             <p className="text-xs text-slate-400 mt-1 pl-2">
                Hỗ trợ: Word (.docx), Excel (.xlsx), PDF, HTML, Ảnh, Text.
             </p>
          </div>
          
          <div className="relative flex items-center py-2">
            <div className="flex-grow border-t border-legal-200"></div>
            <span className="flex-shrink-0 mx-4 text-legal-400 text-xs uppercase">Hoặc nhập nội dung</span>
            <div className="flex-grow border-t border-legal-200"></div>
          </div>

          <label className="block text-sm font-medium text-slate-700 mb-2">
            Cách 2: Dán nội dung văn bản
          </label>
          <textarea
            className="w-full h-32 p-3 text-sm border border-slate-300 rounded focus:ring-2 focus:ring-legal-600 focus:border-transparent outline-none resize-none"
            placeholder="Ví dụ: CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM..."
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
          />
          <div className="mt-3 flex items-center justify-between">
             <div className="text-xs text-red-500 font-medium">{error}</div>
            <button
              onClick={() => handleAnalyze()}
              disabled={isAnalyzing || !inputText.trim()}
              className={`px-4 py-2 rounded text-sm font-medium text-white transition-colors
                ${isAnalyzing || !inputText.trim() 
                  ? 'bg-slate-400 cursor-not-allowed' 
                  : 'bg-legal-600 hover:bg-legal-800'}`}
            >
              <i className="fas fa-magic mr-2"></i>Học mẫu này
            </button>
          </div>
        </div>

        {/* List Section */}
        <div>
          <h3 className="text-sm font-bold text-slate-500 uppercase tracking-wider mb-3">
            Mẫu đã lưu ({templates.length})
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 gap-4">
            {templates.map((tpl) => (
              <div key={tpl.id} className="p-4 border border-slate-200 rounded-lg hover:border-legal-400 transition-all bg-white group flex flex-col">
                <div className="flex justify-between items-start mb-2">
                  <span className="inline-block px-2 py-1 text-xs font-semibold bg-blue-100 text-blue-800 rounded">
                    {tpl.category}
                  </span>
                  <span className="text-xs text-slate-400">
                    {new Date(tpl.createdAt).toLocaleDateString('vi-VN')}
                  </span>
                </div>
                <h4 className="font-semibold text-legal-900 truncate mb-1" title={tpl.name}>{tpl.name}</h4>
                <p className="text-xs text-slate-500 line-clamp-2 mb-3 flex-1">{tpl.description}</p>
                <div className="flex justify-between items-center mt-auto pt-3 border-t border-slate-100">
                    <div className="flex gap-2">
                        {tpl.originalFile && (
                            <button 
                                onClick={(e) => { e.stopPropagation(); downloadOriginalFile(tpl.originalFile!); }}
                                title={`Tải file gốc: ${tpl.originalFile.name}`}
                                className="text-xs bg-slate-100 border border-slate-200 text-slate-600 hover:bg-slate-200 hover:text-slate-800 px-2 py-1 rounded transition-colors"
                            >
                                <i className="fas fa-paperclip"></i> File gốc
                            </button>
                        )}
                        <span className="text-xs text-slate-400 flex items-center">
                            <i className="fas fa-tags mr-1"></i>
                            {tpl.placeholders.length} biến
                        </span>
                    </div>
                    <div className="flex gap-2">
                        <button 
                            onClick={(e) => {
                                e.stopPropagation();
                                if (confirm('Bạn có chắc chắn muốn xóa mẫu này không?')) {
                                    onDeleteTemplate(tpl.id);
                                }
                            }}
                            className="text-xs bg-white border border-red-200 text-red-600 hover:bg-red-50 hover:text-red-800 px-3 py-1.5 rounded transition-colors flex items-center gap-1 shadow-sm"
                            title="Xóa mẫu"
                        >
                            <i className="fas fa-trash-alt"></i>
                        </button>
                        <button 
                            onClick={() => setViewingTemplate(tpl)}
                            className="text-xs bg-white border border-legal-200 text-legal-700 hover:bg-legal-50 hover:text-legal-900 px-3 py-1.5 rounded transition-colors flex items-center gap-1 shadow-sm"
                        >
                            <i className="fas fa-eye text-legal-500"></i> Xem mẫu
                        </button>
                    </div>
                </div>
              </div>
            ))}
          </div>
          {templates.length === 0 && (
            <div className="text-center py-10 text-slate-400">
              Chưa có mẫu nào. Hãy nhập mẫu đầu tiên để bắt đầu.
            </div>
          )}
        </div>
      </div>

      {/* Template Preview Modal */}
      {viewingTemplate && (
          <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
              <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl h-[90%] flex flex-col overflow-hidden animate-fade-in">
                  <div className="flex justify-between items-center px-6 py-4 border-b border-legal-100 bg-legal-50 shrink-0">
                      <div>
                          <h3 className="font-bold text-lg text-legal-900">{viewingTemplate.name}</h3>
                          <span className="text-xs text-slate-500">{viewingTemplate.category}</span>
                      </div>
                      <button 
                          onClick={() => setViewingTemplate(null)}
                          className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-slate-200 text-slate-500 transition-colors"
                      >
                          <i className="fas fa-times text-lg"></i>
                      </button>
                  </div>
                  
                  <div className="flex-1 overflow-y-auto p-8 bg-slate-200/50">
                      <div className="bg-white max-w-3xl mx-auto shadow-lg min-h-full p-12">
                           <div 
                                className="font-serif text-slate-900 leading-relaxed text-justify whitespace-pre-wrap"
                                style={{ fontFamily: '"Times New Roman", Times, serif', fontSize: '13pt' }}
                           >
                               {viewingTemplate.structure}
                           </div>
                      </div>
                  </div>
                  
                  <div className="px-6 py-3 border-t border-legal-100 bg-white flex justify-between items-center shrink-0">
                      <div className="text-xs text-slate-500 flex items-center gap-4">
                          <span>ID: <span className="font-mono">{viewingTemplate.id}</span></span>
                          {viewingTemplate.originalFile && (
                              <span className="flex items-center gap-1 text-blue-600">
                                  <i className="fas fa-file-alt"></i> 
                                  {viewingTemplate.originalFile.name}
                              </span>
                          )}
                      </div>
                      <div className="flex gap-2">
                          <span className="text-xs font-semibold text-legal-600 bg-legal-50 px-2 py-1 rounded border border-legal-100">
                              {viewingTemplate.placeholders.length} trường dữ liệu
                          </span>
                      </div>
                  </div>
              </div>
          </div>
      )}
    </div>
  );
};