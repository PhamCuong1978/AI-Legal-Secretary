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
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [processingStatus, setProcessingStatus] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [viewingTemplate, setViewingTemplate] = useState<Template | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Helper: Read file content based on type
  const extractFileContent = async (file: File): Promise<{ 
    text?: string, 
    inlineData?: { data: string, mimeType: string }, 
    originalFile: { name: string, data: string, mimeType: string } 
  }> => {
    const fileType = file.type;
    const fileName = file.name;

    // Helper to read file as Base64 for STORAGE
    const getBase64 = (f: File): Promise<string> => {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => {
                const res = reader.result as string;
                resolve(res.split(',')[1]); // Remove data:mime/type;base64, prefix
            };
            reader.onerror = reject;
            reader.readAsDataURL(f);
        });
    };

    const base64Data = await getBase64(file);
    const originalFileObj = {
        name: fileName,
        data: base64Data,
        mimeType: fileType || 'application/octet-stream'
    };

    // 1. Image or PDF: Send directly to Gemini as Base64
    if (fileType.startsWith('image/') || fileType === 'application/pdf') {
        return {
            inlineData: { data: base64Data, mimeType: fileType },
            originalFile: originalFileObj
        };
    } 
    // 2. Word (.docx)
    else if (fileName.toLowerCase().endsWith('.docx')) {
        const arrayBuffer = await file.arrayBuffer();
        // @ts-ignore
        const result = await window.mammoth.extractRawText({ arrayBuffer: arrayBuffer });
        return {
            text: result.value,
            originalFile: originalFileObj
        };
    }
    // 3. Excel (.xlsx, .xls)
    else if (fileName.toLowerCase().endsWith('.xlsx') || fileName.toLowerCase().endsWith('.xls')) {
        const arrayBuffer = await file.arrayBuffer();
        // @ts-ignore
        const workbook = window.XLSX.read(arrayBuffer, { type: 'array' });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        // @ts-ignore
        const text = window.XLSX.utils.sheet_to_csv(worksheet);
        return {
            text: text,
            originalFile: originalFileObj
        };
    }
    // 4. Text / HTML / Markdown
    else if (fileType === 'text/plain' || fileType === 'text/html' || fileName.toLowerCase().endsWith('.md')) {
         const text = await file.text();
         return {
             text: text,
             originalFile: originalFileObj
         };
    }
    
    throw new Error(`Định dạng file ${fileName} không được hỗ trợ.`);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
        const newFiles = Array.from(e.target.files);
        setSelectedFiles(prev => [...prev, ...newFiles]);
        // Reset input value to allow selecting the same file again if needed
        if (fileInputRef.current) fileInputRef.current.value = '';
        setError(null);
    }
  };

  const handleRemoveFile = (index: number) => {
      setSelectedFiles(prev => prev.filter((_, i) => i !== index));
  };

  const handleBatchAnalyze = async () => {
    if (selectedFiles.length === 0 && !inputText.trim()) return;

    setIsAnalyzing(true);
    setError(null);
    setProcessingStatus('Đang khởi tạo...');

    let successCount = 0;
    const errors: string[] = [];

    try {
        // 1. Process Text Input first if exists
        if (inputText.trim()) {
            setProcessingStatus('Đang phân tích nội dung văn bản...');
            try {
                const result = await analyzeTemplate({ text: inputText });
                if (result.name && result.structure) {
                    addTemplateResult(result);
                    successCount++;
                    setInputText(''); // Clear text on success
                }
            } catch (err: any) {
                errors.push(`Lỗi nội dung nhập tay: ${err.message}`);
            }
        }

        // 2. Process Files
        for (let i = 0; i < selectedFiles.length; i++) {
            const file = selectedFiles[i];
            setProcessingStatus(`Đang xử lý file (${i + 1}/${selectedFiles.length}): ${file.name}...`);
            
            try {
                const content = await extractFileContent(file);
                const result = await analyzeTemplate({
                    text: content.text,
                    inlineData: content.inlineData
                });

                if (result.name && result.structure) {
                    addTemplateResult(result, content.originalFile);
                    successCount++;
                } else {
                     errors.push(`File ${file.name}: Không trích xuất được cấu trúc mẫu.`);
                }
            } catch (err: any) {
                console.error(err);
                errors.push(`File ${file.name}: ${err.message}`);
            }
        }

        // Clear files after processing
        setSelectedFiles([]);

        if (errors.length > 0) {
            setError(`Đã hoàn thành ${successCount} mẫu. Có lỗi: \n${errors.join('\n')}`);
        } else if (successCount > 0) {
            // All good
        } else {
            setError("Không tạo được mẫu nào. Vui lòng kiểm tra lại nội dung.");
        }

    } catch (err: any) {
        setError("Lỗi hệ thống: " + err.message);
    } finally {
        setIsAnalyzing(false);
        setProcessingStatus('');
    }
  };

  const addTemplateResult = (result: Partial<Template>, originalFile?: Template['originalFile']) => {
    const newTemplate: Template = {
        id: crypto.randomUUID(),
        name: result.name || 'Untitled Template',
        category: result.category || 'General',
        description: result.description || 'Imported template',
        structure: result.structure || '',
        placeholders: result.placeholders || [],
        createdAt: Date.now(),
        originalFile: originalFile
    };
    onAddTemplate(newTemplate);
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
            <div className="absolute inset-0 bg-white/90 z-10 flex items-center justify-center rounded-lg backdrop-blur-sm px-8 text-center">
                <div className="flex flex-col items-center">
                    <i className="fas fa-spinner fa-spin text-legal-600 text-3xl mb-3"></i>
                    <span className="text-legal-800 font-bold mb-1">Đang phân tích...</span>
                    <span className="text-sm text-legal-600">{processingStatus}</span>
                </div>
            </div>
          )}

          <div className="mb-4">
             <div className="flex justify-between items-center mb-2">
                <label className="block text-sm font-medium text-slate-700">
                    Cách 1: Tải lên file mẫu
                </label>
                <button 
                    onClick={() => fileInputRef.current?.click()}
                    className="text-xs bg-white border border-legal-300 text-legal-700 hover:bg-legal-50 px-3 py-1 rounded shadow-sm flex items-center gap-1"
                >
                    <i className="fas fa-plus"></i> Chọn thêm file
                </button>
             </div>
             
             <input 
                type="file" 
                ref={fileInputRef}
                onChange={handleFileSelect}
                multiple 
                accept=".docx,.xlsx,.xls,.pdf,.txt,.html,.md,.png,.jpg,.jpeg,.webp"
                className="hidden"
             />

             {/* File List Display */}
             {selectedFiles.length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-2 max-h-40 overflow-y-auto p-1">
                    {selectedFiles.map((file, idx) => (
                        <div key={idx} className="flex items-center justify-between bg-white border border-slate-200 p-2 rounded text-sm shadow-sm animate-fade-in">
                            <div className="flex items-center gap-2 overflow-hidden">
                                <i className="fas fa-file-alt text-legal-500 shrink-0"></i>
                                <span className="truncate text-slate-700" title={file.name}>{file.name}</span>
                                <span className="text-xs text-slate-400 shrink-0">({(file.size / 1024).toFixed(0)}KB)</span>
                            </div>
                            <button 
                                onClick={() => handleRemoveFile(idx)}
                                className="text-slate-400 hover:text-red-500 px-2 shrink-0 transition-colors"
                            >
                                <i className="fas fa-times"></i>
                            </button>
                        </div>
                    ))}
                </div>
             ) : (
                <div 
                    onClick={() => fileInputRef.current?.click()}
                    className="border-2 border-dashed border-legal-200 rounded-lg p-6 text-center cursor-pointer hover:bg-legal-100/50 transition-colors"
                >
                    <i className="fas fa-cloud-upload-alt text-legal-300 text-2xl mb-2"></i>
                    <p className="text-sm text-slate-500">Click để chọn hoặc kéo thả file vào đây</p>
                    <p className="text-xs text-slate-400 mt-1">Word, Excel, PDF, Ảnh, Text...</p>
                </div>
             )}
          </div>
          
          <div className="relative flex items-center py-2">
            <div className="flex-grow border-t border-legal-200"></div>
            <span className="flex-shrink-0 mx-4 text-legal-400 text-xs uppercase">Và / Hoặc</span>
            <div className="flex-grow border-t border-legal-200"></div>
          </div>

          <label className="block text-sm font-medium text-slate-700 mb-2">
            Cách 2: Dán nội dung văn bản
          </label>
          <textarea
            className="w-full h-24 p-3 text-sm border border-slate-300 rounded focus:ring-2 focus:ring-legal-600 focus:border-transparent outline-none resize-none"
            placeholder="Ví dụ: CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM..."
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
          />

          <div className="mt-4 flex items-center justify-between">
             <div className="text-xs text-red-500 font-medium whitespace-pre-wrap max-w-[60%]">{error}</div>
            <button
              onClick={handleBatchAnalyze}
              disabled={isAnalyzing || (selectedFiles.length === 0 && !inputText.trim())}
              className={`px-6 py-2.5 rounded shadow-md font-medium text-white transition-all transform active:scale-95
                ${isAnalyzing || (selectedFiles.length === 0 && !inputText.trim())
                  ? 'bg-slate-400 cursor-not-allowed shadow-none' 
                  : 'bg-legal-600 hover:bg-legal-700 hover:shadow-lg'}`}
            >
              {isAnalyzing ? (
                  <span><i className="fas fa-circle-notch fa-spin mr-2"></i>Đang xử lý...</span>
              ) : (
                  <span>
                      <i className="fas fa-magic mr-2"></i>
                      Học {selectedFiles.length > 0 ? `${selectedFiles.length} file` : 'mẫu'}
                      {selectedFiles.length > 0 && inputText.trim() ? ' & văn bản' : ''}
                   </span>
              )}
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