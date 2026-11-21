import { networkInterfaces } from "os";

// The address a phone on the same network should open (shown as a QR code on desktop).
export function GET() {
  const ip = Object.values(networkInterfaces()).flat().find((i) => i && i.family === "IPv4" && !i.internal)?.address;
  return Response.json({ url: ip ? `http://${ip}:3004` : null });
}
