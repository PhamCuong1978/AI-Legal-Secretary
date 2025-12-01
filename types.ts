export interface Template {
  id: string;
  name: string;
  category: string;
  description: string;
  structure: string; // The raw text or structural representation
  placeholders: string[];
  createdAt: number;
  originalFile?: {
    name: string;
    data: string; // Base64 string
    mimeType: string;
  };
}

export interface DocumentNote {
  location: string;
  comment: string;
}

export interface DraftResult {
  status: 'success' | 'incomplete';
  selected_template: string;
  missing_fields: string[];
  document_text: string;
  document_html: string;
  document_docx_base64: string; // In a real app, this would be binary, here we might mock or leave empty
  notes: DocumentNote[];
}

export enum AppView {
  DASHBOARD = 'DASHBOARD',
  TEMPLATES = 'TEMPLATES',
  DRAFTING = 'DRAFTING',
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'model';
  text?: string;
  audioData?: string; // Base64
  isError?: boolean;
}

export interface AssistantContext {
  templates: Template[];
  currentRequest: string;
  currentDraft?: DraftResult | null;
}
