import {
  useEffect,
  useState,
} from 'react';

import { Track } from 'livekit-client';
import { AnimatePresence } from 'motion/react';

import {
  useTracks,
  useTrackVolume,
} from '@livekit/components-react';

import { MicrophoneWarningToast } from './MicrophoneWarningToast';

const SILENCE_THRESHOLD = 0.05; // Volume threshold for "silence"
const SILENCE_DURATION_MS = 3000; // 3 seconds of silence

type MicrophoneWarningProps = {
  onOpenSettings: () => void;
};

export function MicrophoneWarning({ onOpenSettings }: MicrophoneWarningProps) {
  const [showWarning, setShowWarning] = useState(false);

  const tracks = useTracks();
  const micTrack = tracks.find(
    (t) => t.participant.isLocal && t.source === Track.Source.Microphone
  );

  const isMuted = micTrack?.publication.isMuted ?? false;
  const volume = useTrackVolume(micTrack, {
    smoothingTimeConstant: 0.5,
  });

  // Track if we're currently in "silence" mode
  const isSilent = volume < SILENCE_THRESHOLD;

  useEffect(() => {
    // Only check if mic exists and is not muted
    if (!micTrack || isMuted) {
      setShowWarning(false);
      return;
    }

    // If volume is below threshold, start silence timer
    if (isSilent) {
      const timer = setTimeout(() => {
        setShowWarning(true);
      }, SILENCE_DURATION_MS);

      return () => {
        clearTimeout(timer);
      };
    } else {
      // Audio detected, hide warning
      setShowWarning(false);
    }
  }, [isSilent, isMuted, micTrack]);

  return (
    <AnimatePresence>
      {showWarning && (
        <MicrophoneWarningToast
          onOpenSettings={onOpenSettings}
          variant="pill"
        />
      )}
    </AnimatePresence>
  );
}
