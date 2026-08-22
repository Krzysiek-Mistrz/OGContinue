import { CheckIcon, ClipboardIcon } from "@heroicons/react/24/outline";
import HeaderButtonWithToolTip from "./HeaderButtonWithToolTip";
import useCopy from "../../hooks/useCopy";

interface CopyIconButtonProps {
  text: string | (() => string);
  tabIndex?: number;
  checkIconClassName?: string;
  clipboardIconClassName?: string;
  tooltipPlacement?: "top" | "bottom";
  tooltipText?: string;
}

export function CopyIconButton({
  text,
  tabIndex,
  checkIconClassName = "h-4 w-4 text-green-400",
  clipboardIconClassName = "h-4 w-4 text-gray-400",
  tooltipPlacement = "bottom",
  tooltipText = "Copy",
}: CopyIconButtonProps) {
  const { copyText, copied } = useCopy(text);

  return (
    <>
      <HeaderButtonWithToolTip
        tooltipPlacement={tooltipPlacement}
        tabIndex={tabIndex}
        text={copied ? "Copied" : tooltipText}
        onClick={copyText}
      >
        {copied ? (
          <CheckIcon className={checkIconClassName} />
        ) : (
          <ClipboardIcon className={clipboardIconClassName} />
        )}
      </HeaderButtonWithToolTip>
    </>
  );
}
