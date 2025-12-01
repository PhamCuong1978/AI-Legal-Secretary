import { Template } from '../types';

export const exportData = (templates: Template[], version: string) => {
  const data = {
    version,
    templates,
    exportedAt: Date.now(),
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `legal_secretary_backup_Vr_${version}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};

export const parseImportData = async (file: File): Promise<{ templates: Template[], version: string }> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const text = e.target?.result as string;
        const data = JSON.parse(text);
        
        // Basic validation
        if (!data.templates || !Array.isArray(data.templates) || !data.version) {
          reject(new Error("File không hợp lệ hoặc bị hỏng."));
          return;
        }

        resolve({
          templates: data.templates,
          version: data.version
        });
      } catch (err) {
        reject(new Error("Lỗi khi đọc file JSON."));
      }
    };
    reader.onerror = () => reject(new Error("Lỗi đọc file."));
    reader.readAsText(file);
  });
};