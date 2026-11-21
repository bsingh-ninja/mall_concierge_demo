import type { NextConfig } from "next";
import { networkInterfaces } from "os";

// Phones on the same Wi-Fi open the app by LAN IP; the dev server must accept that origin.
const lanIps = Object.values(networkInterfaces()).flat().filter((i) => i && i.family === "IPv4" && !i.internal).map((i) => i!.address);

const nextConfig: NextConfig = {
  devIndicators: false,
  allowedDevOrigins: lanIps,
  // The browser only talks to :3004; API calls are proxied to FastAPI so a phone needs one address.
  async rewrites() {
    return [{ source: "/api/:path*", destination: "http://127.0.0.1:8004/api/:path*" }];
  },
};

export default nextConfig;
