import { kea } from 'kea';
import { Room } from 'livekit-client';

import { StreamHandler } from '../utils/streams';
import type { pushToTalkLogicType } from './pushToTalkLogicType';

export type PushToTalkLogicProps = {
  room: Room;
};

export const pushToTalkLogic = kea<pushToTalkLogicType>({
  path: ["src", "logic", "pushToTalkLogic"],
  props: {} as PushToTalkLogicProps,
  actions: {
    setPushToTalk: (pushToTalk: boolean) => ({ pushToTalk }),
    setInterimTranscript: (interimTranscript: string) => ({
      interimTranscript,
    }),
  },
  reducers: ({ props }) => ({
    pushToTalk: [false, { setPushToTalk: (_, { pushToTalk }) => pushToTalk }],
    interimTranscript: [
      "",
      { setInterimTranscript: (_, { interimTranscript }) => interimTranscript },
    ],
    streamHandler: [new StreamHandler(props.room)],
  }),
  listeners: ({ props }) => ({
    setPushToTalk: ({ pushToTalk }) => {
      props.room.localParticipant.sendText(pushToTalk ? "on" : "off", {
        topic: "push-to-talk",
      });
    },
  }),

  events: ({ actions, values }) => ({
    afterMount: () => {
      const handleKeyDown = (e: KeyboardEvent) => {
        if (
          e.key === " " &&
          !e.repeat &&
          !(e.target instanceof HTMLInputElement)
        ) {
          actions.setPushToTalk(true);
        }
      };
      const handleKeyUp = (e: KeyboardEvent) => {
        if (e.key === " " && !(e.target instanceof HTMLInputElement)) {
          setTimeout(() => actions.setPushToTalk(false), 500);
        }
      };
      window.addEventListener("keydown", handleKeyDown);
      window.addEventListener("keyup", handleKeyUp);

      values.streamHandler.register("ptt-logic", "interim-transcript", (data) =>
        actions.setInterimTranscript(data)
      );
      values.streamHandler.register("ptt-logic", "final-transcript", (data) =>
        console.log("final-transcript", data)
      );

      return () => {
        window.removeEventListener("keydown", handleKeyDown);
        window.removeEventListener("keyup", handleKeyUp);
        values.streamHandler.unregister("ptt-logic", "interim-transcript");
        values.streamHandler.unregister("ptt-logic", "final-transcript");
      };
    },
  }),
});
