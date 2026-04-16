class RealtimeClient {
  constructor() {
    this.ws = null;
  }

  connect(onEvent) {
    this.ws = new WebSocket(import.meta.env.VITE_API_URL.replace('http', 'ws'));

    this.ws.onmessage = (message) => {
      const { event, data } = JSON.parse(message.data);
      onEvent(event, data);
    };
  }
}

export default new RealtimeClient();
