import { handle } from "@astrojs/cloudflare/handler";
import { processImportStep } from "./core/services/import-queue-consumer.ts";

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext) {
    return handle(request, env, ctx);
  },
  async queue(batch: MessageBatch<import("./core/services/import-queue-consumer.ts").ImportQueueMessage>, env: Env) {
    for (const message of batch.messages) {
      try {
        await processImportStep(message.body.jobId, message.body.stepIndex, env);
        message.ack();
      } catch {
        message.retry();
      }
    }
  },
} satisfies ExportedHandler<Env>;
