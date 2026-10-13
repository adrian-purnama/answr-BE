export const LIVE_AGENT_SOCKET_EVENTS = {
  TICKET_CREATED: "ticket.created",
  TICKET_UPDATED: "ticket.updated",
  TICKET_CLAIMED: "ticket.claimed",
  TICKET_CLOSED: "ticket.closed",
  TICKET_MESSAGE: "ticket.message",
  TICKET_TYPING: "ticket.typing",
  QUEUE_UPDATED: "queue.updated",
  QUEUE_POSITION: "queue.position",
} as const;

export type LiveAgentSocketEvent =
  (typeof LIVE_AGENT_SOCKET_EVENTS)[keyof typeof LIVE_AGENT_SOCKET_EVENTS];

export function ticketRoom(ticketId: string): string {
  return `ticket:${ticketId}`;
}

export function queueRoom(apiKeyId: string): string {
  return `queue:${apiKeyId}`;
}
