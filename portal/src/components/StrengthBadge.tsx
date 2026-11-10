import {
  ComponentProps,
  forwardRef,
} from 'react';

import {
  Badge,
  cn,
} from 'slate-ui';

import { components } from '../types/api';
import {
  averageStrength,
  getProgressVariant,
} from '../utils/nodes';

// Use SkillLevelEnum (the current API schema name for strength levels)
type StrengthEnum = components["schemas"]["SkillLevelEnum"];

export interface StrengthBadgeProps {
  strength?: StrengthEnum | StrengthEnum[] | null;
  children?: React.ReactNode;
  className?: string;
}

const CLASSNAME = "capitalize text-sm";

function getProps(
  strength: StrengthEnum,
  className?: string
): ComponentProps<typeof Badge> {
  if (strength === "automatic")
    return {
      variant: "subtle",
      className: cn(className, CLASSNAME, "bg-black text-white shadow-lg"),
    };
  return {
    variant: getProgressVariant(strength),
    className: cn(className, CLASSNAME),
  };
}

export const StrengthBadge = forwardRef<HTMLSpanElement, StrengthBadgeProps>(
  ({ strength, children, className }, ref) => {
    if (Array.isArray(strength)) {
      const avg = averageStrength(strength);
      return (
        <Badge {...getProps(avg, className)} ref={ref}>
          {children || avg}
        </Badge>
      );
    }
    if (!strength) {
      strength = "untouched";
    }
    return (
      <Badge {...getProps(strength, className)} ref={ref}>
        {children || strength}
      </Badge>
    );
  }
);
