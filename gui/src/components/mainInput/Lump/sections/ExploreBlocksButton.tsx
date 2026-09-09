import { BlockType } from "@continuedev/config-yaml";
import { PlusIcon } from "@heroicons/react/24/outline";
import { useContext } from "react";
import { GhostButton } from "../../..";
import { IdeMessengerContext } from "../../../../context/IdeMessenger";
import { fontSize } from "../../../../util";

// Every profile is local here - no hub to explore blocks on, so this always
// adds a block to the local workspace config.
export function ExploreBlocksButton(props: { blockType: string }) {
  const ideMessenger = useContext(IdeMessengerContext);

  const text = `Add ${
    props.blockType === "mcpServers"
      ? "MCP Servers"
      : props.blockType.charAt(0).toUpperCase() + props.blockType.slice(1)
  }`;

  const handleClick = () => {
    ideMessenger.request("config/addLocalWorkspaceBlock", {
      blockType: props.blockType as BlockType,
    });
  };

  return (
    <GhostButton
      className="w-full cursor-pointer rounded px-2 py-0.5 text-center text-gray-400 hover:text-gray-300"
      style={{
        fontSize: fontSize(-3),
      }}
      onClick={(e) => {
        e.preventDefault();
        handleClick();
      }}
    >
      <div className="flex items-center justify-center gap-1">
        <PlusIcon className="h-3 w-3 pr-1" />
        <span className="text-[11px]">{text}</span>
      </div>
    </GhostButton>
  );
}
