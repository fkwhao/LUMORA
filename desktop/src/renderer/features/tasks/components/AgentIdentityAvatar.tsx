import type { CSSProperties } from "react";

const AGENT_TONES = [
  "#4f72e8",
  "#d58a24",
  "#9a62d3",
  "#db6658",
  "#258ba2",
  "#729b3b",
  "#c95d8b",
  "#61738f",
] as const;

type AgentAvatarStyle = CSSProperties & {
  "--agent-accent": string;
};

interface AgentIdentityAvatarProps {
  agentId: string;
  className?: string;
}

export function AgentIdentityAvatar({
  agentId,
  className,
}: AgentIdentityAvatarProps) {
  const toneIndex = identityHash(agentId) % AGENT_TONES.length;
  const tone = AGENT_TONES[toneIndex]!;
  const style: AgentAvatarStyle = {
    "--agent-accent": tone,
  };

  return (
    <span
      className={`agent-identity-avatar${className ? ` ${className}` : ""}`}
      data-agent-tone={toneIndex}
      style={style}
      aria-hidden="true"
    />
  );
}

function identityHash(value: string): number {
  let hash = 0;
  for (const character of value) {
    hash = (hash * 31 + character.codePointAt(0)!) >>> 0;
  }
  return hash;
}
