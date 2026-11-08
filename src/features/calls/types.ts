export type CallState =
  | "idle"
  | "calling"
  | "ringing"
  | "connected"
  | "ended"
  | "declined";

export interface IceCandidatePayload {
  candidate: string;
  sdpMid?: string | null;
  sdpMLineIndex?: number | null;
}

export interface CallSignalData {
  callerUid: string;
  receiverUid?: string;
  state: CallState;
  offer?: {
    type: "offer";
    sdp: string;
  };
  answer?: {
    type: "answer";
    sdp: string;
  };
  callerCandidates?: Record<string, IceCandidatePayload>;
  receiverCandidates?: Record<string, IceCandidatePayload>;
  startedAt?: number;
  endedAt?: number;
}
