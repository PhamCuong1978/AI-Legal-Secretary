import { GoogleGenAI, Schema, Type, Part } from "@google/genai";
import { DraftResult, Template } from "../types";

// Initialize the client
// API Key must be obtained exclusively from the environment variable process.env.API_KEY
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

// System instruction for the drafting agent
const DRAFTING_SYSTEM_INSTRUCTION = `
Bạn là AI Thư ký Soạn thảo Văn bản Chuyên nghiệp. Nhiệm vụ của bạn là soạn thảo văn bản dựa trên Template và dữ liệu người dùng, TUÂN THỦ NGHIÊM NGẶT Nghị định 187/2025/NĐ-CP về thể thức văn bản.

QUY TẮC VỀ THỂ THỨC (QUAN TRỌNG):
1.  **Phông chữ**: Bắt buộc dùng Times New Roman.
2.  **Cỡ chữ & Kiểu chữ**:
    -   Quốc hiệu: "CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM" (In hoa, Đậm, size 12-13).
    -   Tiêu ngữ: "Độc lập - Tự do - Hạnh phúc" (In thường, Đậm, size 13-14, chữ cái đầu viết hoa, canh giữa dưới Quốc hiệu, có gạch chân bên dưới).
    -   Tên cơ quan ban hành: In hoa, Đậm, size 12-13 (Cột trái).
    -   Số ký hiệu: In thường, size 13 (Canh giữa dưới tên cơ quan).
    -   Nội dung chính: Size 13-14, dãn dòng 1.5, căn đều 2 bên (Justify).
3.  **Bố cục Phần mở đầu (Header)**:
    -   Sử dụng HTML Table (style="width:100%; border:none; margin-bottom:20px") để chia 2 cột.
    -   Cột trái (khoảng 40%): Tên cơ quan chủ quản (nếu có) + Tên cơ quan ban hành + Số ký hiệu. **BẮT BUỘC: Nội dung trong cột này phải canh giữa (text-align: center)**.
    -   Cột phải (khoảng 60%): Quốc hiệu + Tiêu ngữ + Địa danh, ngày tháng. **BẮT BUỘC: Nội dung trong cột này phải canh giữa (text-align: center)**.
4.  **Định dạng HTML**:
    -   Trả về HTML sạch, sử dụng các thẻ <p>, <strong>, <table>, <em>.
    -   Tuyệt đối không dùng Markdown (\`\`\`html) trong trường document_html.
    -   Nội dung văn bản chính (body) dùng thẻ <div style="text-align: justify;"> hoặc <p style="text-align: justify;">.

QUY TẮC SOẠN THẢO:
1.  Nếu thiếu thông tin, liệt kê rõ trong trường 'missing_fields'.
2.  Giữ văn phong pháp lý chuẩn mực, trang trọng.
3.  Trả về kết quả dưới dạng JSON hợp lệ.
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
  // Simplified schema for the drafting result
  const responseSchema: Schema = {
    type: Type.OBJECT,
    properties: {
      status: { type: Type.STRING, enum: ["success", "incomplete"] },
      selected_template: { type: Type.STRING },
      missing_fields: { type: Type.ARRAY, items: { type: Type.STRING } },
      document_text: { type: Type.STRING },
      document_html: { type: Type.STRING, description: "HTML version formatted for legal display (using <p>, <strong>, tables for header, etc.)" },
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
  // Escape backticks to avoid breaking the template literal
  const templatesContext = availableTemplates.map(t => 
    `ID: ${t.id}\nNAME: ${t.name}\nSTRUCTURE: ${t.structure.replace(/`/g, '\\`')}`
  ).join('\n---\n');

  // Escape backticks in user request
  const safeRequest = request.replace(/`/g, '\\`');

  const prompt = `
  AVAILABLE TEMPLATES:
  ${templatesContext}

  USER REQUEST:
  "${safeRequest}"

  INSTRUCTIONS:
  1. Select the most appropriate template.
  2. Fill the template using the USER REQUEST information.
  3. **REFORMAT THE OUTPUT HTML** to match Decree 187/2025/NĐ-CP exactly.
     - **Header**: Use a 2-column HTML table (border: 0).
       - Left Column: Agency Name (UPPERCASE, BOLD). **Must be centered (text-align: center)** relative to the column.
       - Right Column: "CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM" (UPPERCASE, BOLD) and Motto. **Must be centered (text-align: center)** relative to the column.
       - Use inline styles for table cells: <td style="text-align: center; vertical-align: top;">
     - **Body**: Text must be justified (text-align: justify).
     - **Fonts**: Times New Roman, size 13-14.
  4. Create a clean HTML version.
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