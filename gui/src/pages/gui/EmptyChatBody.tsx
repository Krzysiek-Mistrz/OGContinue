import { ConversationStarterCards } from "../../components/ConversationStarters";
import { PlatformOnboardingCard } from "../../components/OnboardingCard/platform/PlatformOnboardingCard";

export interface EmptyChatBodyProps {
  showOnboardingCard?: boolean;
}

export function EmptyChatBody({ showOnboardingCard }: EmptyChatBodyProps) {
  if (showOnboardingCard) {
    return (
      <div className="mx-2 mt-6">
        <PlatformOnboardingCard isDialog={false} />
      </div>
    );
  }

  return (
    <div className="mx-2 mt-2">
      <ConversationStarterCards />
    </div>
  );
}
