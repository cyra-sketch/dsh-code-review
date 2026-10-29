export interface DeliveryJob { id: string; tenantId: string; url: string; body: unknown; attempts: number; nextAttemptAt: string; }
export interface DeliveryStore { claimNext(workerId: string): Promise<DeliveryJob | null>; markDelivered(jobId: string, statusCode: number): Promise<void>; markFailed(jobId: string, error: string): Promise<void>; }
export interface HttpClient { post(url: string, body: unknown, headers: Record<string, string>): Promise<{ status: number }>; }
export type PulseResult = "idle" | "delivered" | "failed";

export class WebhookDelivery {
  constructor(private readonly store: DeliveryStore, private readonly http: HttpClient) {}

  async pulse(): Promise<PulseResult> {
    const job = await this.store.claimNext("worker-1");
    if (!job) return "idle";

    const result = await this.http.post(job.url, job.body, { "content-type": "application/json", "x-delivery-id": job.id });
    if (result.status >= 200 && result.status < 300) {
      await this.store.markDelivered(job.id, result.status);
      return "delivered";
    }

    await this.store.markFailed(job.id, `HTTP ${result.status}`);
    return "failed";
  }
}
