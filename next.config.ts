import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      {
        source: "/_klip-ai/runtime",
        destination:
          "https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.2.0",
      },
      {
        source: "/_klip-ai/ort/:asset*",
        destination:
          "https://cdn.jsdelivr.net/npm/onnxruntime-web@1.26.0-dev.20260416-b7804b056c/dist/:asset*",
      },
    ];
  },
};

export default nextConfig;
