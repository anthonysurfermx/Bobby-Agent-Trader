/** Keeps one account's access response from replacing a newer account or meter snapshot. */
export interface AccessResponseTicket { epoch: number; sequence: number; owner: string }

export class AccessResponseGate {
  private epoch = 0;
  private sequence = 0;
  private applied = 0;

  get revision(): number { return this.epoch; }
  sameEpoch(revision: number): boolean { return revision === this.epoch; }

  invalidate(): void {
    this.epoch++;
    this.applied = ++this.sequence;
  }

  start(owner: string): AccessResponseTicket {
    return { epoch: this.epoch, sequence: ++this.sequence, owner };
  }

  accept(ticket: AccessResponseTicket, currentOwner: string): boolean {
    if (ticket.epoch !== this.epoch || ticket.owner !== currentOwner || ticket.sequence < this.applied) return false;
    this.applied = ticket.sequence;
    return true;
  }

  /** A read has already spent the meter on the server; reject older GET responses. */
  commitRead(): AccessResponseTicket {
    const ticket = this.start('');
    this.applied = ticket.sequence;
    return ticket;
  }

  isCurrent(ticket: AccessResponseTicket): boolean {
    return ticket.epoch === this.epoch && ticket.sequence >= this.applied;
  }
}

/** Raw credentials stay inside the browser process; this key is never logged or persisted. */
export function accessOwner(headers: Record<string, string>): string {
  return headers.Authorization ?? headers['x-bobby-session'] ?? headers['x-bobby-device'] ?? '';
}
