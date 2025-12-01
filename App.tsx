import React, { useState, useEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { Template, AppView } from './types';
import { TemplateManager } from './components/TemplateManager';
import { DraftingWorkspace } from './components/DraftingWorkspace';
import { getStoredVersion, incrementVersion } from './services/versionService';
import { exportData, parseImportData } from './services/persistenceService';
import { CloudConfig, fetchCloudData, saveCloudData } from './services/syncService';

// Initial dummy data to help users start immediately
const INITIAL_TEMPLATES: Template[] = [
  {
    id: 'tpl-001',
    name: 'Đơn xin nghỉ phép',
    category: 'Hành chính',
    description: 'Mẫu đơn xin nghỉ phép chuẩn cho nhân viên văn phòng.',
    structure: "CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM\nĐộc lập - Tự do - Hạnh phúc\n\nĐƠN XIN NGHỈ PHÉP\n\nKính gửi: {{NGƯỜI_NHẬN/PHÒNG_BAN}}\n\nTôi tên là: {{TÊN_NHÂN_VIÊN}}\nChức vụ: {{CHỨC_VỤ}}\nBộ phận: {{BỘ_PHẬN}}\n\nTôi làm đơn này xin phép được nghỉ {{SỐ_NGÀY}} ngày, từ ngày {{NGÀY_BẮT_ĐẦU}} đến hết ngày {{NGÀY_KẾT_THÚC}}.\n\nLý do nghỉ: {{LÝ_DO}}\n\nTôi cam kết đã bàn giao công việc và giữ liên lạc trong trường hợp khẩn cấp.\n\nTrân trọng,\n{{NGÀY_KÝ}}\n{{TÊN_NHÂN_VIÊN}}",
    placeholders: ["NGƯỜI_NHẬN", "TÊN_NHÂN_VIÊN", "CHỨC_VỤ", "LÝ_DO", "SỐ_NGÀY"],
    createdAt: Date.now()
  }
];

const App: React.FC = () => {
  const [view, setView] = useState<AppView>(AppView.DRAFTING);
  const [version, setVersion] = useState<string>(getStoredVersion);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Cloud Config State
  const [showSettings, setShowSettings] = useState(false);
  const [cloudConfig, setCloudConfig] = useState<CloudConfig>(() => {
    const saved = localStorage.getItem('legal_cloud_config');
    return saved ? JSON.parse(saved) : { endpoint: '', apiKey: '' };
  });
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncTime, setLastSyncTime] = useState<string>('');

  const [templates, setTemplates] = useState<Template[]>(() => {
    // Try to load from local storage
    const saved = localStorage.getItem('legal_templates');
    return saved ? JSON.parse(saved) : INITIAL_TEMPLATES;
  });

  // Local Persistence
  useEffect(() => {
    localStorage.setItem('legal_templates', JSON.stringify(templates));
  }, [templates]);

  useEffect(() => {
    localStorage.setItem('legal_app_version', version);
  }, [version]);

  // Cloud Persistence - Auto Load on Mount/Config Change
  useEffect(() => {
    if (cloudConfig.endpoint) {
      handleCloudSync(true); // Fetch only
    }
  }, [cloudConfig.endpoint, cloudConfig.apiKey]);

  // Cloud Persistence - Auto Save on Change (Debounced)
  useEffect(() => {
    if (!cloudConfig.endpoint) return;
    
    const timer = setTimeout(() => {
      handleCloudSync(false); // Save
    }, 2000); // 2 second debounce

    return () => clearTimeout(timer);
  }, [templates, version, cloudConfig.endpoint]);

  const handleCloudSync = async (fetchOnly: boolean) => {
    if (!cloudConfig.endpoint) return;
    setIsSyncing(true);
    try {
      if (fetchOnly) {
        const data = await fetchCloudData(cloudConfig);
        if (data && Array.isArray(data.templates)) {
            // Merge logic: For simplicity, cloud overwrites local if cloud is newer or we are forcing fetch
            // Ideally we compare timestamps, but here we trust the user wants 'Sync'
            setTemplates(data.templates);
            if (data.version) setVersion(data.version);
            setLastSyncTime(new Date().toLocaleTimeString());
        }
      } else {
        await saveCloudData(cloudConfig, {
            version,
            templates,
            lastUpdated: Date.now()
        });
        setLastSyncTime(new Date().toLocaleTimeString());
      }
    } catch (err) {
      console.error("Cloud Sync Error", err);
      // Optional: show toast
    } finally {
      setIsSyncing(false);
    }
  };

  const saveSettings = (newConfig: CloudConfig) => {
    setCloudConfig(newConfig);
    localStorage.setItem('legal_cloud_config', JSON.stringify(newConfig));
    setShowSettings(false);
    alert("Đã lưu cấu hình! Hệ thống sẽ tự động đồng bộ.");
  };

  const handleAddTemplate = (newTemplate: Template) => {
    setTemplates(prev => [newTemplate, ...prev]);
    const newVer = incrementVersion(version);
    setVersion(newVer);
    // Auto-save handled by useEffect
  };

  const handleDeleteTemplate = (id: string) => {
    setTemplates(prev => prev.filter(t => t.id !== id));
    const newVer = incrementVersion(version);
    setVersion(newVer);
  };

  const handleExport = () => {
    exportData(templates, version);
  };

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const { templates: importedTemplates, version: importedVersion } = await parseImportData(file);
      if (confirm(`Bạn có chắc muốn khôi phục dữ liệu từ bản sao lưu (Vr_${importedVersion})?`)) {
        setTemplates(importedTemplates);
        setVersion(importedVersion);
        alert("Khôi phục dữ liệu thành công!");
      }
    } catch (err: any) {
      alert("Lỗi khôi phục: " + err.message);
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // Retrieve injected build version from Vite
  const buildVersion = (process.env as any).BUILD_VERSION || 'Dev';

  return (
    <div className="flex h-screen bg-legal-50">
      {/* Sidebar Navigation */}
      <div className="w-64 bg-legal-900 text-white flex flex-col shadow-xl z-10 relative">
        <div className="p-6 border-b border-legal-800">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-blue-500 rounded-lg flex items-center justify-center shadow-lg shadow-blue-500/50 shrink-0">
               <i className="fas fa-scale-balanced text-white"></i>
            </div>
            <div className="flex flex-col items-end">
                <span className="font-bold text-lg tracking-tight leading-none">Legal Secretary</span>
                <span className="text-[10px] text-blue-200 font-mono mt-1 opacity-80" title={`Build: ${buildVersion}`}>
                    v{buildVersion}
                </span>
                <span className="text-[9px] text-blue-300/50 font-mono" title="Data Revision">
                    Data: {version}
                </span>
            </div>
          </div>
        </div>
        
        <nav className="flex-1 p-4 space-y-2">
          <button
            onClick={() => setView(AppView.DRAFTING)}
            className={`w-full text-left px-4 py-3 rounded-lg flex items-center transition-all
              ${view === AppView.DRAFTING 
                ? 'bg-legal-800 text-white shadow-lg' 
                : 'text-slate-400 hover:bg-legal-800/50 hover:text-white'}`}
          >
            <i className="fas fa-pen-fancy w-6"></i>
            <span className="font-medium">Soạn thảo</span>
          </button>
          
          <button
            onClick={() => setView(AppView.TEMPLATES)}
            className={`w-full text-left px-4 py-3 rounded-lg flex items-center transition-all
              ${view === AppView.TEMPLATES 
                ? 'bg-legal-800 text-white shadow-lg' 
                : 'text-slate-400 hover:bg-legal-800/50 hover:text-white'}`}
          >
            <i className="fas fa-folder-open w-6"></i>
            <span className="font-medium">Quản lý Mẫu</span>
            <span className="ml-auto bg-legal-600 text-xs px-2 py-0.5 rounded-full">{templates.length}</span>
          </button>
        </nav>

        <div className="p-4 border-t border-legal-800 space-y-2">
           <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Hệ thống</p>
           
           <button 
             onClick={() => setShowSettings(true)}
             className="w-full flex items-center gap-2 text-xs text-legal-200 hover:text-white hover:bg-legal-800 px-3 py-2 rounded transition-colors"
           >
             <i className="fas fa-cloud"></i> Cấu hình Đồng bộ {cloudConfig.endpoint && <span className="ml-auto w-2 h-2 rounded-full bg-green-400"></span>}
           </button>
           
           <button 
             onClick={handleExport}
             className="w-full flex items-center gap-2 text-xs text-legal-200 hover:text-white hover:bg-legal-800 px-3 py-2 rounded transition-colors"
           >
             <i className="fas fa-download"></i> Sao lưu (File)
           </button>
           <button 
             onClick={handleImportClick}
             className="w-full flex items-center gap-2 text-xs text-legal-200 hover:text-white hover:bg-legal-800 px-3 py-2 rounded transition-colors"
           >
             <i className="fas fa-history"></i> Khôi phục (File)
           </button>
           <input 
             type="file" 
             ref={fileInputRef} 
             className="hidden" 
             accept=".json" 
             onChange={handleFileChange}
           />
        </div>

        <div className="p-4 border-t border-legal-800 text-xs text-slate-500">
           {isSyncing ? (
               <div className="flex items-center gap-2 text-blue-300 animate-pulse">
                   <i className="fas fa-sync fa-spin"></i> Đang đồng bộ...
               </div>
           ) : lastSyncTime ? (
               <div className="flex items-center gap-1 text-green-400/80 mb-2">
                   <i className="fas fa-check-circle"></i> Đã đồng bộ {lastSyncTime}
               </div>
           ) : null}
          <p>© 2024 AI Legal Secretary</p>
          <p className="mt-1">Powered by Gemini 2.5</p>
        </div>
      </div>

      {/* Main Content */}
      <main className="flex-1 overflow-hidden p-6 relative">
        <div className="absolute top-0 right-0 p-4 opacity-50 pointer-events-none">
           <i className="fas fa-gavel text-[200px] text-legal-100 -rotate-12"></i>
        </div>

        <div className="relative h-full z-0">
            {view === AppView.TEMPLATES && (
            <TemplateManager 
                templates={templates} 
                onAddTemplate={handleAddTemplate} 
                onDeleteTemplate={handleDeleteTemplate}
            />
            )}

            {view === AppView.DRAFTING && (
            <DraftingWorkspace 
                templates={templates} 
            />
            )}
        </div>
      </main>

      {/* Settings Modal */}
      {showSettings && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-md animate-fade-in p-6">
                <h3 className="text-xl font-bold text-legal-900 mb-4 flex items-center gap-2">
                    <i className="fas fa-cloud-upload-alt text-legal-600"></i>
                    Đồng bộ Đám mây
                </h3>
                <p className="text-sm text-slate-600 mb-4 bg-blue-50 p-3 rounded border border-blue-100">
                    Kết nối với dịch vụ lưu trữ JSON (như <b>JSONBin.io</b>) để lưu trữ và đồng bộ mẫu văn bản giữa các thiết bị.
                </p>

                <div className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">API Endpoint URL</label>
                        <input 
                            type="text" 
                            className="w-full p-2 border border-slate-300 rounded focus:ring-2 focus:ring-legal-600 outline-none text-sm"
                            placeholder="https://api.jsonbin.io/v3/b/YOUR_BIN_ID"
                            defaultValue={cloudConfig.endpoint}
                            id="endpointInput"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">API Key / Secret</label>
                        <input 
                            type="password" 
                            className="w-full p-2 border border-slate-300 rounded focus:ring-2 focus:ring-legal-600 outline-none text-sm"
                            placeholder="X-Master-Key hoặc Bearer Token"
                            defaultValue={cloudConfig.apiKey}
                            id="apiKeyInput"
                        />
                    </div>
                </div>

                <div className="flex justify-end gap-3 mt-6">
                    <button 
                        onClick={() => setShowSettings(false)}
                        className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded"
                    >
                        Hủy
                    </button>
                    <button 
                        onClick={() => {
                            const endpoint = (document.getElementById('endpointInput') as HTMLInputElement).value;
                            const apiKey = (document.getElementById('apiKeyInput') as HTMLInputElement).value;
                            saveSettings({ endpoint, apiKey });
                        }}
                        className="px-4 py-2 text-sm text-white bg-legal-600 hover:bg-legal-700 rounded shadow"
                    >
                        Lưu cấu hình
                    </button>
                </div>
            </div>
        </div>
      )}
    </div>
  );
};

export default App;