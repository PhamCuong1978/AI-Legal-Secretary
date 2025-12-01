import { Template } from '../types';

// Declare external library loaded in index.html
declare const LZString: {
  compressToUTF16: (input: string) => string;
  decompressFromUTF16: (input: string) => string;
};

export interface CloudConfig {
  endpoint: string;
  apiKey: string;
}

export interface CloudData {
  version: string;
  templates: Template[];
  lastUpdated: number;
}

interface CompressedCloudPayload {
  compressed: boolean;
  data: string;
  updatedAt: string;
}

// Helper to determine if the response is from JSONBin or a generic store
const parseResponse = (rawResponse: any): CloudData => {
  // 1. Unwrap JSONBin structure if present
  let payload = rawResponse;
  if (rawResponse && rawResponse.record) {
    payload = rawResponse.record;
  }

  // 2. Check if data is compressed
  if (payload && payload.compressed === true && typeof payload.data === 'string') {
    try {
      console.log("Detected compressed data, decompressing...");
      const decompressedString = LZString.decompressFromUTF16(payload.data);
      if (!decompressedString) throw new Error("Decompression result is empty");
      
      const parsedData = JSON.parse(decompressedString);
      return parsedData as CloudData;
    } catch (e) {
      console.error("Decompression failed:", e);
      // If decompression fails, we can't do much, return empty or throw
      throw new Error("Dữ liệu đám mây bị lỗi hoặc không tương thích (Lỗi giải nén).");
    }
  }

  // 3. Fallback: Old format (Uncompressed)
  // Check if it looks like CloudData
  if (payload && Array.isArray(payload.templates)) {
      return payload as CloudData;
  }

  return payload;
};

export const fetchCloudData = async (config: CloudConfig): Promise<CloudData> => {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json'
  };
  
  if (config.apiKey) {
    // Support common headers for various services (JSONBin, simple auth)
    headers['X-Access-Key'] = config.apiKey; 
    headers['X-Master-Key'] = config.apiKey;
    headers['Authorization'] = `Bearer ${config.apiKey}`;
  }

  const res = await fetch(config.endpoint, { 
    method: 'GET', 
    headers 
  });

  if (!res.ok) {
    throw new Error(`Sync Error: ${res.status} ${res.statusText}`);
  }

  const json = await res.json();
  return parseResponse(json);
};

export const saveCloudData = async (config: CloudConfig, data: CloudData): Promise<void> => {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json'
  };

  if (config.apiKey) {
    headers['X-Access-Key'] = config.apiKey;
    headers['X-Master-Key'] = config.apiKey;
    headers['Authorization'] = `Bearer ${config.apiKey}`;
  }

  // COMPRESSION LOGIC
  // 1. Convert entire data object to JSON string
  const jsonString = JSON.stringify(data);
  
  // 2. Compress using LZ-String (UTF16 is safe for JSON storage)
  const compressedString = LZString.compressToUTF16(jsonString);
  
  // 3. Create payload wrapper
  const payload: CompressedCloudPayload = {
      compressed: true,
      data: compressedString,
      updatedAt: new Date().toISOString()
  };

  // Usually PUT is used for updating an existing resource
  const res = await fetch(config.endpoint, {
    method: 'PUT',
    headers,
    body: JSON.stringify(payload)
  });

  if (!res.ok) {
    throw new Error(`Save Error: ${res.status} ${res.statusText}`);
  }
};