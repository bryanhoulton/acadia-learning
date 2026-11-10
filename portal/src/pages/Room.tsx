import "@livekit/components-styles";

import { useEffect, useState } from "react";

import { useActions, useValues } from "kea";
import { Room as LKRoom } from "livekit-client";
import {
  ArrowLeft,
  ArrowRight,
  LoaderCircle,
  LogOut,
  Settings,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import posthog from "posthog-js";
import { useNavigate } from "react-router-dom";
import { ActionIcon, Button, cn } from "slate-ui";

import { RoomAudioRenderer, RoomContext } from "@livekit/components-react";

import { AccountSettings } from "../components/AccountSettings";
import { AuthShell } from "../components/AuthShell";
import { Banner } from "../components/Banner";
import { ReferralBanner } from "../components/ReferralBanner";
import { agentLogic, getAgentRoom } from "../logic/agent/agentLogic";
import { authLogic } from "../logic/authLogic";
import { GetStarted } from "./GetStarted";
import { Session } from "./Session";

type MenuItem = {
  label: string;
  description?: string;
  onClick: () => void;
  hidden?: boolean;
  loading?: boolean;
};

function MenuItem({ label, description, onClick, loading }: MenuItem) {
  return (
    <button
      className="flex gap-8 items-center group w-full justify-between text-primary bg-primary-50 hover:bg-primary-500 hover:text-anti-primary cursor-pointer p-2 px-4 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-200"
      onClick={onClick}
      disabled={loading}
    >
      {loading ? (
        <LoaderCircle className="w-8 h-8 animate-spin" />
      ) : (
        <div className="flex flex-col gap-1 items-start">
          <span className="text-3xl">{label}</span>
          {description && (
            <span className="text-xs text-primary-300">{description}</span>
          )}
        </div>
      )}

      <ArrowRight className="w-4 h-4 transition duration-300 group-hover:translate-x-0 -translate-x-2" />
    </button>
  );
}

function ProfileSwitcher({ onBack }: { onBack: () => void }) {
  const { user, account } = useValues(authLogic);
  const { setUserId } = useActions(authLogic);

  if (!account) {
    return null;
  }

  const studentProfiles = account.profiles.filter(
    (profile) => profile.profile_type === "student"
  );

  return (
    <motion.div
      key="profile-switcher"
      className="space-y-6 max-w-4xl mx-auto p-2 bg-radial from-white to-transparent via-80% via-transparent"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3, ease: "easeInOut" }}
    >
      <Button variant="subtle" onClick={onBack} iconLeft={ArrowLeft}>
        Back
      </Button>
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold">Switch Profile</h1>
        <p className="text-gray-500">Select which profile you'd like to use</p>
      </div>

      <div className="flex flex-col gap-3 max-w-2xl">
        {studentProfiles.map((profile) => {
          const isActive = profile.id === user?.id;
          return (
            <button
              key={profile.id}
              onClick={() => {
                setUserId(profile.id);
                window.location.reload();
              }}
              className={cn(
                "p-6 rounded-lg border-2 text-left transition-all hover:border-primary-500 hover:shadow-md",
                isActive
                  ? "border-primary-500 bg-primary-50 shadow-sm"
                  : "border-gray-200 hover:bg-gray-50"
              )}
            >
              <div className="flex items-center justify-between">
                <div className="flex flex-col gap-1">
                  <div className="font-semibold text-xl">
                    {profile.name || "Unnamed Profile"}
                  </div>
                  <div className="text-sm text-gray-500 capitalize">
                    {profile.profile_type}
                  </div>
                </div>
                {isActive && (
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 bg-primary-500 rounded-full"></div>
                    <span className="text-primary-500 text-sm font-medium">
                      Current Profile
                    </span>
                  </div>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </motion.div>
  );
}

function Menu({ onJoin }: { onJoin: () => void }) {
  const navigate = useNavigate();
  const { user, account } = useValues(authLogic);
  const { logout } = useActions(authLogic);
  const { tokenLoading } = useValues(agentLogic);
  const [showSettings, setShowSettings] = useState(false);
  const [showProfileSwitcher, setShowProfileSwitcher] = useState(false);

  const studentProfileCount =
    account?.profiles.filter((p) => p.profile_type === "student").length || 0;

  return (
    <motion.div
      key="menu"
      className="absolute top-0 left-0 w-full h-full z-10 flex flex-col bg-neutral-50"
      initial={{ opacity: 0.3 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3, ease: "easeOut" }}
    >
      <div className="p-2 flex justify-between items-center">
        <Banner className="cursor-pointer" onClick={() => navigate("/")} />

        <div className="flex gap-1 items-center">
          <ActionIcon
            variant="subtle"
            icon={Settings}
            tooltip="Settings"
            onClick={() => setShowSettings(true)}
          />
          <ActionIcon
            variant="subtle"
            icon={LogOut}
            className="text-error-500 hover:bg-error-50"
            tooltip="Logout"
            onClick={() => logout()}
          />
        </div>
      </div>

      <AnimatePresence mode="wait">
        {showProfileSwitcher ? (
          <ProfileSwitcher onBack={() => setShowProfileSwitcher(false)} />
        ) : (
          <motion.div
            key="menu-content"
            className="grow flex flex-col items-center justify-center"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3, ease: "easeInOut" }}
          >
            <div className="flex flex-col gap-4">
              <h1 className="text-7xl font-bold px-4">
                Welcome{user?.name ? `, ${user.name}` : ""}.
              </h1>
              <div className="flex flex-col gap-2 pl-4">
                <MenuItem
                  label="Join Classroom"
                  onClick={onJoin}
                  loading={tokenLoading}
                />
                {studentProfileCount > 1 && (
                  <MenuItem
                    label="Switch Profile"
                    onClick={() => setShowProfileSwitcher(true)}
                    description="Switch to a different profile"
                  />
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AccountSettings
        open={showSettings}
        onClose={() => setShowSettings(false)}
      />
    </motion.div>
  );
}

// Component that provides RoomContext for LiveKit hooks
function RoomProvider({
  room,
  children,
}: {
  room: LKRoom;
  children: React.ReactNode;
}) {
  return (
    <RoomContext.Provider value={room}>
      <RoomAudioRenderer />
      {children}
    </RoomContext.Provider>
  );
}

export default function Room() {
  const { loadToken, disconnect, connect } = useActions(agentLogic);
  const { token, isConnected } = useValues(agentLogic);
  const { account } = useValues(authLogic);

  // Track the room from AgentClient
  const [room, setRoom] = useState<LKRoom | null>(null);

  // Poll for room availability (it's in cache, not state)
  useEffect(() => {
    if (!token) {
      setRoom(null);
      return;
    }

    const interval = setInterval(() => {
      const r = getAgentRoom();
      if (r && r !== room) {
        setRoom(r);
      }
    }, 100);

    return () => clearInterval(interval);
  }, [token, room]);

  // Connect when token is available
  useEffect(() => {
    if (token && !isConnected && !room) {
      connect();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, isConnected, room]);

  // Check if user has sent an SMS first (before any other checks)
  const hasTextedTutor = account?.has_texted_tutor || false;

  // Check if any profiles have names
  const hasNamedProfiles =
    account?.profiles.some(
      (profile) => profile.name && profile.name.trim() !== ""
    ) || false;

  // Priority 1: If user hasn't texted the tutor, show SMS verification prompt
  if (!hasTextedTutor) {
    return (
      <AuthShell>
        <GetStarted />
      </AuthShell>
    );
  }

  // Priority 2: If no profiles have names, show the GetStarted page
  if (!hasNamedProfiles) {
    return (
      <AuthShell>
        <GetStarted />
      </AuthShell>
    );
  }

  return (
    <AuthShell>
      <div className="flex flex-col h-screen w-screen">
        <ReferralBanner />
        <div className="flex-1 relative">
          <AnimatePresence mode="wait">
            {!token && (
              <Menu
                onJoin={() => {
                  posthog.capture("room_joined");
                  loadToken();
                }}
              />
            )}
          </AnimatePresence>
          {!token || !room ? null : (
            <RoomProvider room={room}>
              <div className="h-full w-full">
                <Session
                  onLeave={() => disconnect()}
                  onReconnect={() => {
                    disconnect();
                    loadToken();
                  }}
                />
              </div>
            </RoomProvider>
          )}
        </div>
      </div>
    </AuthShell>
  );
}
