import { getMarkdownLanguageTagForFile } from "core/util";
import StyledMarkdownPreview from "../../../components/StyledMarkdownPreview";

type EditToolCallProps = {
  relativeFilePath: string;
  changes: string;
  toolCallId?: string;
  historyIndex: number;
};

// editToolImpl applies directly now, no apply-state/streamId needed, same as CreateFile
export function EditFile(props: EditToolCallProps) {
  const src = `\`\`\`${getMarkdownLanguageTagForFile(props.relativeFilePath ?? "test.txt")} ${props.relativeFilePath}\n${props.changes ?? ""}\n\`\`\``;

  return props.relativeFilePath ? (
    <StyledMarkdownPreview
      isRenderingInStepContainer
      disableManualApply
      source={src}
      expandCodeblocks={false}
      itemIndex={props.historyIndex}
    />
  ) : null;
}
