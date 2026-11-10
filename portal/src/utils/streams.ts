import { Room } from 'livekit-client';

type Callback = (data: string, sender: string) => void;
type TopicCallbacks = Record<string, Callback>; // id -> callback
type ManyTopicCallbacks = Record<string, TopicCallbacks>; // topic -> id -> callback

export class StreamHandler {
  readonly room: Room;
  private callbacks: ManyTopicCallbacks;

  constructor(room: Room) {
    if (!room) {
      throw new Error("Room is required");
    }
    this.room = room;
    this.callbacks = {};
  }

  _register(topic: string) {
    console.log(`[StreamHandler] Registering handler for topic: ${topic}`);
    this.room.registerTextStreamHandler(topic, async (stream, sender) => {
      const data = await stream.readAll();
      console.log(`[StreamHandler] Received message on topic "${topic}" from ${sender.identity}:`, data.substring(0, 200));
      this._helper_callback(topic, data, sender.identity);
    });
  }

  _unregister(topic: string) {
    this.room.unregisterTextStreamHandler(topic);
  }

  _helper_callback(topic: string, data: string, sender: string) {
    if (!this.callbacks[topic]) {
      console.warn(`[StreamHandler] No callbacks registered for topic: ${topic}`);
      return;
    }
    const callbackIds = Object.keys(this.callbacks[topic]);
    console.log(`[StreamHandler] Calling ${callbackIds.length} callback(s) for topic "${topic}":`, callbackIds);
    for (const callback of Object.values(this.callbacks[topic])) {
      callback(data, sender);
    }
  }

  register(id: string, topic: string, callback: Callback) {
    const isNewTopic = !this.callbacks[topic];
    console.log(`[StreamHandler] Registering "${id}" for topic: ${topic}, isNewTopic: ${isNewTopic}`);
    if (isNewTopic) {
      this.callbacks[topic] = {};
      this._register(topic);
    }
    this.callbacks[topic][id] = callback;
    console.log(`[StreamHandler] Current callbacks for topic "${topic}":`, Object.keys(this.callbacks[topic]));
  }

  // Force re-register all topics with LiveKit (useful after reconnection)
  reregisterAllTopics() {
    const topics = Object.keys(this.callbacks);
    console.log(`[StreamHandler] Re-registering ${topics.length} topics with LiveKit:`, topics);
    for (const topic of topics) {
      this._register(topic);
    }
  }

  unregister(id: string, topic: string) {
    console.log(`[StreamHandler] Unregistering "${id}" from topic: ${topic}`);
    if (!this.callbacks[topic]) {
      console.log(`[StreamHandler] No callbacks for topic ${topic}, nothing to unregister`);
      return;
    }
    if (!this.callbacks[topic][id]) {
      console.log(`[StreamHandler] No callback with id "${id}" for topic ${topic}`);
      return;
    }
    delete this.callbacks[topic][id];
    if (Object.keys(this.callbacks[topic]).length === 0) {
      console.log(`[StreamHandler] No more callbacks for topic ${topic}, unregistering from room`);
      delete this.callbacks[topic];
      this._unregister(topic);
    }
  }
}
