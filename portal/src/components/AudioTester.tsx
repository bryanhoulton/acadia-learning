import { Track } from 'livekit-client';
import { MicOff } from 'lucide-react';
import {
  Button,
  cn,
  Label,
  Select,
} from 'slate-ui';

import {
  useMediaDeviceSelect,
  useTracks,
  useTrackToggle,
  useTrackVolume,
} from '@livekit/components-react';

import { TestSoundButton } from './TestSoundButton';

export function AudioTester() {
  // Input devices (microphones)
  const {
    devices: inputDevices,
    activeDeviceId: activeInputId,
    setActiveMediaDevice: setActiveInputDevice,
  } = useMediaDeviceSelect({
    kind: "audioinput",
  });

  // Output devices (speakers)
  const {
    devices: outputDevices,
    activeDeviceId: activeOutputId,
    setActiveMediaDevice: setActiveOutputDevice,
  } = useMediaDeviceSelect({
    kind: "audiooutput",
  });

  const { toggle: toggleMic } = useTrackToggle({
    source: Track.Source.Microphone,
  });

  const tracks = useTracks();
  const micTrack = tracks.find(
    (t) => t.participant.isLocal && t.source === Track.Source.Microphone
  );

  const isMuted = micTrack?.publication.isMuted ?? false;

  const micVolume = useTrackVolume(micTrack, {
    smoothingTimeConstant: 0.25,
  });
  const displayVolume = Math.min(100, micVolume * 100);

  const inputDeviceItems = inputDevices.map((d) => ({
    id: d.deviceId,
    name: d.label || `Microphone ${d.deviceId.slice(0, 5)}...`,
  }));

  const outputDeviceItems = outputDevices.map((d) => ({
    id: d.deviceId,
    name: d.label || `Speaker ${d.deviceId.slice(0, 5)}...`,
  }));

  return (
    <div className="flex flex-col gap-6">
      {/* Input Section */}
      <div className="flex flex-col gap-4 p-4 border rounded-lg bg-gray-50">
        <h3 className="text-sm font-semibold text-gray-700">Input</h3>

        <div className="space-y-2">
          <Label>Microphone</Label>
          <Select
            items={inputDeviceItems}
            value={activeInputId}
            onChange={(id) => id && setActiveInputDevice(id)}
            placeholder="Select a microphone"
            disabled={inputDeviceItems.length === 0}
          />
        </div>

        <div className="space-y-2">
          <div className="flex justify-between items-center">
            <Label>Input Level</Label>
            <div
              className={cn(
                "text-xs flex items-center gap-1",
                isMuted ? "text-warning-600 font-medium" : "text-gray-500"
              )}
            >
              {isMuted && <MicOff className="w-3 h-3" />}
              {isMuted
                ? "Microphone is muted"
                : displayVolume > 5
                  ? "Detecting audio"
                  : "Listening..."}
              {isMuted && (
                <Button
                  variant="default"
                  size="sm"
                  className="ml-2"
                  onClick={() => toggleMic()}
                >
                  Unmute
                </Button>
              )}
            </div>
          </div>

          <div className="h-4 bg-gray-200 rounded-full overflow-hidden relative">
            <div
              className={cn(
                "h-full transition-all duration-100 ease-out",
                "bg-primary-500"
              )}
              style={{ width: `${displayVolume}%` }}
            />
            {/* Tick marks for reference */}
            <div className="absolute top-0 left-1/4 h-full w-px bg-white/50" />
            <div className="absolute top-0 left-1/2 h-full w-px bg-white/50" />
            <div className="absolute top-0 left-3/4 h-full w-px bg-white/50" />
          </div>
        </div>
      </div>

      {/* Output Section */}
      <div className="flex flex-col gap-4 p-4 border rounded-lg bg-gray-50">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-700">Output</h3>
          <TestSoundButton outputDeviceId={activeOutputId} />
        </div>

        <div className="space-y-2">
          <Label>Speaker</Label>
          <Select
            items={outputDeviceItems}
            value={activeOutputId}
            onChange={(id) => id && setActiveOutputDevice(id)}
            placeholder="Select a speaker"
            disabled={outputDeviceItems.length === 0}
          />
        </div>
      </div>
    </div>
  );
}
