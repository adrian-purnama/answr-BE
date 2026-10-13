export type MidtransBuild = "development" | "production";

export interface MidtransUrls {
  snapBaseUrl: string;
  coreBaseUrl: string;
  snapJsUrl: string;
}

/**
 * Derive Midtrans hosts from BUILD only. MIDTRANS_URL is discarded.
 */
export function getMidtransUrls(build: MidtransBuild): MidtransUrls {
  if (build === "production") {
    return {
      snapBaseUrl: "https://app.midtrans.com",
      coreBaseUrl: "https://api.midtrans.com",
      snapJsUrl: "https://app.midtrans.com/snap/snap.js",
    };
  }
  return {
    snapBaseUrl: "https://app.sandbox.midtrans.com",
    coreBaseUrl: "https://api.sandbox.midtrans.com",
    snapJsUrl: "https://app.sandbox.midtrans.com/snap/snap.js",
  };
}
