import { CharacterState, CharacterVariant } from "./types";
import { Blob } from "./characters/Blob";
import { Robot } from "./characters/Robot";
import { Dino } from "./characters/Dino";

interface CharacterProps {
  state: CharacterState;
  variant?: CharacterVariant;
  size?: number;
  className?: string;
  /** Audio level from 0-1, controls mouth opening when talking */
  audioLevel?: number;
}

export function Character({
  state,
  variant = "blob",
  size = 200,
  className = "",
  audioLevel = 0,
}: CharacterProps) {
  const renderCharacter = () => {
    switch (variant) {
      case "robot":
        return <Robot state={state} audioLevel={audioLevel} />;
      case "dino":
        return <Dino state={state} audioLevel={audioLevel} />;
      case "blob":
      default:
        return <Blob state={state} audioLevel={audioLevel} />;
    }
  };

  return (
    <div className={className} style={{ width: size, height: size }}>
      <svg
        viewBox="0 0 100 100"
        width={size}
        height={size}
        style={{ overflow: "visible" }}
      >
        {renderCharacter()}
      </svg>
    </div>
  );
}
