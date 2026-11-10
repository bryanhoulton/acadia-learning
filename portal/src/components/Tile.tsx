import {
  useEffect,
  useState,
} from 'react';

import { colord } from 'colord';
import {
  type HTMLMotionProps,
  motion,
} from 'framer-motion';
import {
  type Participant,
  RoomEvent,
  Track,
} from 'livekit-client';
import {
  PlugZap,
  UserRoundIcon,
} from 'lucide-react';
import { cn } from 'slate-ui';
import { useSound } from 'use-sound';

import {
  useTracks,
  useTrackVolume,
} from '@livekit/components-react';

import audio from '../sounds/pop.mp3';

interface TileProps extends HTMLMotionProps<"div"> {
  participant?: Participant;
  children?: React.ReactNode;
  name?: string;
}

export function Tile({
  participant,
  children,
  className,
  name,
  ...props
}: TileProps) {
  const [hasPlayed, setHasPlayed] = useState(false);
  const [play] = useSound(audio);
  const audioTrackRefs = useTracks([Track.Source.Microphone], {
    updateOnlyOn: [RoomEvent.ActiveSpeakersChanged],
    onlySubscribed: false,
  });
  const audioTrackRef = audioTrackRefs.find(
    (trackRef) => trackRef.participant.sid === participant?.sid
  );
  const volume = useTrackVolume(audioTrackRef, {
    smoothingTimeConstant: 0.5,
  });

  // Lerp between grey and green
  const audioStrengthColor = colord({ r: 0, g: 255, b: 0 })
    .mix(colord({ r: 128, g: 128, b: 128 }), 1 - volume)
    .toRgbString();

  // Play sound on join
  useEffect(() => {
    if (participant && !hasPlayed) {
      play();
      setHasPlayed(true);
    }
  }, [play, participant, hasPlayed]);

  return (
    <motion.div
      className={cn(
        "h-1/2 overflow-hidden rounded-lg relative  text-white border",
        className
      )}
      style={{
        boxShadow: "5px 5px 10px #0c0c0c, -5px -5px 10px #222222",
        borderColor:
          audioTrackRef && !audioTrackRef.publication.track?.isMuted
            ? audioStrengthColor
            : "var(--color-error-500)",
      }}
      initial={{
        scale: 0.9,
        opacity: 0,
      }}
      animate={{
        scale: participant ? 1 : 0.98,
        opacity: 1,
      }}
      {...props}
    >
      {!participant ? (
        <div className="h-full w-full bg-neutral-800 flex flex-col items-center justify-center gap-2">
          <PlugZap className="w-10 h-10 text-white" strokeWidth={1.5} />
          <div className="text-primary-200 text-md">Waiting...</div>
        </div>
      ) : (
        children
      )}

      {name && (
        <div className="absolute bottom-2 left-2 flex items-center gap-1 rounded-lg bg-primary-900/50 backdrop-blur-sm px-2 py-1 text-sm">
          <UserRoundIcon className="w-3 h-3" />
          {name}
        </div>
      )}
    </motion.div>
  );
}
