import { GameState, JoinedMessage, PickupMessage, ShopResultMessage } from './types';

export type MessageHandler<T> = (msg: T) => void;

export class Network {
  private ws: WebSocket | null = null;
  connected = false;
  onState: MessageHandler<GameState> | null = null;
  onJoined: MessageHandler<JoinedMessage> | null = null;
  onEvent: MessageHandler<any> | null = null;
  onPickup: MessageHandler<PickupMessage> | null = null;
  onShopResult: MessageHandler<ShopResultMessage> | null = null;
  private messageQueue: any[] = [];

  connect() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const url = `${protocol}//${window.location.host}/ws`;
    console.log('Connecting to', url);

    this.ws = new WebSocket(url);

    this.ws.onopen = () => {
      console.log('WebSocket connected');
      this.connected = true;
      for (const msg of this.messageQueue) {
        this.ws!.send(JSON.stringify(msg));
      }
      this.messageQueue = [];
    };

    this.ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        switch (msg.type) {
          case 'state':
            this.onState?.(msg);
            break;
          case 'joined':
            this.onJoined?.(msg);
            break;
          case 'event':
            this.onEvent?.(msg);
            break;
          case 'pickup_ok':
            this.onPickup?.(msg);
            break;
          case 'shop_result':
            this.onShopResult?.(msg);
            break;
        }
      } catch (e) {
        console.error('Failed to parse message:', e);
      }
    };

    this.ws.onclose = () => {
      console.log('WebSocket disconnected');
      this.connected = false;
      setTimeout(() => this.connect(), 2000);
    };

    this.ws.onerror = (err) => {
      console.error('WebSocket error:', err);
    };
  }

  send(msg: any) {
    if (this.connected && this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    } else {
      this.messageQueue.push(msg);
    }
  }

  sendInput(keys: { w: boolean; a: boolean; s: boolean; d: boolean }) {
    this.send({ type: 'input', keys });
  }

  sendCast(skillID: string, targetX: number, targetY: number) {
    this.send({ type: 'cast', skill_id: skillID, target_x: targetX, target_y: targetY });
  }

  sendJoin(hero: string, name: string) {
    this.send({ type: 'join', hero, name });
  }

  sendShopBuy(shopId: string, itemId: string) {
    this.send({ type: 'shop_buy', shop_id: shopId, item_id: itemId });
  }
}
