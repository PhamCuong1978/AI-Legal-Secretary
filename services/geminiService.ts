import { GoogleGenAI, Schema, Type, Part } from "@google/genai";
import { DraftResult, Template } from "../types";

const API_KEY = process.env.API_KEY || '';

// Initialize the client
const ai = new GoogleGenAI({ apiKey: API_KEY });

// System instruction for the drafting agent
const DRAFTING_SYSTEM_INSTRUCTION = `
Bạn là AI Thư ký Soạn thảo Văn bản Chuyên nghiệp. Nhiệm vụ của bạn là soạn thảo văn bản dựa trên Template được cung cấp và dữ liệu đầu vào của người dùng.

QUY TẮC QUAN TRỌNG:
1. Không biến tấu lung tung khác mẫu trừ khi người dùng yêu cầu.
2. Luôn ưu tiên giữ nguyên phong cách văn bản gốc mà mẫu đã chỉ định.
3. Đảm bảo văn phong pháp lý chuẩn mực.
4. Nếu thiếu thông tin, liệt kê rõ trong trường 'missing_fields'.
5. Trả về kết quả dưới dạng JSON hợp lệ.
`;

const TEMPLATE_ANALYSIS_INSTRUCTION = `
Bạn là chuyên gia phân tích văn bản pháp lý. Nhiệm vụ của bạn là trích xuất cấu trúc từ văn bản mẫu do người dùng cung cấp (có thể là hình ảnh, PDF hoặc văn bản) để tạo thành một Template tái sử dụng.
Hãy xác định các trường thay đổi (placeholder) và bọc chúng bằng {{...}}.
`;

export interface AnalyzeInput {
  text?: string;
  inlineData?: {
    data: string; // Base64 string
    mimeType: string;
  };
}

export const analyzeTemplate = async (input: AnalyzeInput): Promise<Partial<Template>> => {
  if (!API_KEY) throw new Error("API Key not found");

  const responseSchema: Schema = {
    type: Type.OBJECT,
    properties: {
      name: { type: Type.STRING, description: "Tên loại văn bản (ví dụ: Hợp đồng lao động)" },
      category: { type: Type.STRING, description: "Loại văn bản (Hợp đồng, Biên bản, Quyết định...)" },
      description: { type: Type.STRING, description: "Mô tả ngắn gọn mục đích văn bản" },
      structure: { type: Type.STRING, description: "Nội dung mẫu đã được chuẩn hóa với các placeholder dạng {{TÊN_TRƯỜNG}}" },
      placeholders: { 
        type: Type.ARRAY, 
        items: { type: Type.STRING },
        description: "Danh sách các trường cần điền" 
      }
    },
    required: ["name", "category", "structure", "placeholders"]
  };

  try {
    const parts: Part[] = [];
    if (input.text) {
      parts.push({ text: `Phân tích văn bản mẫu sau và tạo template:\n\n${input.text}` });
    }
    if (input.inlineData) {
        parts.push({ text: "Phân tích văn bản trong file đính kèm sau và tạo template:" });
        parts.push({ inlineData: input.inlineData });
    }

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [
        { role: 'user', parts: parts }
      ],
      config: {
        systemInstruction: TEMPLATE_ANALYSIS_INSTRUCTION,
        responseMimeType: "application/json",
        responseSchema: responseSchema,
      }
    });

    if (!response.text) throw new Error("No response from AI");
    return JSON.parse(response.text) as Partial<Template>;
  } catch (error) {
    console.error("Error analyzing template:", error);
    throw error;
  }
};

export const draftDocument = async (
  request: string, 
  availableTemplates: Template[]
): Promise<DraftResult> => {
  if (!API_KEY) throw new Error("API Key not found");

  // Simplified schema for the drafting result
  const responseSchema: Schema = {
    type: Type.OBJECT,
    properties: {
      status: { type: Type.STRING, enum: ["success", "incomplete"] },
      selected_template: { type: Type.STRING },
      missing_fields: { type: Type.ARRAY, items: { type: Type.STRING } },
      document_text: { type: Type.STRING },
      document_html: { type: Type.STRING, description: "HTML version formatted for legal display (using <p>, <strong>, etc.)" },
      document_docx_base64: { type: Type.STRING, description: "Leave empty string for now" },
      notes: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            location: { type: Type.STRING },
            comment: { type: Type.STRING }
          }
        }
      }
    },
    required: ["status", "selected_template", "missing_fields", "document_text", "document_html", "notes"]
  };

  // Prepare context about available templates
  const templatesContext = availableTemplates.map(t => 
    `ID: ${t.id}\nNAME: ${t.name}\nSTRUCTURE: ${t.structure}`
  ).join('\n---\n');

  const prompt = `
  AVAILABLE TEMPLATES:
  ${templatesContext}

  USER REQUEST:
  "${request}"

  INSTRUCTIONS:
  1. Select the most appropriate template from the list based on the user request. If none fit perfectly, pick the closest one or use general legal knowledge to adapt.
  2. Fill the template using the information in the USER REQUEST.
  3. If information is missing for a placeholder, list it in 'missing_fields'.
  4. Create a clean HTML version suitable for display.
  `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      config: {
        systemInstruction: DRAFTING_SYSTEM_INSTRUCTION,
        responseMimeType: "application/json",
        responseSchema: responseSchema,
      }
    });

    if (!response.text) throw new Error("No response from AI");
    return JSON.parse(response.text) as DraftResult;
  } catch (error) {
    console.error("Error drafting document:", error);
    throw error;
  }
};