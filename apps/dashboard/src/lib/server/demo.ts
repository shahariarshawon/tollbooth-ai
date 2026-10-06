/**
 * Whether this deployment offers the demo workspace. Read from the server's environment on every
 * request, never baked in at build time, so one image serves both a demo and a non-demo deployment.
 * The control plane has its own switch and enforces it independently.
 */
export function isDemoEnabled(): boolean {
  return process.env.DEMO_MODE === 'true';
}
