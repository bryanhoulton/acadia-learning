import React from "react";

import { useActions, useValues } from "kea";
import { ArrowRight, Check, Clock, User } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { ActionIcon, Badge, Button, cn, Menu } from "slate-ui";

import { authLogic } from "../logic/authLogic";
import LoadingState from "./LoadingState";
import { Logo } from "./Logo";

interface AppShellProps {
  children: React.ReactNode;
  className?: string;
}

function AppShell({ children, className }: AppShellProps) {
  const navigate = useNavigate();
  const { account, user, isAccountLoading, students } = useValues(authLogic);
  const { setUserId } = useActions(authLogic);

  if (isAccountLoading) {
    return (
      <div className="h-screen flex min-w-full items-center justify-center">
        <LoadingState />
      </div>
    );
  }

  return (
    <div className="flex flex-col absolute inset-0 items-stretch overflow-hidden h-[100vh]">
      <div className="flex justify-between items-center p-2 border m-3 rounded-xl bg-neutral-50">
        <div
          className="flex items-center gap-2 cursor-pointer"
          onClick={() => navigate("/")}
        >
          <Logo className="w-8 h-8" />
          <h1 className="text-xl font-medium">Acadia</h1>
          {!account?.stripe_customer_id && (
            <Badge variant="info" iconLeft={Clock}>
              Trial Account
            </Badge>
          )}
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="primary"
            iconRight={ArrowRight}
            onClick={() => navigate("/room")}
          >
            Classroom
          </Button>

          {students.length > 1 && (
            <Menu
              items={students.map((student) => ({
                type: "button",
                id: student.id,
                label: student.name ?? "",
                iconRight: user?.id === student.id ? Check : ArrowRight,
                onClick: () => setUserId(student.id),
              }))}
            >
              <ActionIcon
                variant="subtle"
                icon={User}
                tooltip="Select Profile"
              />
            </Menu>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-auto bg-neutral-50 border-l max-w-full h-full flex flex-col">
        <div className={cn("grow p-4", className)}>{children}</div>
      </div>
    </div>
  );
}

export default AppShell;
