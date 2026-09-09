import { ConfigYaml } from "@continuedev/config-yaml";
import { PencilIcon } from "@heroicons/react/24/outline";
import { useContext } from "react";
import { IdeMessengerContext } from "../../../context/IdeMessenger";

type SectionKey = Exclude<
  keyof ConfigYaml,
  "name" | "version" | "schema" | "metadata"
>;

interface EditBlockButtonProps<T extends SectionKey> {
  blockType: T;
  block?: NonNullable<ConfigYaml[T]>[number];
  className?: string;
}

// Every profile is local here - no hub sync, so no hub-hosted block to edit
// elsewhere. Always just opens the file.
export default function EditBlockButton<T extends SectionKey>({
  className = "",
}: EditBlockButtonProps<T>) {
  const ideMessenger = useContext(IdeMessengerContext);

  const handleEdit = () => {
    ideMessenger.post("config/openProfile", { profileId: undefined });
  };

  return (
    <PencilIcon
      className={`h-3 w-3 cursor-pointer text-gray-400 hover:brightness-125 ${className}`}
      onClick={handleEdit}
    />
  );
}
