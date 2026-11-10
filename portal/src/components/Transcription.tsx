import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';

import {
  AnimatePresence,
  type HTMLMotionProps,
  motion,
} from 'framer-motion';
import {
  Participant,
  RoomEvent,
  type TranscriptionSegment,
} from 'livekit-client';
import { cn } from 'slate-ui';
import { useDebounceCallback } from 'usehooks-ts';

import { useRoomContext } from '@livekit/components-react';

function filterTags(text: string) {
  // Filter out <.*>, <.*/>, [start].*>, [start].*/>, <.*[end]
  const regex = /<[^>]*>?|<\/.*?>?|\[.*?\]>|<\/.*?\[.*?\]>|<\/.*?>/;
  return text.replace(regex, "");
}

export default function Transcription({
  className,
  ...props
}: HTMLMotionProps<"div">) {
  const room = useRoomContext();
  const [lastChunk, setLastChunk] = useState<string | null>(null);
  const [latestTranscription, setLatestTranscription] = useState<string | null>(
    null
  );
  const callback = useCallback(() => setLatestTranscription(null), []);
  const clearTranscription = useDebounceCallback(callback, 3000);

  const shownTranscription = useMemo(() => {
    // If latest contains last chunk, split and return everything after last chunk
    if (lastChunk && latestTranscription?.includes(lastChunk)) {
      const chunks = latestTranscription.split(lastChunk);
      return chunks[chunks.length - 1];
    }

    return latestTranscription;
  }, [latestTranscription, lastChunk]);

  useEffect(() => {
    const words = shownTranscription?.split(" ");
    if (words && words.length > 8) {
      setLastChunk(words.slice(-9, -1).join(" "));
    }
  }, [shownTranscription]);

  useEffect(() => {
    const handleTranscription = (
      segments: TranscriptionSegment[],
      participant?: Participant
    ) => {
      const remoteParticipant = Array.from(room.remoteParticipants.values())[0];
      if (!remoteParticipant) {
        return;
      }
      if (remoteParticipant.identity === participant?.identity) {
        setLatestTranscription(segments[segments.length - 1].text);
        clearTranscription();
      }
    };

    room.on(RoomEvent.TranscriptionReceived, handleTranscription);

    return () => {
      room.off(RoomEvent.TranscriptionReceived, handleTranscription);
    };
  }, [room, clearTranscription]);

  return (
    <AnimatePresence>
      {shownTranscription && (
        <motion.div
          className={cn("bg-primary-900/50 rounded-lg p-1 text-sm", className)}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          key="transcription"
          transition={{ duration: 0.5 }}
          {...props}
        >
          {filterTags(shownTranscription)}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
