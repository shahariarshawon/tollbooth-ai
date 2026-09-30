/** Response contract shared by every service's `GET /health` endpoint. */
export interface HealthResponse {
  status: 'ok';
  service: string;
  uptimeSeconds: number;
}

export function buildHealthResponse(service: string): HealthResponse {
  return { status: 'ok', service, uptimeSeconds: Math.round(process.uptime()) };
}
