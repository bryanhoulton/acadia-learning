import { useMemo } from "react";

import { colord } from "colord";
import {
  LogOut,
  MessageCircle,
  Mic,
  MicOff,
  RefreshCw,
  Settings,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { ActionIcon, cn } from "slate-ui";

import { Connection, ConnectionStatusType } from "./Connection";

type SessionMenuProps = {
  connectionStatus: ConnectionStatusType;
  microphoneEnabled: boolean;
  userVolume: number;
  userVolumeBands?: number[];
  chatOpen?: boolean;
  hasUnreadChat?: boolean;
  onLeave?: () => void;
  onReconnect?: () => void;
  onToggleMicrophone?: () => void;
  onOpenSettings?: () => void;
  onToggleChat?: () => void;
  transcript?: string | null;
  transcriptCommitted?: boolean;
};

export function SessionMenu({
  connectionStatus,
  microphoneEnabled,
  userVolume,
  userVolumeBands = [],
  chatOpen,
  hasUnreadChat,
  onLeave,
  onReconnect,
  onToggleMicrophone,
  onOpenSettings,
  onToggleChat,
  transcript,
  transcriptCommitted,
}: SessionMenuProps) {
  const audioStrengthColor = useMemo(
    () =>
      colord({ r: 0, g: 255, b: 0 })
        .mix(colord("#d4d4d4"), 1 - userVolume)
        .toRgbString(),
    [userVolume]
  );

  return (
    <div className="relative flex flex-col items-center py-4 shrink-0">
      {/* Transcript - absolutely positioned above menu */}
      <AnimatePresence>
        {transcript && (
          <motion.div
            key="transcript"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className={cn(
              "absolute bottom-full left-1/2 -translate-x-1/2 translate-y-4 mb-2 px-4 py-2 rounded-2xl text-sm font-medium transition-colors duration-1000 max-w-xs text-center z-50",
              transcriptCommitted
                ? "bg-success-100 text-success-700"
                : "bg-gray-100 text-gray-700"
            )}
          >
            {transcript}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Menu row - leave button, center controls, settings button */}
      <div className="flex items-center justify-between w-full px-6">
        {/* Leave button */}
        <div className="bg-white rounded-full p-2 shadow border">
          <ActionIcon
            variant="subtle"
            icon={LogOut}
            tooltip="Leave the call"
            onClick={onLeave}
            className={cn(
              "rounded-full !ring-0 hover:bg-neutral-100 rotate-90"
            )}
          />
        </div>

        {/* Center menu - changes based on connection status */}
        <AnimatePresence mode="wait">
          {connectionStatus !== "connected" ? (
            /* Connection status - centered */
            <motion.div
              key="connecting"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="bg-white rounded-full p-2 flex items-center gap-1 justify-center shadow border"
            >
              <Connection status={connectionStatus} className="px-2" />
              {connectionStatus === "disconnected" && onReconnect && (
                <ActionIcon
                  variant="subtle"
                  icon={RefreshCw}
                  tooltip="Reconnect"
                  onClick={onReconnect}
                  className="rounded-full !ring-0 hover:bg-neutral-100"
                />
              )}
            </motion.div>
          ) : (
            <motion.div
              key="connected-center"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="bg-white rounded-full p-2 shadow border flex items-center"
              style={{
                borderColor: microphoneEnabled
                  ? audioStrengthColor
                  : "var(--color-error-500)",
              }}
            >
              {/* Audio visualization bars */}
              <motion.div
                className="flex items-center justify-center gap-1 h-8 overflow-hidden"
                animate={{
                  width: microphoneEnabled ? 48 : 0,
                  paddingLeft: microphoneEnabled ? 8 : 0,
                  marginRight: microphoneEnabled ? 8 : 0,
                  opacity: microphoneEnabled ? 1 : 0,
                }}
                transition={{ duration: 0.2, ease: "easeInOut" }}
              >
                {userVolumeBands.map((bandVolume, i) => (
                  <motion.div
                    key={i}
                    className="w-1.5 rounded-full"
                    animate={{
                      height: microphoneEnabled
                        ? `${Math.max(16, bandVolume * 100)}%`
                        : "16%",
                      backgroundColor: bandVolume > 0.1 ? "#22c55e" : "#d4d4d4",
                    }}
                    transition={{
                      height: {
                        duration: 0.05,
                        ease: "easeOut",
                      },
                      backgroundColor: {
                        duration: 0.1,
                      },
                    }}
                  />
                ))}
              </motion.div>

              <ActionIcon
                variant="subtle"
                icon={microphoneEnabled ? Mic : MicOff}
                tooltip={microphoneEnabled ? "Mute" : "Unmute"}
                onClick={() => onToggleMicrophone?.()}
                className={cn(
                  "rounded-full !ring-0 hover:bg-error-100",
                  !microphoneEnabled && "text-error-500"
                )}
              />

              {/* Chat button */}
              <div className="relative ml-1">
                <ActionIcon
                  variant="subtle"
                  icon={MessageCircle}
                  tooltip={chatOpen ? "Close chat" : "Open chat"}
                  onClick={onToggleChat}
                  className={cn(
                    "rounded-full !ring-0 hover:bg-neutral-100",
                    chatOpen && "bg-neutral-100"
                  )}
                />
                {!chatOpen && hasUnreadChat && (
                  <span className="absolute -top-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-error-500" />
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Settings button */}
        <div className="bg-white rounded-full p-2 shadow border">
          <ActionIcon
            variant="subtle"
            icon={Settings}
            tooltip="Settings"
            onClick={onOpenSettings}
            className={cn("rounded-full !ring-0 hover:bg-neutral-100")}
          />
        </div>
      </div>
    </div>
  );
}
