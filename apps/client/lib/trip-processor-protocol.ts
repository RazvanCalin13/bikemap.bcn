import { z } from "zod";
import type { DeckTrip, RawTrip } from "./trip-types";

// === Main Thread -> Worker Messages ===

export const InitMessageSchema = z.object({
  type: z.literal("init"),
  windowStartMs: z.number(),
  fadeDurationSimSeconds: z.number(),
});
export type InitMessage = z.infer<typeof InitMessageSchema>;

const RawTripSchema = z.object({
  id: z.string(),
  startStationId: z.string(),
  endStationId: z.string(),
  startedAt: z.string(),
  endedAt: z.string(),
  rideableType: z.string(),
  memberCasual: z.string(),
  startLat: z.number(),
  startLng: z.number(),
  endLat: z.number().nullable(),
  endLng: z.number().nullable(),
  routeGeometry: z.string().nullable(),
  routeDistance: z.number().nullable(),
  routeDuration: z.number().nullable(),
});

export const LoadBatchMessageSchema = z.object({
  type: z.literal("load-batch"),
  batchId: z.number(),
  trips: z.array(RawTripSchema),
});
export type LoadBatchMessage = z.infer<typeof LoadBatchMessageSchema>;

export const RequestChunkMessageSchema = z.object({
  type: z.literal("request-chunk"),
  chunkIndex: z.number(),
});
export type RequestChunkMessage = z.infer<typeof RequestChunkMessageSchema>;

export const ClearBatchMessageSchema = z.object({
  type: z.literal("clear-batch"),
  batchId: z.number(),
});
export type ClearBatchMessage = z.infer<typeof ClearBatchMessageSchema>;

export type MainToWorkerMessage =
  | InitMessage
  | LoadBatchMessage
  | RequestChunkMessage
  | ClearBatchMessage;

// === Worker -> Main Thread Messages ===

export const ReadyMessageSchema = z.object({
  type: z.literal("ready"),
});
export type ReadyMessage = z.infer<typeof ReadyMessageSchema>;

export const BatchProcessedMessageSchema = z.object({
  type: z.literal("batch-processed"),
  batchId: z.number(),
  tripCount: z.number(),
});
export type BatchProcessedMessage = z.infer<typeof BatchProcessedMessageSchema>;

// Note: DeckTrip[] is too complex for Zod validation on every message
// We trust the worker output since it's our own code
export type ChunkResponseMessage = {
  type: "chunk-response";
  chunkIndex: number;
  trips: DeckTrip[];
};

export const RequestBatchMessageSchema = z.object({
  type: z.literal("request-batch"),
  batchId: z.number(),
});
export type RequestBatchMessage = z.infer<typeof RequestBatchMessageSchema>;

export const ErrorMessageSchema = z.object({
  type: z.literal("error"),
  message: z.string(),
  context: z.string().optional(),
});
export type ErrorMessage = z.infer<typeof ErrorMessageSchema>;

export type WorkerToMainMessage =
  | ReadyMessage
  | BatchProcessedMessage
  | ChunkResponseMessage
  | RequestBatchMessage
  | ErrorMessage;
