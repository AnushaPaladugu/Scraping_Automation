import axios, { AxiosRequestConfig, AxiosResponse } from "axios";
import { config } from "../config";

export interface HttpResponse {
  ok: boolean;
  status: number;
  data: any;
  finalUrl: string;
  headers: Record<string, any>;
  error?: string;
}

export async function fetchUrl(
  url: string,
  options: AxiosRequestConfig = {}
): Promise<HttpResponse> {
  const mergedConfig: AxiosRequestConfig = {
    timeout: config.SCRAPER_TIMEOUT,
    headers: {
      "User-Agent": config.USER_AGENT,
      Accept:
        "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/json",
      "Accept-Language": "en-US,en;q=0.9",
      ...options.headers,
    },
    maxRedirects: 5,
    validateStatus: () => true, // capture all status codes safely
    ...options,
  };

  try {
    const res: AxiosResponse = await axios(url, mergedConfig);
    const finalUrl = res.request?.res?.responseUrl || url;
    return {
      ok: res.status >= 200 && res.status < 400,
      status: res.status,
      data: res.data,
      finalUrl,
      headers: res.headers,
    };
  } catch (err: any) {
    // If axios fails (e.g. ECONNRESET, timeout, Windows TLS socket issue), fallback to native fetch
    try {
      const timeoutMs = (mergedConfig.timeout as number) || 4000;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      const res = await fetch(url, {
        headers: (mergedConfig.headers as any) || {},
        signal: controller.signal,
        redirect: "follow",
      });
      clearTimeout(timer);
      const cType = res.headers.get("content-type") || "";
      const data = cType.includes("application/json") ? await res.json().catch(() => res.text()) : await res.text();
      const headersObj: Record<string, string> = {};
      res.headers.forEach((v, k) => {
        headersObj[k] = v;
      });
      return {
        ok: res.ok,
        status: res.status,
        data,
        finalUrl: res.url,
        headers: headersObj,
      };
    } catch {
      return {
        ok: false,
        status: err.response?.status || 500,
        data: null,
        finalUrl: url,
        headers: {},
        error: err.message || "Unknown network error",
      };
    }
  }
}
