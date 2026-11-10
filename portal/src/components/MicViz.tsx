import { Track } from 'livekit-client';
import {
  type HTMLMotionProps,
  motion,
} from 'motion/react';
import { cn } from 'slate-ui';

import {
  useMultibandTrackVolume,
  useTracks,
} from '@livekit/components-react';

const NUM_BANDS = 30; // change to any number

export type MicVizProps = HTMLMotionProps<"div">;

export function MicrophoneVisualizer({ className, ...props }: MicVizProps) {
  const tracks = useTracks();
  const localTrack = tracks.find(
    (track) =>
      track.participant.isLocal && track.source === Track.Source.Microphone
  );

  const volumeBands = useMultibandTrackVolume(localTrack, {
    bands: NUM_BANDS,
    loPass: 100,
    hiPass: 200,
  });

  return (
    <motion.div className={cn("flex items-center gap-1", className)} {...props}>
      {volumeBands.map((band, index) => (
        <div
          key={index}
          className="grow min-w-1 bg-primary-500 rounded-full min-h-1"
          style={{ height: `${band * 100}%` }}
        ></div>
      ))}
    </motion.div>
  );
}
