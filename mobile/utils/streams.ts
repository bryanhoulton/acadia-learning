import type { Room } from 'livekit-client';

type Callback = (data: string, sender: string) => void;
type TopicCallbacks = Record<string, Callback>; // id -> callback
type ManyTopicCallbacks = Record<string, TopicCallbacks>; // topic -> id -> callback

export class StreamHandler {
  private room: Room;
  private callbacks: ManyTopicCallbacks;

  constructor(room: Room) {
    if (!room) {
      throw new Error("Room is required");
    }
    this.room = room;
    this.callbacks = {};
  }

  _register(topic: string) {
    this.room.registerTextStreamHandler(topic, async (stream, sender) => {
      const data = await stream.readAll();
      this._helper_callback(topic, data, sender.identity);
    });
  }

  _unregister(topic: string) {
    this.room.unregisterTextStreamHandler(topic);
  }

  _helper_callback(topic: string, data: string, sender: string) {
    if (!this.callbacks[topic]) {
      return;
    }
    const callbacks = Object.values(this.callbacks[topic]);
    for (const callback of callbacks) {
      callback(data, sender);
    }
  }

  register(id: string, topic: string, callback: Callback) {
    if (!this.callbacks[topic]) {
      this.callbacks[topic] = {};
      this._register(topic);
    }
    this.callbacks[topic][id] = callback;
  }

  unregister(id: string, topic: string) {
    if (!this.callbacks[topic]) {
      return;
    }
    if (!this.callbacks[topic][id]) {
      return;
    }
    delete this.callbacks[topic][id];
    if (Object.keys(this.callbacks[topic]).length === 0) {
      delete this.callbacks[topic];
      this._unregister(topic);
    }
  }
}
