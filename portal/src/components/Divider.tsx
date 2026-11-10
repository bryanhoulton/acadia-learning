import { ActionIcon } from 'slate-ui';
import {
  ActionIconProps,
} from 'slate-ui/dist/cjs/components/ActionIcon/ActionIcon.types';

export interface DividerProps {
  text: string;
  actionIcon?: ActionIconProps;
}

export function Divider({ text, actionIcon }: DividerProps) {
  return (
    <div className="flex items-center gap-2 w-full">
      <span className="text-gray-500 text-sm uppercase">{text}</span>
      <div className="grow border-t" />
      {actionIcon && <ActionIcon {...actionIcon} />}
    </div>
  );
}
