import {
  useCallback,
  useRef,
  useState,
} from 'react';

import { Volume2 } from 'lucide-react';
import { Button } from 'slate-ui';

import popSound from '../sounds/pop.mp3';

const LOADING_DURATION_MS = 2000; // 2s loading
const DISABLED_DURATION_MS = 1000; // 1s disabled after loading
const SOUND_INTERVAL_MS = 600; // Interval between sounds

type TestSoundButtonProps = {
  outputDeviceId?: string;
};

export function TestSoundButton({ outputDeviceId }: TestSoundButtonProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [isDisabled, setIsDisabled] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const playSound = useCallback(async () => {
    const audio = new Audio(popSound);
    audioRef.current = audio;

    // Set the output device if specified and supported
    if (outputDeviceId && "setSinkId" in audio) {
      try {
        await (
          audio as HTMLAudioElement & {
            setSinkId: (id: string) => Promise<void>;
          }
        ).setSinkId(outputDeviceId);
      } catch (e) {
        console.warn("Failed to set audio output device:", e);
      }
    }

    audio.play();
  }, [outputDeviceId]);

  const handleClick = async () => {
    if (isDisabled || isLoading) return;

    setIsLoading(true);

    // Play sound 3 times with intervals
    await playSound();
    setTimeout(() => playSound(), SOUND_INTERVAL_MS);
    setTimeout(() => playSound(), SOUND_INTERVAL_MS * 2);

    // After loading duration, switch to disabled state
    setTimeout(() => {
      setIsLoading(false);
      setIsDisabled(true);

      // After disabled duration, re-enable button
      setTimeout(() => {
        setIsDisabled(false);
      }, DISABLED_DURATION_MS);
    }, LOADING_DURATION_MS);
  };

  return (
    <Button
      variant="default"
      size="sm"
      iconLeft={Volume2}
      onClick={handleClick}
      loading={isLoading}
      disabled={isDisabled}
      title="Play a test sound to check your speakers"
    >
      {isLoading ? "Playing..." : isDisabled ? "Played" : "Test"}
    </Button>
  );
}
