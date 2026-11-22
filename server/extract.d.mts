export function extractProduct(
  html: string,
  url: string,
  options?: { observedAt?: string }
): {
  result: {
    retailer?: string;
    offer?: { price: number; currency: string; unit: 'm2' | 'pack' | 'item' | 'unknown'; observedAt: string; source?: string };
    pack?: { coverageM2?: number; pieces?: number; source?: string };
    title: string;
    url: string;
    category: string;
    brand?: string;
    description?: string;
    color?: string;
    dimensions: { widthCm?: number; depthCm?: number; heightCm?: number; lengthCm?: number; thicknessMm?: number };
    image: { dataUrl: string; sourceUrl: string } | null;
    warnings: string[];
    evidence: string[];
  };
  candidateImage?: string;
};
