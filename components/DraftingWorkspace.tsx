import React, { useState, useRef, useEffect } from 'react';
import { DraftResult, Template } from '../types';
import { draftDocument } from '../services/geminiService';

interface DraftingWorkspaceProps {
  templates: Template[];
}

export const DraftingWorkspace: React.FC<DraftingWorkspaceProps> = ({ templates }) => {
  const [request, setRequest] = useState('');
  const [isDrafting, setIsDrafting] = useState(false);
  const [result, setResult] = useState<DraftResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  
  // State to track manual inputs for missing fields
  const [missingValues, setMissingValues] = useState<Record<string, string>>({});
  
  const resultRef = useRef<HTMLDivElement>(null);

  const handleDraft = async (supplementaryInfo?: string) => {
    const textToDraft = supplementaryInfo 
        ? `${request}\n\n[THÔNG TIN BỔ SUNG TỪ NGƯỜI DÙNG]:\n${supplementaryInfo}`
        : request;

    if (!textToDraft.trim()) return;
    
    setIsDrafting(true);
    setError(null);
    if (!supplementaryInfo) {
        setResult(null); // Only clear previous result if it's a fresh new draft
        setMissingValues({}); // Reset inputs
    }

    try {
      if (templates.length === 0) {
        throw new Error("Vui lòng thêm ít nhất một mẫu văn bản trước khi soạn thảo.");
      }
      const data = await draftDocument(textToDraft, templates);
      setResult(data);
      
      // If re-drafting, we might want to clear missing values that are now resolved,
      // but simpler to just let the user see the new state.
      // However, if the new result still has missing fields, we might want to keep the old values? 
      // For now, let's reset to avoid confusion.
      setMissingValues({});

    } catch (err: any) {
      setError(err.message || "Có lỗi xảy ra khi soạn thảo.");
    } finally {
      setIsDrafting(false);
    }
  };

  const handleRedraftWithMissingInfo = () => {
    // Convert missingValues object to a readable string
    const infoString = Object.entries(missingValues)
        .filter(([_, value]) => (value as string).trim() !== '')
        .map(([key, value]) => `- ${key}: ${value}`)
        .join('\n');
    
    if (!infoString) return;

    handleDraft(infoString);
  };

  const handleMissingValueChange = (field: string, value: string) => {
    setMissingValues(prev => ({
        ...prev,
        [field]: value
    }));
  };

  useEffect(() => {
    if (result && resultRef.current) {
        resultRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [result]);

  const downloadHTML = () => {
    if (!result) return;
    const element = document.createElement("a");
    const file = new Blob([
        `<html><head><meta charset='utf-8'><title>${result.selected_template}</title></head><body style="font-family: 'Times New Roman', serif; line-height: 1.5;">${result.document_html}</body></html>`
    ], {type: 'text/html'});
    element.href = URL.createObjectURL(file);
    element.download = `${result.selected_template.replace(/\s+/g, '_')}.html`;
    document.body.appendChild(element); 
    element.click();
    document.body.removeChild(element);
  };

  return (
    <div className="flex flex-col h-full gap-4">
      {/* Input Area */}
      <div className="bg-white p-6 rounded-lg shadow-sm border border-legal-200 shrink-0">
        <h2 className="text-lg font-bold text-legal-900 mb-4">
          <i className="fas fa-pen-nib text-legal-600 mr-2"></i>
          Yêu cầu soạn thảo
        </h2>
        <div className="relative">
          <textarea
            className="w-full h-32 p-4 pr-32 text-slate-700 bg-slate-50 border border-slate-300 rounded-lg focus:ring-2 focus:ring-legal-600 focus:border-transparent outline-none resize-none shadow-inner"
            placeholder="Ví dụ: Soạn thảo hợp đồng lao động cho ông Nguyễn Văn A, chức vụ Kỹ sư phần mềm, lương 20 triệu, bắt đầu từ ngày 01/01/2024..."
            value={request}
            onChange={(e) => setRequest(e.target.value)}
            onKeyDown={(e) => {
                if(e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                    handleDraft();
                }
            }}
          />
          <div className="absolute bottom-4 right-4">
            <button
              onClick={() => handleDraft()}
              disabled={isDrafting || !request.trim()}
              className={`px-6 py-2 rounded-full shadow-lg font-medium text-white transition-all transform hover:scale-105
                ${isDrafting || !request.trim() 
                  ? 'bg-slate-400 cursor-not-allowed shadow-none scale-100' 
                  : 'bg-gradient-to-r from-legal-600 to-legal-800 hover:from-legal-500 hover:to-legal-700'}`}
            >
              {isDrafting ? (
                <span><i className="fas fa-circle-notch fa-spin mr-2"></i>Đang xử lý</span>
              ) : (
                <span>Soạn thảo <i className="fas fa-paper-plane ml-1"></i></span>
              )}
            </button>
          </div>
        </div>
        {error && <div className="mt-2 text-red-600 text-sm"><i className="fas fa-exclamation-circle mr-1"></i>{error}</div>}
      </div>

      {/* Result Area */}
      {result && (
        <div className="flex-1 flex gap-4 overflow-hidden min-h-0" ref={resultRef}>
          {/* Document Preview */}
          <div className="flex-1 bg-white rounded-lg shadow-sm border border-legal-200 flex flex-col overflow-hidden">
            <div className="p-4 border-b border-legal-100 bg-legal-50 flex justify-between items-center shrink-0">
                <div className="flex items-center gap-2">
                    <span className="font-semibold text-legal-800">
                        {result.selected_template}
                    </span>
                    {result.status === 'incomplete' && (
                        <span className="px-2 py-0.5 rounded-full text-xs bg-amber-100 text-amber-700 border border-amber-200">
                            Cần bổ sung
                        </span>
                    )}
                     {result.status === 'success' && (
                        <span className="px-2 py-0.5 rounded-full text-xs bg-green-100 text-green-700 border border-green-200">
                            Hoàn tất
                        </span>
                    )}
                </div>
                <div className="flex gap-2">
                    <button onClick={downloadHTML} className="text-xs flex items-center gap-1 px-3 py-1.5 bg-white border border-slate-300 rounded hover:bg-slate-50 text-slate-700">
                        <i className="fas fa-file-word text-blue-700"></i> Xuất file
                    </button>
                </div>
            </div>
            <div className="flex-1 overflow-y-auto p-8 bg-slate-100">
                <div 
                    className="document-preview max-w-3xl mx-auto bg-white p-12 shadow-md min-h-full text-justify text-slate-900 leading-relaxed"
                    dangerouslySetInnerHTML={{ __html: result.document_html }} 
                />
            </div>
          </div>

          {/* Sidebar: Issues & Metadata */}
          <div className="w-80 bg-white rounded-lg shadow-sm border border-legal-200 flex flex-col overflow-hidden shrink-0">
            <div className="p-4 border-b border-legal-100 bg-legal-50 font-semibold text-slate-700">
                Phân tích & Gợi ý
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-6">
                
                {/* Missing Fields Input Section */}
                {result.missing_fields.length > 0 && (
                    <div className="mb-2">
                        <h4 className="text-sm font-bold text-red-600 mb-3 flex items-center">
                            <i className="fas fa-exclamation-triangle mr-2"></i>
                            Bổ sung thông tin
                        </h4>
                        <div className="space-y-3 bg-red-50 p-3 rounded border border-red-100">
                            <p className="text-xs text-red-700 italic mb-1">
                                Nhập thông tin bên dưới và nhấn "Cập nhật" để AI điền vào văn bản.
                            </p>
                            {result.missing_fields.map((field, idx) => (
                                <div key={idx}>
                                    <label className="block text-xs font-semibold text-red-800 mb-1">{field}</label>
                                    <input 
                                        type="text"
                                        className="w-full text-sm p-2 border border-red-200 rounded focus:border-red-500 focus:ring-1 focus:ring-red-500 outline-none bg-white"
                                        placeholder={`Nhập ${field}...`}
                                        value={missingValues[field] || ''}
                                        onChange={(e) => handleMissingValueChange(field, e.target.value)}
                                        onKeyDown={(e) => {
                                            if(e.key === 'Enter') handleRedraftWithMissingInfo();
                                        }}
                                    />
                                </div>
                            ))}
                            <button
                                onClick={handleRedraftWithMissingInfo}
                                disabled={isDrafting}
                                className="w-full mt-3 bg-red-600 hover:bg-red-700 text-white text-xs font-bold py-2 rounded shadow-sm transition-colors flex items-center justify-center gap-1"
                            >
                                {isDrafting ? <i className="fas fa-spinner fa-spin"></i> : <i className="fas fa-sync-alt"></i>} 
                                Cập nhật & Soạn lại
                            </button>
                        </div>
                    </div>
                )}

                {/* AI Notes */}
                {result.notes.length > 0 && (
                     <div>
                        <h4 className="text-sm font-bold text-legal-700 mb-2 flex items-center">
                            <i className="fas fa-clipboard-check mr-2"></i>
                            Ghi chú pháp lý
                        </h4>
                        <div className="space-y-3">
                            {result.notes.map((note, idx) => (
                                <div key={idx} className="text-sm bg-blue-50 p-3 rounded border border-blue-100">
                                    {note.location && <div className="text-xs font-semibold text-blue-800 mb-1">{note.location}</div>}
                                    <div className="text-slate-700">{note.comment}</div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {result.missing_fields.length === 0 && result.notes.length === 0 && (
                     <div className="text-center py-8 text-green-600">
                        <i className="fas fa-check-circle text-3xl mb-2"></i>
                        <p className="text-sm">Văn bản đã hoàn thiện tốt.</p>
                     </div>
                )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};